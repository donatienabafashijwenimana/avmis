<?php

require __DIR__ . '/bootstrap.php';

function political_party_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'email' => $row['email'] ?? '',
        'abbreviation' => $row['abbreviation'] ?? '',
        'slogan' => $row['slogan'] ?? '',
        'logo' => $row['logo'] ?? '',
        'status' => $row['status'],
    ];
}

function get_political_party(int $id): ?array
{
    $statement = db()->prepare(
        'SELECT id, name, email, abbreviation, slogan, logo, status
         FROM political_parties WHERE id = :id LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    $party = $statement->fetch();
    return $party ? political_party_payload($party) : null;
}

function validate_political_party_status_transition(string $currentStatus, string $nextStatus): void
{
    if ($currentStatus === $nextStatus) {
        return;
    }

    $allowedTransitions = [
        'Pending' => ['Approved', 'Rejected'],
        'Approved' => ['Active', 'Rejected'],
        'Active' => ['Inactive'],
        'Inactive' => ['Active'],
        'Rejected' => ['Approved'],
    ];

    if (!in_array($nextStatus, $allowedTransitions[$currentStatus] ?? [], true)) {
        fail(
            match ($currentStatus) {
                'Pending' => 'Pending parties can only be approved or rejected.',
                'Approved' => 'Approved parties can be activated or rejected again.',
                'Active' => 'Active parties can only be deactivated.',
                'Inactive' => 'Inactive parties can only be activated.',
                default => 'Rejected parties can be approved again.',
            },
            422,
            'invalid_status_transition'
        );
    }
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $manage = ($_GET['manage'] ?? '') === '1';
    if ($manage) {
        require_auth('admin');
    }
    $rows = db()->query(
        'SELECT id, name, email, abbreviation, slogan, logo, status
         FROM political_parties'
        . ($manage ? '' : ' WHERE status = \'Active\'')
        . ' ORDER BY name'
    )->fetchAll();
    respond([
        'success' => true,
        'parties' => array_map('political_party_payload', $rows),
    ]);
}

$user = current_user();
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

if ($method === 'POST') {
    $data = request_body();
    $name = validate_text_value((string) ($data['name'] ?? ''), 'Party name', 120);
    $email = strtolower(trim((string) ($data['email'] ?? '')));
    validate_email_value($email);
    $abbreviation = validate_code_value((string) ($data['abbreviation'] ?? ''), 'Party abbreviation');
    $slogan = validate_text_value((string) ($data['slogan'] ?? ''), 'Slogan', 500);
    $logo = (string) ($data['logo'] ?? '');
    if ($logo === '') {
        fail('Party logo is required.', 422, 'validation_failed');
    }
    validate_image_value($logo, 'Party logo');

    $statement = db()->prepare(
        'INSERT INTO political_parties (name, email, abbreviation, slogan, logo, status)
         VALUES (:name, :email, :abbreviation, :slogan, :logo, \'Pending\')'
    );
    try {
        $statement->execute([
            'name' => $name,
            'email' => $email,
            'abbreviation' => $abbreviation,
            'slogan' => $slogan,
            'logo' => $logo,
        ]);
    } catch (PDOException $exception) {
        fail('That political party already exists.', 409, 'duplicate_party');
    }
    $partyId = (int) db()->lastInsertId();
    if ($user) {
        audit_log((int) $user['id'], 'created', 'political_party', $partyId, ['name' => $name]);
    }
    respond([
        'success' => true,
        'message' => 'Political party registration submitted for administrator approval.',
        'party' => get_political_party($partyId),
    ], 201);
}

$user = require_auth('admin');

if (!$id) {
    fail('A political party ID is required.', 422, 'missing_id');
}

if ($method === 'PUT') {
    $data = request_body();
    if (count($data) === 1 && array_key_exists('status', $data)) {
        $status = (string) ($data['status'] ?? '');
        if (!in_array($status, ['Pending', 'Approved', 'Rejected', 'Active', 'Inactive'], true)) {
            fail('Party status is invalid.', 422, 'validation_failed');
        }
        $existing = get_political_party($id);
        if (!$existing) {
            fail('Political party not found.', 404, 'not_found');
        }
        validate_political_party_status_transition($existing['status'], $status);
        db()->prepare('UPDATE political_parties SET status = :status WHERE id = :id')
            ->execute(['status' => $status, 'id' => $id]);
        $party = get_political_party($id);
        $emailSent = false;
        if ($status !== $existing['status'] && in_array($status, ['Approved', 'Rejected', 'Active', 'Inactive'], true)) {
            $decision = match ($status) {
                'Approved' => 'approved',
                'Rejected' => 'rejected',
                'Active' => 'activated',
                default => 'deactivated',
            };
            $subject = "Political party registration {$decision}";
            $message = "Dear {$party['name']},\n\nYour political party registration for {$party['name']} has been {$decision}.\n\n"
                . match ($status) {
                    'Approved' => 'Your party has been approved and can now be activated for candidate applications.',
                    'Rejected' => 'Please contact the election administrator if you need more information.',
                    'Active' => 'Your party is active and available for candidate applications.',
                    default => 'Your party has been deactivated and is no longer available for new candidate applications.',
                }
                . "\n\nAutomated Voting System";
            $emailSent = send_notification_email($party['email'], $subject, $message);
        }
        audit_log((int) $user['id'], strtolower($status), 'political_party', $id, ['name' => $party['name'], 'status' => $status]);
        respond(['success' => true, 'party' => $party, 'emailSent' => $emailSent]);
    }
    $name = validate_text_value((string) ($data['name'] ?? ''), 'Party name', 120);
    $email = strtolower(trim((string) ($data['email'] ?? '')));
    validate_email_value($email);
    $abbreviation = validate_code_value((string) ($data['abbreviation'] ?? ''), 'Party abbreviation');
    $slogan = validate_text_value((string) ($data['slogan'] ?? ''), 'Slogan', 500);
    $logo = (string) ($data['logo'] ?? '');
    if ($logo === '') {
        fail('Party logo is required.', 422, 'validation_failed');
    }
    validate_image_value($logo, 'Party logo');
    $existing = get_political_party($id);
    if (!$existing) {
        fail('Political party not found.', 404, 'not_found');
    }
    $status = (string) ($data['status'] ?? $existing['status']);
    if (!in_array($status, ['Pending', 'Approved', 'Rejected', 'Active', 'Inactive'], true)) {
        fail('Party status is invalid.', 422, 'validation_failed');
    }
    validate_political_party_status_transition($existing['status'], $status);

    $statement = db()->prepare(
        'UPDATE political_parties
         SET name = :name, email = :email, abbreviation = :abbreviation, slogan = :slogan,
             logo = :logo, status = :status
         WHERE id = :id'
    );
    try {
        $statement->execute([
            'id' => $id,
            'name' => $name,
            'email' => $email,
            'abbreviation' => $abbreviation,
            'slogan' => $slogan,
            'logo' => $logo,
            'status' => $status,
        ]);
    } catch (PDOException $exception) {
        fail('That political party already exists.', 409, 'duplicate_party');
    }
    $party = get_political_party($id);
    $emailSent = false;
    if ($status !== $existing['status'] && in_array($status, ['Approved', 'Rejected'], true)) {
        $decision = $status === 'Approved' ? 'approved' : 'rejected';
        $subject = "Political party registration {$decision}";
        $message = "Dear {$name},\n\nYour political party registration for {$name} has been {$decision}.\n\n"
            . ($status === 'Approved'
                ? 'Your party is now available for candidate applications.'
                : 'Please contact the election administrator if you need more information.')
            . "\n\nAutomated Voting System";
        $emailSent = send_notification_email($email, $subject, $message);
    }
    audit_log((int) $user['id'], strtolower($status) === 'approved' || strtolower($status) === 'rejected' ? strtolower($status) : 'updated', 'political_party', $id, ['name' => $name, 'status' => $status]);
    respond(['success' => true, 'party' => $party, 'emailSent' => $emailSent]);
}

if ($method === 'DELETE') {
    $existing = get_political_party($id);
    if (!$existing) {
        fail('Political party not found.', 404, 'not_found');
    }
    validate_political_party_status_transition($existing['status'], 'Rejected');
    db()->prepare("UPDATE political_parties SET status = 'Rejected' WHERE id = :id")
        ->execute(['id' => $id]);
    audit_log((int) $user['id'], 'rejected', 'political_party', $id);
    respond(['success' => true]);
}

fail('Method not allowed.', 405, 'method_not_allowed');
