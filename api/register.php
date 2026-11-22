<?php

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Only POST requests are allowed.', 405, 'method_not_allowed');
}

$data = request_body();
$accountType = ($data['accountType'] ?? 'voter') === 'candidate' ? 'candidate' : 'voter';
$accountIdentifier = trim((string) ($data['voterId'] ?? ''));
$name = validate_person_name_value((string) ($data['name'] ?? ''), 'Full name');
$email = strtolower(trim((string) ($data['email'] ?? '')));
$password = (string) ($data['password'] ?? '');
$pollingDistrict = trim((string) ($data['pollingDistrict'] ?? ''));
$party = trim((string) ($data['party'] ?? 'Independent')) ?: 'Independent';
$candidateNumber = trim((string) ($data['candidateNumber'] ?? ''));
$candidateNationalId = trim((string) ($data['candidateNationalId'] ?? ''));
$nationalIdDocument = (string) ($data['nationalIdDocument'] ?? '');
$biography = trim((string) ($data['biography'] ?? ''));
$photo = (string) ($data['photo'] ?? '');

if ($accountIdentifier === '') {
    fail($accountType === 'candidate' ? 'A username is required.' : 'Voter ID is required.', 422, 'validation_failed');
}

if ($accountType === 'voter' && !preg_match('/^1[12]\d{14}$/', $accountIdentifier)) {
    fail('National ID must start with 11 or 12 and contain exactly 16 digits.', 422, 'invalid_national_id');
}

if ($accountType === 'candidate' && !preg_match('/^[A-Za-z0-9_-]{4,32}$/', $accountIdentifier)) {
    fail('Candidate username must be 4 to 32 letters, numbers, underscores, or hyphens.', 422, 'validation_failed');
}

if ($accountType === 'candidate' && !preg_match('/^1[12]\d{14}$/', $candidateNationalId)) {
    fail('Candidate National ID must start with 11 or 12 and contain exactly 16 digits.', 422, 'invalid_national_id');
}
if ($nationalIdDocument === '') {
    fail('National ID document is required.', 422, 'validation_failed');
}
validate_image_value($nationalIdDocument, 'National ID document');

validate_email_value($email);
validate_password_value($password);

if ($accountType === 'voter') {
    $pollingDistrict = validate_text_value($pollingDistrict, 'Polling district', 100);
} else {
    $pollingDistrict = 'National';
}

$connection = db();
$candidateId = null;
$partyRecord = null;

if ($accountType === 'candidate') {
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/', $candidateNumber)) {
        fail('Candidate number must be 1 to 32 letters, numbers, or hyphens.', 422, 'invalid_candidate_number');
    }
    $biography = validate_text_value($biography, 'Biography', 2000);
    if ($photo === '') {
        fail('Candidate photo is required.', 422, 'validation_failed');
    }
    validate_image_value($photo, 'Candidate photo');
    $partyStatement = $connection->prepare(
        'SELECT id, name FROM political_parties WHERE name = :party AND status = \'Active\' LIMIT 1'
    );
    $partyStatement->execute(['party' => $party]);
    $partyRecord = $partyStatement->fetch();
    if (!$partyRecord) {
        fail('That political party is not available.', 422, 'invalid_party');
    }
}

$connection->beginTransaction();

try {
    $statement = $connection->prepare(
        'INSERT INTO users (username, name, email, password_hash, role, polling_district, status)
         VALUES (:username, :name, :email, :password_hash, :role, :polling_district, :status)'
    );
    $statement->execute([
        'username' => $accountType === 'candidate' ? $accountIdentifier : null,
        'name' => $name,
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'role' => $accountType,
        'polling_district' => $pollingDistrict,
        'status' => $accountType === 'candidate' ? 'Active' : 'Inactive',
    ]);

    $userId = (int) $connection->lastInsertId();
    if ($accountType === 'voter') {
        $voterStatement = $connection->prepare(
            'INSERT INTO voter (user_id, voter_id, national_id_document)
             VALUES (:user_id, :voter_id, :national_id_document)'
        );
        $voterStatement->execute([
            'user_id' => $userId,
            'voter_id' => $accountIdentifier,
            'national_id_document' => $nationalIdDocument,
        ]);
        sync_voter_profile($userId);
    }

    if ($accountType === 'candidate') {
        $candidateStatement = $connection->prepare(
            'INSERT INTO candidates (user_id, party_id, national_id, national_id_document, candidate_number, biography, photo)
             VALUES (:user_id, :party_id, :national_id, :national_id_document, :candidate_number, :biography, :photo)'
        );
        $candidateStatement->execute([
            'user_id' => $userId,
            'party_id' => (int) $partyRecord['id'],
            'national_id' => $candidateNationalId,
            'national_id_document' => $nationalIdDocument,
            'candidate_number' => $candidateNumber,
            'biography' => $biography,
            'photo' => $photo,
        ]);
        $candidateId = (int) $connection->lastInsertId();
    }
    $connection->commit();
} catch (PDOException $exception) {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }
    fail('That username, Voter ID, or email is already registered.', 409, 'duplicate_account');
}

$userStatement = $connection->prepare(
    'SELECT u.id, u.username, v.voter_id, u.name, u.email, u.password_hash, u.role,
            c.id AS candidate_id, c.national_id AS candidate_national_id,
            u.polling_district, u.status,
            COALESCE(NULLIF(u.id_photo, \'\'), c.photo) AS id_photo,
            COALESCE(v.national_id_document, c.national_id_document) AS national_id_document
     FROM users u
     LEFT JOIN voter v ON v.user_id = u.id
     LEFT JOIN candidates c ON c.user_id = u.id
     WHERE u.id = :id LIMIT 1'
);
$userStatement->execute(['id' => $userId]);
$user = $userStatement->fetch();

if (!$user) {
    fail('The account could not be created.', 500, 'registration_failed');
}

$responseUser = public_user($user);
$responseUser['votedPositions'] = [];
$rawToken = null;

if ($accountType === 'candidate') {
    $rawToken = bin2hex(random_bytes(32));
    $expiresAt = (new DateTimeImmutable('now'))
        ->modify('+' . (int) $config['token_days'] . ' days')
        ->format('Y-m-d H:i:s');
    $tokenStatement = $connection->prepare(
        'INSERT INTO auth_tokens (user_id, token_hash, expires_at)
         VALUES (:user_id, :token_hash, :expires_at)'
    );
    $tokenStatement->execute([
        'user_id' => (int) $user['id'],
        'token_hash' => hash('sha256', $rawToken),
        'expires_at' => $expiresAt,
    ]);
}

respond([
    'success' => true,
    'token' => $rawToken,
    'user' => $responseUser,
    'message' => $accountType === 'candidate'
        ? 'Candidate account created. Apply for an open position from the candidate portal.'
        : 'Registration submitted. An administrator must activate your account before you can log in.',
], 201);
