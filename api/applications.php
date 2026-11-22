<?php

require __DIR__ . '/bootstrap.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

function application_payload(array $row): array
{
    $documents = json_decode((string) ($row['applicationDocuments'] ?? ''), true);
    return [
        'id' => (int) $row['id'],
        'status' => $row['status'],
        'criteriaConfirmed' => (bool) $row['criteriaConfirmed'],
        'criteriaSnapshot' => $row['criteriaSnapshot'],
        'requiredDocumentsSnapshot' => $row['requiredDocumentsSnapshot'],
        'applicationMessage' => $row['applicationMessage'],
        'applicationDocuments' => is_array($documents) ? $documents : [],
        'submittedAt' => $row['submittedAt'],
        'reviewedAt' => $row['reviewedAt'],
        'reviewNotes' => $row['reviewNotes'],
        'candidateId' => (int) $row['candidateId'],
        'candidateName' => $row['candidateName'],
        'electionId' => $row['electionId'] !== null ? (int) $row['electionId'] : null,
        'party' => $row['party'],
        'positionId' => (int) $row['positionId'],
        'position' => $row['position'],
        'category' => $row['category'],
        'electionName' => $row['electionName'] ?? null,
        'electionStatus' => $row['electionStatus'] ?? null,
        'applicationStartsAt' => $row['applicationStartsAt'] ?? null,
        'applicationEndsAt' => $row['applicationEndsAt'] ?? null,
        'applicationStatus' => $row['applicationStatus'] ?? 'Automatic',
    ];
}

function normalize_application_documents(mixed $documents): string
{
    if ($documents === null || $documents === []) {
        fail('At least one supporting document is required.', 422, 'documents_required');
    }
    if (!is_array($documents) || count($documents) > 5) {
        fail('Upload no more than 5 application documents.', 422, 'invalid_documents');
    }

    $allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    $normalized = [];
    $totalBytes = 0;
    foreach ($documents as $document) {
        if (!is_array($document)) {
            fail('Each application document is invalid.', 422, 'invalid_documents');
        }
        $name = trim((string) ($document['name'] ?? ''));
        $data = (string) ($document['data'] ?? '');
        if ($name === '' || !preg_match('/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*);base64,(.+)$/s', $data, $matches)) {
            fail('Each application document must be a valid file.', 422, 'invalid_documents');
        }
        $type = strtolower($matches[1]);
        if (!in_array($type, $allowedTypes, true)) {
            fail('Documents must be PDF, JPEG, PNG, DOC, or DOCX files.', 422, 'invalid_document_type');
        }
        $decoded = base64_decode($matches[2], true);
        if ($decoded === false) {
            fail('An application document could not be read.', 422, 'invalid_documents');
        }
        $bytes = strlen($decoded);
        if ($bytes > 5 * 1024 * 1024) {
            fail('Each application document must be under 5MB.', 422, 'document_too_large');
        }
        $totalBytes += $bytes;
        if ($totalBytes > 10 * 1024 * 1024) {
            fail('All application documents together must be under 10MB.', 422, 'documents_too_large');
        }
        $safeName = preg_replace('/[^A-Za-z0-9._ -]/', '_', basename($name));
        $normalized[] = [
            'name' => substr($safeName ?: 'application-document', 0, 150),
            'type' => $type,
            'data' => $data,
            'size' => $bytes,
        ];
    }
    return json_encode($normalized, JSON_UNESCAPED_SLASHES);
}

