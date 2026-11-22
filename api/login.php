<?php

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Only POST requests are allowed.', 405, 'method_not_allowed');
}

$data = request_body();
$identifier = trim((string) ($data['identifier'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($identifier === '' || $password === '') {
    fail('Username or email and password are required.', 422, 'missing_credentials');
}

$statement = db()->prepare(
    'SELECT u.id, u.username, v.voter_id, u.name, u.email, u.password_hash, u.role,
            c.id AS candidate_id, c.national_id AS candidate_national_id,
            u.polling_district, u.status,
            COALESCE(NULLIF(u.id_photo, \'\'), c.photo) AS id_photo,
            COALESCE(v.national_id_document, c.national_id_document) AS national_id_document
     FROM users u
     LEFT JOIN voter v ON v.user_id = u.id
     LEFT JOIN candidates c ON c.user_id = u.id
     WHERE u.username = :username
        OR LOWER(u.email) = LOWER(:email)
        OR v.voter_id = :voter_id
     LIMIT 1'
);
$statement->execute([
    'username' => $identifier,
    'email' => $identifier,
    'voter_id' => $identifier,
]);
$user = $statement->fetch();

if (!$user || $user['status'] !== 'Active' || !password_verify($password, $user['password_hash'])) {
    fail('Invalid credentials or inactive account.', 401, 'invalid_credentials');
}

$rawToken = bin2hex(random_bytes(32));
$expiresAt = (new DateTimeImmutable('now'))
    ->modify('+' . (int) $config['token_days'] . ' days')
    ->format('Y-m-d H:i:s');
$tokenStatement = db()->prepare(
    'INSERT INTO auth_tokens (user_id, token_hash, expires_at)
     VALUES (:user_id, :token_hash, :expires_at)'
);
$tokenStatement->bindValue(':user_id', (int) $user['id'], PDO::PARAM_INT);
$tokenStatement->bindValue(':token_hash', hash('sha256', $rawToken));
$tokenStatement->bindValue(':expires_at', $expiresAt);
$tokenStatement->execute();

$responseUser = public_user($user);
$responseUser['votedPositions'] = [];
if ($user['role'] === 'voter') {
    $votes = db()->prepare(
        'SELECT p.name AS position, v.candidate_id
         FROM votes v
         INNER JOIN voter vr ON vr.id = v.voter_id
         INNER JOIN elections e ON e.id = v.election_id
         INNER JOIN positions p ON p.id = e.position_id
         WHERE vr.user_id = :user_id'
    );
    $votes->execute(['user_id' => (int) $user['id']]);
    foreach ($votes->fetchAll() as $vote) {
        $responseUser['votedPositions'][$vote['position']] = (int) $vote['candidate_id'];
    }
}

respond([
    'success' => true,
    'token' => $rawToken,
    'user' => $responseUser,
]);
