<?php

require __DIR__ . '/bootstrap.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    respond(['success' => true, 'user' => public_user($user)]);
}

if ($method !== 'PUT') {
    fail('Only GET and PUT requests are allowed.', 405, 'method_not_allowed');
}

$data = request_body();
$name = validate_person_name_value((string) ($data['name'] ?? ''), 'Full name');
$email = strtolower(trim((string) ($data['email'] ?? '')));
validate_email_value($email);

$idPhoto = array_key_exists('idPhoto', $data)
    ? (string) $data['idPhoto']
    : (string) ($user['id_photo'] ?? '');
validate_image_value($idPhoto, 'Profile photo');

$nationalIdDocument = array_key_exists('nationalIdDocument', $data)
    ? (string) $data['nationalIdDocument']
    : (string) ($user['national_id_document'] ?? '');
if ($user['role'] !== 'admin' && $nationalIdDocument === '') {
    fail('National ID document is required.', 422, 'validation_failed');
}
if ($nationalIdDocument !== '') {
    validate_image_value($nationalIdDocument, 'National ID document');
}

$fields = [
    'name' => $name,
    'email' => $email,
    'id_photo' => $idPhoto,
    'id' => (int) $user['id'],
];
$set = 'name = :name, email = :email, id_photo = :id_photo';

$connection = db();
$connection->beginTransaction();
try {
    $connection->prepare("UPDATE users SET {$set} WHERE id = :id")
        ->execute($fields);

    if ($user['role'] === 'voter') {
        $connection->prepare('UPDATE voter SET national_id_document = :document WHERE user_id = :user_id')
            ->execute(['document' => $nationalIdDocument, 'user_id' => (int) $user['id']]);
    } elseif ($user['role'] === 'candidate') {
        $connection->prepare(
            'UPDATE candidates SET photo = :photo, national_id_document = :document
             WHERE user_id = :user_id'
        )->execute([
            'photo' => $idPhoto,
            'document' => $nationalIdDocument,
            'user_id' => (int) $user['id'],
        ]);
    }
    $connection->commit();
} catch (PDOException $exception) {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }
    fail('That email address is already in use.', 409, 'duplicate_email');
} catch (Throwable $exception) {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }
    throw $exception;
}

$updatedUser = current_user();
audit_log((int) $user['id'], 'updated_profile', 'user', (int) $user['id']);
respond(['success' => true, 'user' => public_user($updatedUser ?: $user)]);
