<?php

require __DIR__ . '/bootstrap.php';

$user = require_auth();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Only POST requests are allowed.', 405, 'method_not_allowed');
}

$data = request_body();
$currentPassword = (string) ($data['currentPassword'] ?? '');
$newPassword = (string) ($data['newPassword'] ?? '');
$confirmPassword = (string) ($data['confirmPassword'] ?? '');

if ($currentPassword === '') {
    fail('Current password is required.', 422, 'validation_failed');
}
if (!password_verify($currentPassword, (string) ($user['password_hash'] ?? ''))) {
    fail('The current password is incorrect.', 422, 'invalid_current_password');
}
validate_password_value($newPassword);
if ($newPassword !== $confirmPassword) {
    fail('New password and confirmation do not match.', 422, 'password_mismatch');
}
if (password_verify($newPassword, (string) ($user['password_hash'] ?? ''))) {
    fail('The new password must be different from the current password.', 422, 'same_password');
}

$statement = db()->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
$statement->execute([
    'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
    'id' => (int) $user['id'],
]);

audit_log((int) $user['id'], 'changed_password', 'user', (int) $user['id']);
respond(['success' => true, 'message' => 'Password changed successfully.']);
