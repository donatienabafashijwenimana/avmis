<?php

require __DIR__ . '/bootstrap.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

function candidate_row(int $id): ?array
{
    $statement = db()->prepare(
        'SELECT c.id, c.user_id, c.party_id, c.national_id, c.national_id_document, c.candidate_number, c.biography,
                c.photo, c.status,
                u.name, u.email, u.username, u.polling_district, pp.name AS party_name,
                a.position_id AS position_id, p.name AS position_name, p.category, p.criteria, p.required_documents,
                a.application_message AS application_message,
                a.status AS application_status,
                COUNT(v.id) AS votes,
                (SELECT COUNT(*) FROM applications all_applications WHERE all_applications.candidate_id = c.id) AS application_count
         FROM candidates c
         INNER JOIN users u ON u.id = c.user_id
         LEFT JOIN political_parties pp ON pp.id = c.party_id
        LEFT JOIN applications a ON a.id = (
            SELECT latest.id FROM applications latest
            WHERE latest.candidate_id = c.id AND latest.status = \'Approved\'
            ORDER BY latest.submitted_at DESC, latest.id DESC
            LIMIT 1
        )
        LEFT JOIN positions p ON p.id = a.position_id
         LEFT JOIN votes v ON v.candidate_id = c.id
         WHERE c.id = :id
         GROUP BY c.id, c.user_id, c.party_id, c.national_id, c.national_id_document, c.candidate_number, c.biography,
                  c.photo, c.status,
                  u.name, u.email, u.username, u.polling_district, pp.name, a.position_id, p.name, p.category, p.criteria, p.required_documents, a.application_message, a.status
         LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    return $statement->fetch() ?: null;
}

function candidate_payload(array $candidate, bool $includeVotes = true, bool $includeSensitive = false): array
{
    $payload = [
        'id' => (int) $candidate['id'],
        'userId' => (int) $candidate['user_id'],
        'name' => $candidate['name'],
        'email' => $candidate['email'],
        'username' => $candidate['username'],
        'pollingDistrict' => $candidate['polling_district'] ?? '',
        'party' => $candidate['party_name'] ?? '',
        'partyId' => $candidate['party_id'] !== null ? (int) $candidate['party_id'] : null,
        'position' => $candidate['position_name'] ?? '',
        'positionId' => $candidate['position_id'] !== null ? (int) $candidate['position_id'] : null,
        'candidateNumber' => $candidate['candidate_number'] ?? '',
        'biography' => $candidate['biography'] ?? '',
        'category' => $candidate['category'] ?? '',
        'photo' => $candidate['photo'],
        'applicationMessage' => $candidate['application_message'] ?? '',
        'status' => $candidate['status'],
        'applicationStatus' => $candidate['application_status'] ?? null,
        'applicationCount' => (int) ($candidate['application_count'] ?? 0),
        'criteria' => $candidate['criteria'] ?? '',
        'requiredDocuments' => $candidate['required_documents'] ?? '',
    ];

    if ($includeVotes) {
        $payload['votes'] = (int) $candidate['votes'];
    }
    if ($includeSensitive) {
        $payload['nationalId'] = $candidate['national_id'];
        $payload['nationalIdDocument'] = $candidate['national_id_document'] ?? null;
    }

    return $payload;
}

function get_candidate(int $id, bool $includeVotes = true, bool $includeSensitive = false): ?array
{
    $candidate = candidate_row($id);
    return $candidate ? candidate_payload($candidate, $includeVotes, $includeSensitive) : null;
}

function party_record(string $name): ?array
{
    $statement = db()->prepare(
        'SELECT id, name FROM political_parties WHERE name = :name AND status = \'Active\' LIMIT 1'
    );
    $statement->execute(['name' => trim($name)]);
    return $statement->fetch() ?: null;
}
if ($method === 'GET') {
    if ($user['role'] === 'candidate') {
        $candidateId = (int) ($user['candidate_id'] ?? 0);
        $candidate = $candidateId ? get_candidate($candidateId, false, true) : null;
        if (!$candidate) {
            fail('Candidate profile not found.', 404, 'not_found');
        }
        respond(['success' => true, 'candidates' => [$candidate]]);
    }

    $candidateFilter = $user['role'] === 'admin'
        ? ''
        : "WHERE c.status = 'Active' AND u.status = 'Active'
            AND EXISTS (
                SELECT 1 FROM applications approved_application
                WHERE approved_application.candidate_id = c.id
                  AND approved_application.status = 'Approved'
            )";
    $rows = db()->query(
        "SELECT c.id
         FROM candidates c
         INNER JOIN users u ON u.id = c.user_id
         {$candidateFilter}
         ORDER BY u.name"
    )->fetchAll(PDO::FETCH_COLUMN);
    $includeVotes = $user['role'] === 'admin';
    respond([
        'success' => true,
        'candidates' => array_values(array_filter(array_map(
            fn (string|int $candidateId): ?array => get_candidate((int) $candidateId, $includeVotes, $user['role'] === 'admin'),
            $rows
        ))),
    ]);
}

if ($user['role'] === 'candidate') {
    if ($method !== 'PUT' || !$id || $id !== (int) ($user['candidate_id'] ?? 0)) {
        fail('Candidates can only update their own profile.', 403, 'forbidden');
    }

    $data = request_body();
    validate_image_value((string) ($data['photo'] ?? ''), 'Candidate photo');

    $statement = db()->prepare(
        'UPDATE candidates SET photo = :photo WHERE id = :id'
    );
    $statement->execute([
        'id' => $id,
        'photo' => (string) ($data['photo'] ?? ''),
    ]);
    respond(['success' => true, 'candidate' => get_candidate($id, false, true)]);
}

if ($user['role'] !== 'admin') {
    fail('Only administrators can manage candidates.', 403, 'forbidden');
}

if ($method === 'POST') {
    $data = request_body();
    foreach (['username', 'name', 'email', 'password', 'party', 'nationalId', 'candidateNumber', 'biography'] as $field) {
        if (trim((string) ($data[$field] ?? '')) === '') {
            fail("{$field} is required.", 422, 'validation_failed');
        }
    }
    $username = trim((string) $data['username']);
    if (!preg_match('/^[A-Za-z0-9_-]{4,32}$/', $username)) {
        fail('Candidate username must be 4 to 32 letters, numbers, underscores, or hyphens.', 422, 'invalid_username');
    }
    $candidateName = validate_person_name_value((string) $data['name'], 'Candidate name');
    $candidateEmail = strtolower(trim((string) $data['email']));
    validate_email_value($candidateEmail);
    validate_password_value((string) $data['password']);
    $nationalId = trim((string) $data['nationalId']);
    if (!preg_match('/^1[12]\d{14}$/', $nationalId)) {
        fail('Candidate National ID must start with 11 or 12 and contain exactly 16 digits.', 422, 'invalid_national_id');
    }
    $candidateNumber = trim((string) $data['candidateNumber']);
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/', $candidateNumber)) {
        fail('Candidate number must be 1 to 32 letters, numbers, or hyphens.', 422, 'invalid_candidate_number');
    }
    $biography = validate_text_value((string) $data['biography'], 'Biography', 2000);
    $photo = (string) ($data['photo'] ?? '');
    if ($photo === '') {
        fail('Candidate photo is required.', 422, 'validation_failed');
    }
    validate_image_value($photo, 'Candidate photo');
    $nationalIdDocument = (string) ($data['nationalIdDocument'] ?? '');
    if ($nationalIdDocument === '') {
        fail('National ID document is required.', 422, 'validation_failed');
    }
    validate_image_value($nationalIdDocument, 'National ID document');
    $party = party_record((string) $data['party']);
    if (!$party) {
        fail('Select a valid political party.', 422, 'invalid_party');
    }

    $connection = db();
    $connection->beginTransaction();
    try {
        $userStatement = $connection->prepare(
            'INSERT INTO users (username, name, email, password_hash, role, polling_district, status, id_photo)
             VALUES (:username, :name, :email, :password_hash, \'candidate\', :polling_district, \'Active\', :id_photo)'
        );
        $userStatement->execute([
            'username' => $username,
            'name' => $candidateName,
            'email' => $candidateEmail,
            'password_hash' => password_hash((string) $data['password'], PASSWORD_DEFAULT),
            'polling_district' => 'National',
            'id_photo' => (string) ($data['photo'] ?? ''),
        ]);
        $userId = (int) $connection->lastInsertId();

        $candidateStatement = $connection->prepare(
            'INSERT INTO candidates
                (user_id, party_id, national_id, national_id_document, candidate_number, biography, photo)
             VALUES (:user_id, :party_id, :national_id, :national_id_document, :candidate_number, :biography, :photo)'
        );
        $candidateStatement->execute([
            'user_id' => $userId,
            'party_id' => (int) $party['id'],
            'national_id' => $nationalId,
            'national_id_document' => $nationalIdDocument,
            'candidate_number' => $candidateNumber,
            'biography' => $biography,
            'photo' => $photo,
        ]);
        $candidateId = (int) $connection->lastInsertId();
        $connection->commit();
    } catch (PDOException $exception) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        fail('That candidate number or account already exists.', 409, 'duplicate_candidate');
    } catch (Throwable $exception) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        throw $exception;
    }
    audit_log((int) $user['id'], 'created', 'candidate', $candidateId, ['name' => trim($data['name'])]);
    respond(['success' => true, 'candidate' => get_candidate($candidateId, true, true)], 201);
}

