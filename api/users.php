<?php

require __DIR__ . '/bootstrap.php';

$admin = require_auth('admin');
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

function admin_user_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'username' => $row['username'] ?? null,
        'voterId' => $row['voter_id'] ?? null,
        'name' => $row['name'],
        'email' => $row['email'],
        'role' => $row['role'],
        'candidateId' => $row['candidate_id'] !== null ? (int) $row['candidate_id'] : null,
        'pollingDistrict' => $row['polling_district'] ?? '',
        'status' => $row['status'],
        'idPhoto' => $row['id_photo'] ?? '',
        'nationalIdDocument' => $row['national_id_document'] ?? null,
    ];
}

function admin_user(int $id): ?array
{
    $statement = db()->prepare(
        'SELECT u.id, u.username, v.voter_id, u.name, u.email, u.role,
                c.id AS candidate_id, u.polling_district, u.status,
                COALESCE(NULLIF(u.id_photo, \'\'), c.photo) AS id_photo,
                COALESCE(v.national_id_document, c.national_id_document) AS national_id_document
         FROM users u
         LEFT JOIN voter v ON v.user_id = u.id
         LEFT JOIN candidates c ON c.user_id = u.id
         WHERE u.id = :id
         LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    $row = $statement->fetch();
    return $row ? admin_user_payload($row) : null;
}

if ($method === 'GET') {
    $rows = db()->query(
        'SELECT u.id, u.username, v.voter_id, u.name, u.email, u.role,
                c.id AS candidate_id, u.polling_district, u.status,
                COALESCE(NULLIF(u.id_photo, \'\'), c.photo) AS id_photo,
                COALESCE(v.national_id_document, c.national_id_document) AS national_id_document
         FROM users u
         LEFT JOIN voter v ON v.user_id = u.id
         LEFT JOIN candidates c ON c.user_id = u.id
         ORDER BY u.name, u.id'
    )->fetchAll();
    respond([
        'success' => true,
        'users' => array_map('admin_user_payload', $rows),
    ]);
}

if ($method !== 'PUT' || !$id) {
    fail('Only GET and PUT requests with a user ID are allowed.', 405, 'method_not_allowed');
}

$existing = admin_user($id);
if (!$existing) {
    fail('User not found.', 404, 'not_found');
}

$data = request_body();
$name = validate_person_name_value((string) ($data['name'] ?? ''), 'Full name');
$email = strtolower(trim((string) ($data['email'] ?? '')));
validate_email_value($email);
$status = (string) ($data['status'] ?? $existing['status']);
if (!in_array($status, ['Active', 'Inactive'], true)) {
    fail('User status must be Active or Inactive.', 422, 'validation_failed');
}
if ($id === (int) $admin['id'] && $status !== 'Active') {
    fail('You cannot deactivate your own administrator account.', 422, 'self_deactivation_forbidden');
}

$idPhoto = array_key_exists('idPhoto', $data)
    ? (string) $data['idPhoto']
    : (string) ($existing['idPhoto'] ?? '');
validate_image_value($idPhoto, 'Profile photo');
$nationalIdDocument = array_key_exists('nationalIdDocument', $data)
    ? (string) $data['nationalIdDocument']
    : (string) ($existing['nationalIdDocument'] ?? '');
if ($existing['role'] !== 'admin' && $nationalIdDocument === '') {
    fail('National ID document is required.', 422, 'validation_failed');
}
if ($nationalIdDocument !== '') {
    validate_image_value($nationalIdDocument, 'National ID document');
}

$fields = [
    'name' => $name,
    'email' => $email,
    'status' => $status,
    'id_photo' => $idPhoto,
    'id' => $id,
];
$set = 'name = :name, email = :email, status = :status, id_photo = :id_photo';
if (array_key_exists('pollingDistrict', $data) && $existing['role'] === 'voter') {
    $pollingDistrict = validate_text_value((string) $data['pollingDistrict'], 'Polling district', 100);
    $set .= ', polling_district = :polling_district';
    $fields['polling_district'] = $pollingDistrict;
}
if (!empty($data['password'])) {
    validate_password_value((string) $data['password']);
    $set .= ', password_hash = :password_hash';
    $fields['password_hash'] = password_hash((string) $data['password'], PASSWORD_DEFAULT);
}

$connection = db();
$connection->beginTransaction();
try {
    $connection->prepare("UPDATE users SET {$set} WHERE id = :id")
        ->execute($fields);
    if ($existing['role'] === 'voter') {
        sync_voter_profile($id);
    }
    if ($existing['role'] === 'candidate') {
        $connection->prepare(
            'UPDATE candidates SET photo = :photo, national_id_document = :document
             WHERE user_id = :user_id'
        )->execute(['photo' => $idPhoto, 'document' => $nationalIdDocument, 'user_id' => $id]);
    }
    if ($existing['role'] === 'voter') {
        $connection->prepare('UPDATE voter SET national_id_document = :document WHERE user_id = :user_id')
            ->execute(['document' => $nationalIdDocument, 'user_id' => $id]);
    }
    if ($status === 'Inactive') {
        $connection->prepare('DELETE FROM auth_tokens WHERE user_id = :user_id')
            ->execute(['user_id' => $id]);
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

audit_log((int) $admin['id'], 'updated', 'user', $id, ['status' => $status]);
respond([
    'success' => true,
    'user' => admin_user($id),
]);
