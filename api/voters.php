<?php

require __DIR__ . '/bootstrap.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

if ($method === 'GET') {
    if ($user['role'] !== 'admin' && (!$id || $id !== (int) $user['id'])) {
        fail('Only administrators can list voters or view another voter.', 403, 'forbidden');
    }
    if ($id) {
        $voter = voter_profile($id);
        if (!$voter) {
            fail('Voter not found.', 404, 'not_found');
        }
        respond(['success' => true, 'voter' => $voter]);
    }

    $rows = db()->query(
        'SELECT u.id FROM users u INNER JOIN voter v ON v.user_id = u.id
         WHERE u.role = \'voter\' ORDER BY u.name'
    )->fetchAll();
    $voters = [];
    foreach ($rows as $row) {
        $voters[] = voter_profile((int) $row['id']);
    }
    respond(['success' => true, 'voters' => $voters]);
}

if ($user['role'] !== 'admin' && !($method === 'PUT' && $id === (int) $user['id'])) {
    fail('Only administrators can manage voters.', 403, 'forbidden');
}

if ($method === 'POST') {
    $data = request_body();
    foreach (['voterId', 'name', 'email', 'password', 'pollingDistrict', 'nationalIdDocument'] as $field) {
        if (trim((string) ($data[$field] ?? '')) === '') {
            fail("{$field} is required.", 422, 'validation_failed');
        }
    }
    $voterId = trim((string) $data['voterId']);
    if (!preg_match('/^1[12]\d{14}$/', $voterId)) {
        fail('National ID must start with 11 or 12 and contain exactly 16 digits.', 422, 'invalid_national_id');
    }
    $voterName = validate_person_name_value((string) $data['name'], 'Full name');
    $voterDistrict = validate_text_value((string) $data['pollingDistrict'], 'Polling district', 100);
    validate_email_value(strtolower(trim((string) $data['email'])));
    validate_password_value((string) $data['password']);
    $idPhoto = (string) ($data['idPhoto'] ?? '');
    if ($idPhoto === '') {
        fail('ID photo is required.', 422, 'validation_failed');
    }
    validate_image_value($idPhoto, 'ID photo');
    $nationalIdDocument = (string) $data['nationalIdDocument'];
    validate_image_value($nationalIdDocument, 'National ID document');

    $statement = db()->prepare(
        'INSERT INTO users (name, email, password_hash, role, polling_district, status, id_photo)
         VALUES (:name, :email, :password_hash, \'voter\', :polling_district, :status, :id_photo)'
    );
    try {
        $statement->execute([
            'name' => $voterName,
            'email' => strtolower(trim($data['email'])),
            'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT),
            'polling_district' => $voterDistrict,
            'status' => ($data['status'] ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active',
            'id_photo' => $idPhoto,
        ]);
    } catch (PDOException $exception) {
        fail('Voter ID or email already exists.', 409, 'duplicate_voter');
    }

    $createdId = (int) db()->lastInsertId();
    $voterStatement = db()->prepare(
        'INSERT INTO voter (user_id, voter_id, national_id_document)
         VALUES (:user_id, :voter_id, :national_id_document)'
    );
    try {
        $voterStatement->execute([
            'user_id' => $createdId,
            'voter_id' => $voterId,
            'national_id_document' => $nationalIdDocument,
        ]);
    } catch (PDOException $exception) {
        db()->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $createdId]);
        fail('Voter ID or email already exists.', 409, 'duplicate_voter');
    }
    sync_voter_profile($createdId);
    audit_log((int) $user['id'], 'created', 'voter', $createdId, ['email' => strtolower(trim($data['email']))]);
    respond(['success' => true, 'voter' => voter_profile($createdId)], 201);
}

if (!$id) {
    fail('A voter ID is required.', 422, 'missing_id');
}