if (!$id) {
    fail('A candidate ID is required.', 422, 'missing_id');
}

if ($method === 'PUT') {
    $data = request_body();
    if (count($data) === 1 && array_key_exists('status', $data)) {
        $status = ($data['status'] ?? '') === 'Inactive' ? 'Inactive' : (($data['status'] ?? '') === 'Active' ? 'Active' : '');
        if ($status === '') {
            fail('Candidate status must be Active or Inactive.', 422, 'validation_failed');
        }
        $connection = db();
        $candidateStatement = $connection->prepare('SELECT user_id FROM candidates WHERE id = :id LIMIT 1');
        $candidateStatement->execute(['id' => $id]);
        $candidateUserId = $candidateStatement->fetchColumn();
        if ($candidateUserId === false) {
            fail('Candidate not found.', 404, 'not_found');
        }
        $connection->beginTransaction();
        try {
            $connection->prepare('UPDATE candidates SET status = :status WHERE id = :id')->execute(['status' => $status, 'id' => $id]);
            $connection->prepare('UPDATE users SET status = :status WHERE id = :id')->execute(['status' => $status, 'id' => (int) $candidateUserId]);
            if ($status === 'Inactive') {
                $connection->prepare('DELETE FROM auth_tokens WHERE user_id = :user_id')->execute(['user_id' => (int) $candidateUserId]);
            }
            $connection->commit();
        } catch (Throwable $exception) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $exception;
        }
        audit_log((int) $user['id'], strtolower($status) === 'active' ? 'activated' : 'deactivated', 'candidate', $id);
        respond(['success' => true, 'candidate' => get_candidate($id, true, true)]);
    }
    $name = validate_person_name_value((string) ($data['name'] ?? ''), 'Candidate name');
    $nationalId = trim((string) ($data['nationalId'] ?? ''));
    $candidateNumber = trim((string) ($data['candidateNumber'] ?? ''));
    $biography = trim((string) ($data['biography'] ?? ''));
    $photo = (string) ($data['photo'] ?? '');
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/', $candidateNumber)) {
        fail('Candidate number must be 1 to 32 letters, numbers, or hyphens.', 422, 'invalid_candidate_number');
    }
    if (!preg_match('/^1[12]\d{14}$/', $nationalId)) {
        fail('Candidate National ID must start with 11 or 12 and contain exactly 16 digits.', 422, 'invalid_national_id');
    }
    $nationalIdDocument = (string) ($data['nationalIdDocument'] ?? '');
    if ($nationalIdDocument === '') {
        fail('National ID document is required.', 422, 'validation_failed');
    }
    validate_image_value($nationalIdDocument, 'National ID document');
    $biography = validate_text_value($biography, 'Biography', 2000);
    validate_image_value($photo, 'Candidate photo');
    $party = party_record((string) ($data['party'] ?? ''));
    if (!$party) {
        fail('Select a valid political party.', 422, 'invalid_party');
    }
    $statement = db()->prepare(
        'UPDATE candidates c
         INNER JOIN users u ON u.id = c.user_id
         SET u.name = :name, c.national_id = :national_id,
             c.national_id_document = :national_id_document, c.party_id = :party_id,
             c.candidate_number = :candidate_number, c.biography = :biography,
             c.photo = :photo
         WHERE c.id = :id'
    );
    $statement->execute([
        'id' => $id,
        'name' => $name,
        'national_id' => $nationalId,
        'national_id_document' => $nationalIdDocument,
        'party_id' => (int) $party['id'],
        'candidate_number' => $candidateNumber,
        'biography' => $biography,
        'photo' => $photo,
    ]);
    if (!get_candidate($id)) {
        fail('Candidate not found.', 404, 'not_found');
    }
    audit_log((int) $user['id'], 'updated', 'candidate', $id);
    respond(['success' => true, 'candidate' => get_candidate($id, true, true)]);
}

