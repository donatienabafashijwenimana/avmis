<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
$autoload = __DIR__ . '/../vendor/autoload.php';
if (is_file($autoload)) {
    require_once $autoload;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',
];

if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
}
header('Vary: Origin');

header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Max-Age: 86400');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400, string $code = 'request_failed'): never
{
    respond(['success' => false, 'error' => $message, 'code' => $code], $status);
}

function close_expired_elections(): void
{
    $statement = db()->prepare(
        "UPDATE elections
         SET status = 'Closed'
         WHERE status IN ('Draft', 'Open', 'Suspended')
           AND voting_ends_at IS NOT NULL
           AND voting_ends_at <= NOW()"
    );
    $statement->execute();
}

function audit_log(?int $userId, string $action, string $entityType, ?int $entityId = null, array $details = []): void
{
    $statement = db()->prepare(
        'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES (:user_id, :action, :entity_type, :entity_id, :details)'
    );
    $statement->execute([
        'user_id' => $userId,
        'action' => $action,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
        'details' => $details ? json_encode($details, JSON_UNESCAPED_SLASHES) : null,
    ]);
}

function validate_image_value(string $value, string $field = 'image'): void
{
    if ($value === '') {
        return;
    }
    if (preg_match('#^data:image/(jpeg|png);base64,(.+)$#s', $value, $matches)) {
        $decoded = base64_decode($matches[2], true);
        $imageInfo = $decoded === false ? false : @getimagesizefromstring($decoded);
        $mime = is_array($imageInfo) ? ($imageInfo['mime'] ?? '') : '';
        if ($decoded === false || strlen($decoded) > 2 * 1024 * 1024 || !in_array($mime, ['image/jpeg', 'image/png'], true)) {
            fail("{$field} must be a valid JPEG/PNG image under 2MB.", 422, 'invalid_image');
        }
        return;
    }
    if (!filter_var($value, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $value)) {
        fail("{$field} must be a valid JPEG/PNG upload or image URL.", 422, 'invalid_image');
    }
}

function validate_email_value(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
        fail('A valid email address is required.', 422, 'invalid_email');
    }
}

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

function validate_text_value(string $value, string $field, int $maxLength = 255, bool $required = true): string
{
    $value = trim($value);
    if ($required && $value === '') {
        fail("{$field} is required.", 422, 'validation_failed');
    }
    if (preg_match('/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/', $value)) {
        fail("{$field} contains invalid characters.", 422, 'invalid_input');
    }
    if (text_length($value) > $maxLength) {
        fail("{$field} must be {$maxLength} characters or fewer.", 422, 'input_too_long');
    }
    return $value;
}

function validate_person_name_value(string $value, string $field = 'Name'): string
{
    $value = validate_text_value($value, $field, 120);
    if (text_length($value) < 2 || !preg_match("/^\\p{L}[\\p{L}\\p{M} .'-]*$/u", $value)) {
        fail("{$field} may contain letters, spaces, apostrophes, periods, and hyphens only.", 422, 'invalid_name');
    }
    return $value;
}

function validate_code_value(string $value, string $field = 'Code'): string
{
    $value = strtoupper(trim($value));
    if (!preg_match('/^[A-Z0-9][A-Z0-9_-]{1,31}$/', $value)) {
        fail("{$field} must be 2 to 32 letters, numbers, hyphens, or underscores.", 422, 'invalid_code');
    }
    return $value;
}

function smtp_response($socket): array
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') {
            break;
        }
    }
    if ($response === '') {
        throw new RuntimeException('SMTP server closed the connection.');
    }
    return [(int) substr($response, 0, 3), trim($response)];
}

function smtp_command($socket, string $command, array $expectedCodes): void
{
    if (fwrite($socket, $command . "\r\n") === false) {
        throw new RuntimeException('Could not write to the SMTP server.');
    }
    [$code, $response] = smtp_response($socket);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException("SMTP error {$code}: {$response}");
    }
}