function application_record(int $id): ?array
{
    $statement = db()->prepare(
        'SELECT a.id, a.status, a.criteria_confirmed AS criteriaConfirmed,
                a.criteria_snapshot AS criteriaSnapshot,
                a.required_documents_snapshot AS requiredDocumentsSnapshot,
                a.application_message AS applicationMessage,
                a.application_documents AS applicationDocuments,
                a.submitted_at AS submittedAt, a.reviewed_at AS reviewedAt,
                a.review_notes AS reviewNotes,
                c.id AS candidateId, u.name AS candidateName, pp.name AS party,
                e.id AS electionId, p.id AS positionId, p.name AS position, p.category,
                e.name AS electionName, e.status AS electionStatus,
                e.application_starts_at AS applicationStartsAt,
                e.application_ends_at AS applicationEndsAt,
                e.application_status AS applicationStatus
         FROM applications a
         INNER JOIN candidates c ON c.id = a.candidate_id
         INNER JOIN users u ON u.id = c.user_id
         LEFT JOIN political_parties pp ON pp.id = c.party_id
         INNER JOIN positions p ON p.id = a.position_id
         LEFT JOIN elections e ON e.position_id = a.position_id
         WHERE a.id = :id
         LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    return $statement->fetch() ?: null;
}

function candidate_applications(int $userId): array
{
    $statement = db()->prepare(
        'SELECT a.id, a.status, a.criteria_confirmed AS criteriaConfirmed,
                a.criteria_snapshot AS criteriaSnapshot,
                a.required_documents_snapshot AS requiredDocumentsSnapshot,
                a.application_message AS applicationMessage,
                a.application_documents AS applicationDocuments,
                a.submitted_at AS submittedAt, a.reviewed_at AS reviewedAt,
                a.review_notes AS reviewNotes,
                c.id AS candidateId, u.name AS candidateName, pp.name AS party,
                e.id AS electionId, p.id AS positionId, p.name AS position, p.category,
                e.name AS electionName, e.status AS electionStatus,
                e.application_starts_at AS applicationStartsAt,
                e.application_ends_at AS applicationEndsAt,
                e.application_status AS applicationStatus
         FROM applications a
         INNER JOIN candidates c ON c.id = a.candidate_id
         INNER JOIN users u ON u.id = c.user_id
         LEFT JOIN political_parties pp ON pp.id = c.party_id
         INNER JOIN positions p ON p.id = a.position_id
         LEFT JOIN elections e ON e.position_id = a.position_id
         WHERE c.user_id = :user_id
         ORDER BY a.submitted_at DESC, a.id DESC'
    );
    $statement->execute(['user_id' => $userId]);
    return array_map('application_payload', $statement->fetchAll());
}

if ($user['role'] === 'candidate') {
    $candidateId = (int) ($user['candidate_id'] ?? 0);
    if (!$candidateId) {
        fail('Candidate profile not found.', 404, 'candidate_not_found');
    }
    if ($method === 'GET') {
        respond(['success' => true, 'applications' => candidate_applications((int) $user['id'])]);
    }
    if (!in_array($method, ['POST', 'PUT'], true)) {
        fail('Candidates can only view, submit, and edit applications.', 405, 'method_not_allowed');
    }

    $data = request_body();
    if ($method === 'PUT' && !$id) {
        fail('An application ID is required when editing an application.', 422, 'missing_id');
    }
    $electionId = (int) ($data['electionId'] ?? 0);
    $message = validate_text_value((string) ($data['applicationMessage'] ?? ''), 'Application message', 5000);
    $documents = normalize_application_documents($data['documents'] ?? []);
    $criteriaConfirmed = ($data['criteriaConfirmed'] ?? false) === true;
    if (!$electionId) {
        fail('Choose an active election.', 422, 'validation_failed');
    }
    if (!$criteriaConfirmed) {
        fail('You must confirm that you meet the position requirements.', 422, 'criteria_not_confirmed');
    }

    if ($method === 'PUT') {
        $ownershipStatement = db()->prepare(
            'SELECT a.id, a.status, a.position_id AS positionId, c.id AS candidateId
             FROM applications a
             INNER JOIN candidates c ON c.id = a.candidate_id
             WHERE a.id = :id AND c.id = :candidate_id AND c.user_id = :user_id
             LIMIT 1'
        );
        $ownershipStatement->execute([
            'id' => $id,
            'candidate_id' => $candidateId,
            'user_id' => (int) $user['id'],
        ]);
        $ownedApplication = $ownershipStatement->fetch();
        if (!$ownedApplication) {
            fail('Application not found.', 404, 'not_found');
        }
        if ($ownedApplication['status'] === 'Approved') {
            fail('Approved applications cannot be edited.', 409, 'application_locked');
        }
    }

    $candidateStatement = db()->prepare(
        'SELECT c.id
         FROM candidates c
         WHERE c.id = :candidate_id AND c.user_id = :user_id AND c.status = \'Active\'
         LIMIT 1'
    );
    $candidateStatement->execute(['candidate_id' => $candidateId, 'user_id' => (int) $user['id']]);
    $candidate = $candidateStatement->fetch();
    if (!$candidate) {
        fail('Candidate profile not found or inactive.', 404, 'candidate_not_found');
    }

    $electionStatement = db()->prepare(
        'SELECT e.id, e.position_id, e.name, p.criteria, p.required_documents
         FROM elections e
         INNER JOIN positions p ON p.id = e.position_id AND p.status = \'Active\'
         WHERE e.id = :election_id AND e.status IN (\'Draft\', \'Open\')
           AND e.application_status <> \'Closed\'
           AND (e.application_status = \'Open\'
                OR ((e.application_starts_at IS NULL OR e.application_starts_at <= NOW())
                    AND (e.application_ends_at IS NULL OR e.application_ends_at > NOW())))
         LIMIT 1'
    );
    $electionStatement->execute(['election_id' => $electionId]);
    $election = $electionStatement->fetch();
    if (!$election) {
        fail('That election is not currently accepting applications.', 422, 'application_window_closed');
    }
    $existingStatement = db()->prepare(
        'SELECT id, status FROM applications WHERE candidate_id = :candidate_id AND position_id = :position_id LIMIT 1'
    );
    $existingStatement->execute(['candidate_id' => $candidateId, 'position_id' => (int) $election['position_id']]);
    $existing = $existingStatement->fetch();
    if ($method === 'PUT' && (!$existing || (int) $existing['id'] !== $id)) {
        fail('The application does not match the selected position.', 409, 'application_position_mismatch');
    }
    if ($existing && $existing['status'] === 'Approved') {
        fail('Your application for this position has already been approved.', 409, 'already_approved');
    }

    if ($existing) {
        $statement = db()->prepare(
            'UPDATE applications
             SET status = \'Pending\', criteria_confirmed = 1, criteria_snapshot = :criteria_snapshot,
                 required_documents_snapshot = :required_documents_snapshot, application_message = :application_message,
                 application_documents = :application_documents,
                 submitted_at = NOW(), reviewed_at = NULL, reviewed_by = NULL, review_notes = NULL
             WHERE id = :id'
        );
        $statement->execute([
            'id' => (int) $existing['id'], 'criteria_snapshot' => $election['criteria'],
            'required_documents_snapshot' => $election['required_documents'], 'application_message' => $message,
            'application_documents' => $documents,
        ]);
        $applicationId = (int) $existing['id'];
    } else {
        $statement = db()->prepare(
            'INSERT INTO applications
                (candidate_id, position_id, status, criteria_confirmed, criteria_snapshot,
                 required_documents_snapshot, application_message, application_documents)
             VALUES (:candidate_id, :position_id, \'Pending\', 1, :criteria_snapshot,
                     :required_documents_snapshot, :application_message, :application_documents)'
        );
        $statement->execute([
            'candidate_id' => $candidateId, 'position_id' => (int) $election['position_id'],
            'criteria_snapshot' => $election['criteria'], 'required_documents_snapshot' => $election['required_documents'],
            'application_message' => $message,
            'application_documents' => $documents,
        ]);
        $applicationId = (int) db()->lastInsertId();
    }
    audit_log((int) $user['id'], $method === 'PUT' ? 'updated' : 'submitted', 'application', $applicationId, ['election_id' => $electionId]);
    respond([
        'success' => true,
        'message' => $method === 'PUT' ? 'Application updated for administrator review.' : 'Application submitted for administrator approval.',
        'application' => application_payload(application_record($applicationId)),
    ], $existing ? 200 : 201);
}

if ($user['role'] !== 'admin') {
    fail('Only administrators can manage applications.', 403, 'forbidden');
}
$admin = $user;

if ($method === 'PUT') {
    if (!$id) {
        fail('An application ID is required.', 422, 'missing_id');
    }
    $data = request_body();
    $status = (string) ($data['status'] ?? '');
    if (!in_array($status, ['Approved', 'Rejected', 'Pending'], true)) {
        fail('Application status is invalid.', 422, 'invalid_status');
    }
    $currentApplication = application_record($id);
    if (!$currentApplication) {
        fail('Application not found.', 404, 'not_found');
    }
    if ($status === 'Approved' && !(bool) $currentApplication['criteriaConfirmed']) {
        fail('The candidate must confirm the position criteria before approval.', 422, 'criteria_not_confirmed');
    }

    $statement = db()->prepare(
        'UPDATE applications
         SET status = :status, reviewed_at = NOW(), reviewed_by = :reviewed_by,
             review_notes = :review_notes
         WHERE id = :id'
    );
    $statement->execute([
        'id' => $id,
        'status' => $status,
        'reviewed_by' => (int) $admin['id'],
        'review_notes' => trim((string) ($data['reviewNotes'] ?? '')) ?: null,
    ]);
    $application = application_record($id);
    audit_log((int) $admin['id'], strtolower($status), 'application', $id);
    respond(['success' => true, 'application' => application_payload($application)]);
}

if ($method !== 'GET') {
    fail('Only GET and PUT requests are allowed.', 405, 'method_not_allowed');
}

$rows = db()->query(
    'SELECT a.id, a.status, a.criteria_confirmed AS criteriaConfirmed,
            a.criteria_snapshot AS criteriaSnapshot,
            a.required_documents_snapshot AS requiredDocumentsSnapshot,
            a.application_message AS applicationMessage,
            a.application_documents AS applicationDocuments,
            a.submitted_at AS submittedAt, a.reviewed_at AS reviewedAt,
            a.review_notes AS reviewNotes,
            c.id AS candidateId, u.name AS candidateName, pp.name AS party,
            e.id AS electionId, p.id AS positionId, p.name AS position, p.category,
            e.name AS electionName, e.status AS electionStatus,
            e.application_starts_at AS applicationStartsAt,
            e.application_ends_at AS applicationEndsAt,
            e.application_status AS applicationStatus
     FROM applications a
     INNER JOIN candidates c ON c.id = a.candidate_id
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN political_parties pp ON pp.id = c.party_id
     INNER JOIN positions p ON p.id = a.position_id
     LEFT JOIN elections e ON e.position_id = a.position_id
     ORDER BY a.submitted_at DESC, a.id DESC'
)->fetchAll();

respond([
    'success' => true,
    'applications' => array_map('application_payload', $rows),
]);