if ($method === 'DELETE') {
    $connection = db();
    $candidateStatement = $connection->prepare(
        'SELECT c.user_id,
                (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = c.id) AS application_count,
                (SELECT COUNT(*) FROM votes v WHERE v.candidate_id = c.id) AS vote_count
         FROM candidates c WHERE c.id = :id LIMIT 1'
    );
    $candidateStatement->execute(['id' => $id]);
    $candidateRecord = $candidateStatement->fetch();
    if (!$candidateRecord) {
        fail('Candidate not found.', 404, 'not_found');
    }
    if ((int) $candidateRecord['application_count'] > 0) {
        fail('This candidate has an application record and can only be deactivated, not permanently deleted.', 409, 'candidate_has_application');
    }
    if ((int) $candidateRecord['vote_count'] > 0) {
        fail('This candidate has recorded votes and cannot be permanently deleted.', 409, 'candidate_has_votes');
    }
    $candidateUserId = (int) $candidateRecord['user_id'];
    $connection->beginTransaction();
    try {
        $connection->prepare('DELETE FROM auth_tokens WHERE user_id = :user_id')->execute(['user_id' => $candidateUserId]);
        $connection->prepare('DELETE FROM candidates WHERE id = :id')->execute(['id' => $id]);
        $connection->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $candidateUserId]);
        $connection->commit();
    } catch (Throwable $exception) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        throw $exception;
    }
    audit_log((int) $user['id'], 'deleted', 'candidate', $id, ['reason' => 'no_application']);
    respond(['success' => true, 'deleted' => true, 'message' => 'Candidate account permanently deleted because no application had been submitted.']);
}

fail('Method not allowed.', 405, 'method_not_allowed');
