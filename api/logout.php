<?php

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Only POST requests are allowed.', 405, 'method_not_allowed');
}

$user = require_auth();
$token = bearer_token();
if ($token) {
    $statement = db()->prepare('DELETE FROM auth_tokens WHERE token_hash = :token_hash');
    $statement->execute(['token_hash' => hash('sha256', $token)]);
}

audit_log((int) $user['id'], 'logout', 'user', (int) $user['id']);
respond(['success' => true]);