if ($method === 'PUT') {
    $data = request_body();
    $existing = voter_profile($id);
    if (!$existing) {
        fail('Voter not found.', 404, 'not_found');
    }
    $isSelfUpdate = $user['role'] !== 'admin';
    if (!$isSelfUpdate && count($data) === 1 && array_key_exists('status', $data)) {
        $status = ($data['status'] ?? '') === 'Inactive' ? 'Inactive' : (($data['status'] ?? '') === 'Active' ? 'Active' : '');
        if ($status === '') {
            fail('Voter status must be Active or Inactive.', 422, 'validation_failed');
        }
        db()->prepare('UPDATE users SET status = :status WHERE id = :id AND role = \'voter\'')
            ->execute(['status' => $status, 'id' => $id]);
        if ($status === 'Inactive') {
            db()->prepare('DELETE FROM auth_tokens WHERE user_id = :user_id')->execute(['user_id' => $id]);
        }
        audit_log((int) $user['id'], strtolower($status) === 'active' ? 'activated' : 'deactivated', 'voter', $id);
        respond(['success' => true, 'voter' => voter_profile($id)]);
    }
    $idPhoto = array_key_exists('idPhoto', $data) ? (string) $data['idPhoto'] : (string) ($existing['idPhoto'] ?? '');
    validate_image_value($idPhoto, 'ID photo');
    $nationalIdDocument = array_key_exists('nationalIdDocument', $data)
        ? (string) $data['nationalIdDocument']
        : (string) ($existing['nationalIdDocument'] ?? '');
    if ($nationalIdDocument === '') {
        fail('National ID document is required.', 422, 'validation_failed');
    }
    validate_image_value($nationalIdDocument, 'National ID document');
    $fields = [
        'voter_id' => $isSelfUpdate ? (string) $existing['voterId'] : trim((string) ($data['voterId'] ?? '')),
        'name' => validate_person_name_value((string) ($data['name'] ?? ''), 'Full name'),
        'email' => strtolower(trim((string) ($data['email'] ?? ''))),
        'polling_district' => $isSelfUpdate ? (string) $existing['pollingDistrict'] : validate_text_value((string) ($data['pollingDistrict'] ?? ''), 'Polling district', 100),
        'status' => $isSelfUpdate ? (string) $existing['status'] : (($data['status'] ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active'),
        'id_photo' => $idPhoto,
        'national_id_document' => $nationalIdDocument,
    ];
    if ($fields['name'] === '' || $fields['polling_district'] === '') {
        fail('Name and polling district are required.', 422, 'validation_failed');
    }
    if (!preg_match('/^1[12]\d{14}$/', $fields['voter_id'])) {
        fail('National ID must start with 11 or 12 and contain exactly 16 digits.', 422, 'invalid_national_id');
    }
    validate_email_value($fields['email']);
    if (!empty($data['password'])) {
        validate_password_value((string) $data['password']);
    }
    $set = 'name = :name, email = :email,
            polling_district = :polling_district, status = :status, id_photo = :id_photo';
    if (!empty($data['password'])) {
        $set .= ', password_hash = :password_hash';
        $fields['password_hash'] = password_hash($data['password'], PASSWORD_DEFAULT);
    }

    $connection = db();
    $connection->beginTransaction();
    try {
        $statement = $connection->prepare("UPDATE users SET {$set} WHERE id = :id AND role = 'voter'");
        $userFields = [
            'name' => $fields['name'],
            'email' => $fields['email'],
            'polling_district' => $fields['polling_district'],
            'status' => $fields['status'],
            'id_photo' => $fields['id_photo'],
            'id' => $id,
        ];
        if (isset($fields['password_hash'])) {
            $userFields['password_hash'] = $fields['password_hash'];
        }
        $statement->execute($userFields);
        $voterStatement = $connection->prepare(
            'UPDATE voter SET voter_id = :voter_id, national_id_document = :national_id_document
             WHERE user_id = :user_id'
        );
        $voterStatement->execute([
            'voter_id' => $fields['voter_id'],
            'national_id_document' => $fields['national_id_document'],
            'user_id' => $id,
        ]);
        $connection->commit();
    } catch (PDOException $exception) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        fail('Voter ID or email already exists.', 409, 'duplicate_voter');
    }

    sync_voter_profile($id);
    audit_log((int) $user['id'], $isSelfUpdate ? 'updated_profile' : 'updated', 'voter', $id, ['status' => $fields['status']]);
    $voter = voter_profile($id);
    if (!$voter) {
        fail('Voter not found.', 404, 'not_found');
    }
    respond(['success' => true, 'voter' => $voter]);
}

if ($method === 'DELETE') {
    $connection = db();
    $voterStatement = $connection->prepare(
        'SELECT v.id, u.name, COUNT(vo.id) AS vote_count
         FROM voter v
         INNER JOIN users u ON u.id = v.user_id
         LEFT JOIN votes vo ON vo.voter_id = v.id
         WHERE v.user_id = :user_id AND u.role = \'voter\'
         GROUP BY v.id, u.name
         LIMIT 1'
    );
    $voterStatement->execute(['user_id' => $id]);
    $voter = $voterStatement->fetch();
    if (!$voter) {
        fail('Voter not found.', 404, 'not_found');
    }
    if ((int) $voter['vote_count'] > 0) {
        fail('This voter has recorded votes and cannot be permanently deleted. Deactivate the account instead.', 409, 'voter_has_votes');
    }
    $connection->beginTransaction();
    try {
        $connection->prepare('DELETE FROM auth_tokens WHERE user_id = :user_id')->execute(['user_id' => $id]);
        $connection->prepare('DELETE FROM voter WHERE user_id = :user_id')->execute(['user_id' => $id]);
        $connection->prepare('DELETE FROM users WHERE id = :id AND role = \'voter\'')->execute(['id' => $id]);
        $connection->commit();
    } catch (Throwable $exception) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        throw $exception;
    }
    audit_log((int) $user['id'], 'deleted', 'voter', $id, ['reason' => 'no_votes', 'name' => $voter['name']]);
    respond(['success' => true, 'deleted' => true, 'message' => 'Voter account permanently deleted because no votes had been recorded.']);
}

fail('Method not allowed.', 405, 'method_not_allowed');
