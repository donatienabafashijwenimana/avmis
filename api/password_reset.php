<?php

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Only POST requests are allowed.', 405, 'method_not_allowed');
}

$data = request_body();
$action = (string) ($data['action'] ?? 'request');

if ($action === 'request') {
    $email = strtolower(trim((string) ($data['email'] ?? '')));
    validate_email_value($email);

    // Always return the same response whether or not the email exists.
    $statement = db()->prepare(
        "SELECT id, name, email FROM users
         WHERE LOWER(email) = LOWER(:email) AND status = 'Active'
         LIMIT 1"
    );
    $statement->execute(['email' => $email]);
    $user = $statement->fetch();

    if ($user) {
        $rawToken = bin2hex(random_bytes(32));
        // Store and compare reset-token timestamps in UTC. PHP and MySQL can
        // have different default timezones, which otherwise makes a newly
        // issued token appear expired immediately.
        $expiresAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
            ->modify('+' . (int) $config['password_reset_minutes'] . ' minutes')
            ->format('Y-m-d H:i:s');

        db()->prepare('DELETE FROM password_reset_tokens WHERE user_id = :user_id OR expires_at <= UTC_TIMESTAMP()')
            ->execute(['user_id' => (int) $user['id']]);
        db()->prepare(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES (:user_id, :token_hash, :expires_at)'
        )->execute([
            'user_id' => (int) $user['id'],
            'token_hash' => hash('sha256', $rawToken),
            'expires_at' => $expiresAt,
        ]);

        $resetUrl = $config['app_url'] . '/reset-password?token=' . rawurlencode($rawToken);
        $message = "Hello {$user['name']},\n\n"
            . "Someone requested a password reset for your Automated Voting System account.\n\n"
            . "Reset your password using this link (it expires in {$config['password_reset_minutes']} minutes):\n"
            . "{$resetUrl}\n\n"
            . "If you did not request this, you can ignore this email.\n\n"
            . "Automated Voting System";
        send_notification_email($user['email'], 'Reset your Automated Voting System password', $message);
    }

    respond([
        'success' => true,
        'message' => 'If an active account uses that email, a password reset link has been sent.',
    ]);
}

if ($action !== 'reset') {
    fail('Invalid password reset action.', 422, 'invalid_action');
}

$token = trim((string) ($data['token'] ?? ''));
$password = (string) ($data['password'] ?? '');
if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
    fail('This password reset link is invalid or has expired.', 400, 'invalid_reset_token');
}
validate_password_value($password);

$connection = db();
$connection->beginTransaction();
try {
    $statement = $connection->prepare(
        'SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
         LIMIT 1 FOR UPDATE'
    );
    $statement->execute(['token_hash' => hash('sha256', $token)]);
    $resetToken = $statement->fetch();
    if (!$resetToken) {
        $connection->rollBack();
        fail('This password reset link is invalid or has expired.', 400, 'invalid_reset_token');
    }

    $connection->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id')
        ->execute([
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'id' => (int) $resetToken['user_id'],
        ]);
    $connection->prepare('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = :id')
        ->execute(['id' => (int) $resetToken['id']]);
    // Invalidate existing sessions after the password changes.
    $connection->prepare('DELETE FROM auth_tokens WHERE user_id = :user_id')
        ->execute(['user_id' => (int) $resetToken['user_id']]);
    $connection->commit();

    audit_log((int) $resetToken['user_id'], 'password_reset', 'user', (int) $resetToken['user_id']);
    respond([
        'success' => true,
        'message' => 'Your password has been reset. You can now log in with the new password.',
    ]);
} catch (Throwable $exception) {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }
    throw $exception;
}