function send_smtp_email(string $to, string $subject, string $message): bool
{
    global $config;
    $host = (string) ($config['smtp_host'] ?? '');
    $port = (int) ($config['smtp_port'] ?? 587);
    $username = (string) ($config['smtp_username'] ?? '');
    $password = (string) ($config['smtp_password'] ?? '');
    $from = (string) ($config['smtp_from'] ?? '');

    if ($host === '' || $username === '' || $password === '' || $from === '') {
        return false;
    }
    if (preg_match('/[\r\n]/', $to . $subject . $from)) {
        throw new RuntimeException('SMTP message contains invalid header characters.');
    }

    $context = stream_context_create();
    $socket = @stream_socket_client(
        "tcp://{$host}:{$port}",
        $errorNumber,
        $errorMessage,
        15,
        STREAM_CLIENT_CONNECT,
        $context
    );
    if (!$socket) {
        throw new RuntimeException("Could not connect to SMTP server: {$errorMessage}");
    }
    stream_set_timeout($socket, 15);

    try {
        [$code, $response] = smtp_response($socket);
        if ($code !== 220) {
            throw new RuntimeException("SMTP error {$code}: {$response}");
        }
        smtp_command($socket, 'EHLO localhost', [250]);
        smtp_command($socket, 'STARTTLS', [220]);
        $cryptoEnabled = @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        if ($cryptoEnabled !== true) {
            throw new RuntimeException('Could not enable TLS for the SMTP connection.');
        }
        smtp_command($socket, 'EHLO localhost', [250]);
        smtp_command($socket, 'AUTH LOGIN', [334]);
        smtp_command($socket, base64_encode($username), [334]);
        smtp_command($socket, base64_encode($password), [235]);
        smtp_command($socket, "MAIL FROM:<{$from}>", [250]);
        smtp_command($socket, "RCPT TO:<{$to}>", [250, 251]);
        smtp_command($socket, 'DATA', [354]);

        $normalizedMessage = preg_replace('/\r\n|\r|\n/', "\r\n", $message);
        $bodyLines = explode("\r\n", (string) $normalizedMessage);
        $bodyLines = array_map(static fn (string $line): string => str_starts_with($line, '.') ? '.' . $line : $line, $bodyLines);
        $email = "From: {$from}\r\n"
            . "To: {$to}\r\n"
            . "Subject: {$subject}\r\n"
            . "MIME-Version: 1.0\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n\r\n"
            . implode("\r\n", $bodyLines) . "\r\n.\r\n";
        if (fwrite($socket, $email) === false) {
            throw new RuntimeException('Could not send the SMTP message.');
        }
        [$code, $response] = smtp_response($socket);
        if ($code !== 250) {
            throw new RuntimeException("SMTP error {$code}: {$response}");
        }
        smtp_command($socket, 'QUIT', [221, 250]);
        fclose($socket);
        return true;
    } catch (Throwable $exception) {
        fclose($socket);
        throw $exception;
    }
}

function send_mailtrap_api_email(string $to, string $subject, string $message): bool
{
    global $config;
    $apiKey = (string) ($config['mailtrap_api_key'] ?? '');
    $useSandbox = (bool) ($config['mailtrap_use_sandbox'] ?? false);
    $inboxId = (int) ($config['mailtrap_inbox_id'] ?? 0);
    $from = (string) ($config['mailtrap_from'] ?? '');

    if ($apiKey === '' || $from === '') {
        return false;
    }
    if ($useSandbox && $inboxId < 1) {
        throw new RuntimeException('VOTING_MAILTRAP_INBOX_ID is required when Mailtrap Sandbox mode is enabled.');
    }
    if (preg_match('/[\r\n]/', $to . $subject . $from)) {
        throw new RuntimeException('Mailtrap message contains invalid header characters.');
    }

    $endpoint = $useSandbox
        ? "https://sandbox.api.mailtrap.io/api/send/{$inboxId}"
        : 'https://send.api.mailtrap.io/api/send';
    $payload = json_encode([
        'from' => ['email' => $from],
        'to' => [['email' => $to]],
        'subject' => $subject,
        'text' => $message,
        'category' => 'Password Reset',
    ], JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        throw new RuntimeException('Could not encode the Mailtrap email.');
    }

    $curl = curl_init($endpoint);
    if ($curl === false) {
        throw new RuntimeException('Could not initialize the Mailtrap API client.');
    }
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Api-Token: ' . $apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    if ($response === false) {
        throw new RuntimeException('Mailtrap API request failed: ' . ($curlError ?: 'unknown cURL error'));
    }
    if ($status < 200 || $status >= 300) {
        throw new RuntimeException("Mailtrap API returned HTTP {$status}: " . substr((string) $response, 0, 500));
    }
    return true;
}

function send_brevo_api_email(string $to, string $subject, string $message): bool
{
    global $config;
    $apiKey = (string) ($config['brevo_api_key'] ?? '');
    $from = (string) ($config['brevo_from'] ?? '');

    if ($apiKey === '' || $from === '') {
        return false;
    }
    if (preg_match('/[\r\n]/', $to . $subject . $from)) {
        throw new RuntimeException('Brevo message contains invalid header characters.');
    }

    $payload = json_encode([
        'sender' => [
            'name' => 'Automated Voting System',
            'email' => $from,
        ],
        'to' => [['email' => $to]],
        'subject' => $subject,
        'textContent' => $message,
    ], JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        throw new RuntimeException('Could not encode the Brevo email.');
    }

    $curl = curl_init('https://api.brevo.com/v3/smtp/email');
    if ($curl === false) {
        throw new RuntimeException('Could not initialize the Brevo API client.');
    }
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'api-key: ' . $apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    if ($response === false) {
        throw new RuntimeException('Brevo API request failed: ' . ($curlError ?: 'unknown cURL error'));
    }
    if ($status < 200 || $status >= 300) {
        throw new RuntimeException("Brevo API returned HTTP {$status}: " . substr((string) $response, 0, 500));
    }
    return true;
}

function send_notification_email(string $to, string $subject, string $message): bool
{
    global $config;
    if (!class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
        error_log('Voting System email failed: install dependencies with composer install.');
        return false;
    }

    try {
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = (string) ($config['smtp_host'] ?? '');
        $mail->SMTPAuth = true;
        $mail->Username = (string) ($config['smtp_username'] ?? '');
        $mail->Password = (string) ($config['smtp_password'] ?? '');
        $mail->Port = (int) ($config['smtp_port'] ?? 587);
        $mail->SMTPSecure = (string) ($config['smtp_encryption'] ?? 'tls') === 'ssl'
            ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->CharSet = 'UTF-8';
        $mail->setFrom((string) ($config['smtp_from'] ?? ''), 'Automated Voting System');
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->isHTML(false);
        $mail->Body = $message;
        $mail->send();
        return true;
    } catch (Throwable $exception) {
        error_log('Voting System PHPMailer email failed: ' . $exception->getMessage());
        return false;
    }
}

function validate_password_value(string $password): void
{
    if (strlen($password) < 8
        || !preg_match('/[A-Z]/', $password)
        || !preg_match('/[0-9]/', $password)
        || !preg_match('/[!@#$%^&*(),.?":{}|<>]/', $password)) {
        fail('Password must be at least 8 characters and include an uppercase letter, a number, and a special character.', 422, 'weak_password');
    }
}

function normalize_datetime_value(?string $value, string $field): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    $timestamp = strtotime($value);
    if ($timestamp === false) {
        fail("{$field} must be a valid date and time.", 422, 'invalid_datetime');
    }
    return date('Y-m-d H:i:s', $timestamp);
}

function request_body(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('Request body must be valid JSON.', 422, 'invalid_json');
    }

    return $data;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(\S+)$/i', $header, $matches)) {
        return $matches[1];
    }

    return null;
}

function public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'username' => $user['username'] ?? null,
        'voterId' => $user['voter_id'] ?? null,
        'candidateNationalId' => $user['candidate_national_id'] ?? null,
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'candidateId' => $user['candidate_id'] !== null ? (int) $user['candidate_id'] : null,
        'voteCount' => array_key_exists('vote_count', $user) ? (int) $user['vote_count'] : 0,
        'pollingDistrict' => $user['polling_district'],
        'status' => $user['status'],
        'idPhoto' => $user['id_photo'],
        'nationalIdDocument' => $user['national_id_document'] ?? null,
    ];
}

function current_user(): ?array
{
    $token = bearer_token();
    if (!$token) {
        return null;
    }

    $sql = <<<'SQL'
        SELECT u.id, u.username, v.voter_id, u.name, u.email, u.password_hash, u.role,
               c.id AS candidate_id, c.national_id AS candidate_national_id,
               u.polling_district, u.status,
               COALESCE(NULLIF(u.id_photo, ''), c.photo) AS id_photo,
               COALESCE(v.national_id_document, c.national_id_document) AS national_id_document
        FROM auth_tokens t
        INNER JOIN users u ON u.id = t.user_id
        LEFT JOIN voter v ON v.user_id = u.id
        LEFT JOIN candidates c ON c.user_id = u.id
        WHERE t.token_hash = :token_hash
          AND t.expires_at > NOW()
          AND u.status = 'Active'
        LIMIT 1
    SQL;
    $statement = db()->prepare($sql);
    $statement->execute(['token_hash' => hash('sha256', $token)]);
    $user = $statement->fetch();

    return $user ?: null;
}

function require_auth(?string $role = null): array
{
    $user = current_user();
    if (!$user) {
        fail('Authentication is required.', 401, 'unauthenticated');
    }

    if ($role !== null && $user['role'] !== $role) {
        fail('You do not have permission to perform this action.', 403, 'forbidden');
    }

    return $user;
}

function voter_profile(int $id): ?array
{
    $statement = db()->prepare(
        'SELECT u.id, u.username, v.voter_id, u.name, u.email, u.role, c.id AS candidate_id,
                COALESCE(d.name, u.polling_district) AS polling_district, u.status, u.id_photo,
                v.national_id_document,
                (SELECT COUNT(*) FROM votes vo WHERE vo.voter_id = v.id) AS vote_count
         FROM users u
         INNER JOIN voter v ON v.user_id = u.id
         LEFT JOIN polling_districts d ON d.id = v.polling_district_id
         LEFT JOIN candidates c ON c.user_id = u.id
         WHERE u.id = :id AND u.role = \'voter\' LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    $voter = $statement->fetch();
    return $voter ? public_user($voter) : null;
}

function sync_voter_profile(int $id): void
{
    $statement = db()->prepare(
        'INSERT INTO voter (user_id, polling_district_id)
         SELECT u.id, d.id FROM users u
         LEFT JOIN polling_districts d ON d.name = u.polling_district
         WHERE u.id = :id AND u.role = \'voter\'
         ON DUPLICATE KEY UPDATE polling_district_id = VALUES(polling_district_id)'
    );
    $statement->execute(['id' => $id]);
}
