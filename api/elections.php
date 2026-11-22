<?php

require __DIR__ . '/bootstrap.php';

function election_payload(array $row, bool $includeVoteCount = true): array
{
    $payload = [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'description' => $row['description'] ?? '',
        'status' => $row['status'],
        'applicationStartsAt' => $row['applicationStartsAt'] ?? null,
        'applicationEndsAt' => $row['applicationEndsAt'] ?? null,
        'applicationStatus' => $row['applicationStatus'] ?? 'Automatic',
        'startsAt' => $row['applicationStartsAt'] ?? null,
        'endsAt' => $row['applicationEndsAt'] ?? null,
        'votingStartsAt' => $row['votingStartsAt'] ?? null,
        'votingEndsAt' => $row['votingEndsAt'] ?? null,
        'votingAccess' => $row['votingAccess'] ?? 'Automatic',
        'candidateCount' => (int) ($row['candidateCount'] ?? 0),
        'resultsPublished' => (bool) ($row['resultsPublished'] ?? false),
        'resultsPublishedAt' => $row['resultsPublishedAt'] ?? null,
        'positionId' => (int) $row['positionId'],
        'position' => $row['position'],
        'criteria' => $row['criteria'] ?? '',
        'requiredDocuments' => $row['requiredDocuments'] ?? '',
    ];
    if ($includeVoteCount) {
        $payload['voteCount'] = (int) $row['voteCount'];
    }
    return $payload;
}

function get_election(int $id, bool $includeVoteCount = true): ?array
{
    $statement = db()->prepare(
        'SELECT e.id, e.name, e.description, e.status,
                e.application_starts_at AS applicationStartsAt, e.application_ends_at AS applicationEndsAt,
                e.application_status AS applicationStatus,
                e.voting_starts_at AS votingStartsAt, e.voting_ends_at AS votingEndsAt,
                e.voting_access AS votingAccess,
                (SELECT COUNT(*)
                 FROM applications ca
                 INNER JOIN candidates cc ON cc.id = ca.candidate_id
                 INNER JOIN users cu ON cu.id = cc.user_id
                 WHERE ca.position_id = e.position_id AND ca.status = \'Approved\'
                   AND cc.status = \'Active\' AND cu.status = \'Active\') AS candidateCount,
                e.results_published AS resultsPublished, e.results_published_at AS resultsPublishedAt,
                p.id AS positionId, p.name AS position, p.criteria, p.required_documents AS requiredDocuments,
                COUNT(v.id) AS voteCount
         FROM elections e
         INNER JOIN positions p ON p.id = e.position_id
         LEFT JOIN votes v ON v.election_id = e.id
         WHERE e.id = :id
         GROUP BY e.id, e.position_id, e.name, e.description, e.status, e.application_starts_at, e.application_ends_at,
                  e.voting_starts_at, e.voting_ends_at, e.voting_access, e.application_status,
                  e.results_published, e.results_published_at, p.id, p.name, p.criteria, p.required_documents'
    );
    $statement->execute(['id' => $id]);
    $row = $statement->fetch();
    return $row ? election_payload($row, $includeVoteCount) : null;
}

$method = $_SERVER['REQUEST_METHOD'];
$user = require_auth();
close_expired_elections();
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

if ($method === 'GET') {
    $visibilityCondition = $user['role'] === 'voter'
        ? "WHERE e.status = 'Open'
                AND e.results_published = 0
                AND e.voting_access <> 'Closed'
                AND EXISTS (
                    SELECT 1
                    FROM applications va
                    INNER JOIN candidates vc ON vc.id = va.candidate_id
                    INNER JOIN users vu ON vu.id = vc.user_id
                    WHERE va.position_id = e.position_id AND va.status = 'Approved'
                      AND vc.status = 'Active' AND vu.status = 'Active'
                )
                AND (e.voting_access = 'Open'
                     OR (e.voting_access = 'Automatic'
                         AND (e.voting_starts_at IS NULL OR e.voting_starts_at <= NOW())
                         AND (e.voting_ends_at IS NULL OR e.voting_ends_at > NOW())))"
        : '';
    $rows = db()->query(
        'SELECT e.id, e.name, e.description, e.status,
                e.application_starts_at AS applicationStartsAt, e.application_ends_at AS applicationEndsAt,
                e.application_status AS applicationStatus,
                e.voting_starts_at AS votingStartsAt, e.voting_ends_at AS votingEndsAt,
                e.voting_access AS votingAccess,
                (SELECT COUNT(*)
                 FROM applications ca
                 INNER JOIN candidates cc ON cc.id = ca.candidate_id
                 INNER JOIN users cu ON cu.id = cc.user_id
                 WHERE ca.position_id = e.position_id AND ca.status = \'Approved\'
                   AND cc.status = \'Active\' AND cu.status = \'Active\') AS candidateCount,
                e.results_published AS resultsPublished, e.results_published_at AS resultsPublishedAt,
                p.id AS positionId, p.name AS position, p.criteria, p.required_documents AS requiredDocuments,
                COUNT(v.id) AS voteCount
         FROM elections e
         INNER JOIN positions p ON p.id = e.position_id
         LEFT JOIN votes v ON v.election_id = e.id
         ' . $visibilityCondition . '
         GROUP BY e.id, e.position_id, e.name, e.description, e.status, e.application_starts_at, e.application_ends_at,
                  e.voting_starts_at, e.voting_ends_at, e.voting_access, e.application_status,
                  e.results_published, e.results_published_at, p.id, p.name, p.criteria, p.required_documents
         ORDER BY e.id DESC'
    )->fetchAll();
    $includeVoteCount = $user['role'] === 'admin';
    respond(['success' => true, 'elections' => array_map(static fn (array $row): array => election_payload($row, $includeVoteCount), $rows)]);
}

if ($user['role'] !== 'admin') {
    fail('Only administrators can manage elections.', 403, 'forbidden');
}

if (($_GET['action'] ?? '') === 'publish-results') {
    if (!$id) {
        fail('An election ID is required.', 422, 'missing_id');
    }
    $existingStatement = db()->prepare('SELECT status FROM elections WHERE id = :id LIMIT 1');
    $existingStatement->execute(['id' => $id]);
    $existingElection = $existingStatement->fetch();
    if (!$existingElection) {
        fail('Election not found.', 404, 'not_found');
    }
    if ($existingElection['status'] !== 'Closed') {
        fail('Results can only be published after the election is closed.', 409, 'election_not_closed');
    }
    $voteCountStatement = db()->prepare('SELECT COUNT(*) FROM votes WHERE election_id = :election_id');
    $voteCountStatement->execute(['election_id' => $id]);
    if ((int) $voteCountStatement->fetchColumn() < 1) {
        fail('Results cannot be published until at least one vote has been recorded.', 409, 'no_votes_recorded');
    }
    $statement = db()->prepare(
        'UPDATE elections
         SET results_published = 1, results_published_at = NOW(), results_published_by = :admin_id
         WHERE id = :id'
    );
    $statement->execute(['id' => $id, 'admin_id' => (int) $user['id']]);
    audit_log((int) $user['id'], 'published', 'election_results', $id);
    respond(['success' => true, 'election' => get_election($id)]);
}

if (($_GET['action'] ?? '') === 'reopen') {
    if ($method !== 'POST') {
        fail('Only POST requests can reopen an election.', 405, 'method_not_allowed');
    }
    if (!$id) {
        fail('An election ID is required.', 422, 'missing_id');
    }
    $existingStatement = db()->prepare('SELECT status, results_published FROM elections WHERE id = :id LIMIT 1');
    $existingStatement->execute(['id' => $id]);
    $existingElection = $existingStatement->fetch();
    if (!$existingElection) {
        fail('Election not found.', 404, 'not_found');
    }
    if ($existingElection['status'] !== 'Closed') {
        fail('Only closed elections can be reopened.', 409, 'election_not_closed');
    }
    if ((bool) $existingElection['results_published']) {
        fail('An election with published results cannot be reopened.', 409, 'election_locked');
    }
    $statement = db()->prepare(
        "UPDATE elections
         SET status = 'Open', voting_starts_at = NOW(), voting_ends_at = NULL, voting_access = 'Open'
         WHERE id = :id"
    );
    $statement->execute(['id' => $id]);
    audit_log((int) $user['id'], 'reopened', 'election', $id, ['voting_access' => 'Open']);
    respond(['success' => true, 'election' => get_election($id)]);
}

if ($method === 'POST' || $method === 'PUT') {
    $data = request_body();
    $name = validate_text_value((string) ($data['name'] ?? ''), 'Election name', 150);
    $description = validate_text_value((string) ($data['description'] ?? ''), 'Election description', 2000);
    $positionId = (int) ($data['positionId'] ?? 0);
    $status = (string) ($data['status'] ?? '');
    if (!in_array($status, ['Draft', 'Open', 'Suspended', 'Closed'], true)) {
        fail('Election status is required and must be valid.', 422, 'validation_failed');
    }
    $applicationStartsAt = normalize_datetime_value($data['applicationStartsAt'] ?? $data['startsAt'] ?? null, 'Application start date');
    $applicationEndsAt = normalize_datetime_value($data['applicationEndsAt'] ?? $data['endsAt'] ?? null, 'Application end date');
    $applicationStatus = (string) ($data['applicationStatus'] ?? 'Automatic');
    $votingStartsAt = normalize_datetime_value($data['votingStartsAt'] ?? null, 'Voting start date');
    $votingEndsAt = normalize_datetime_value($data['votingEndsAt'] ?? null, 'Voting end date');
    $votingAccess = (string) ($data['votingAccess'] ?? 'Automatic');
    if (!$applicationStartsAt || !$applicationEndsAt || !$votingStartsAt || !$votingEndsAt) {
        fail('Application and voting start and end dates are required.', 422, 'validation_failed');
    }
    if (!in_array($applicationStatus, ['Automatic', 'Open', 'Closed'], true)) {
        fail('Application access status is invalid.', 422, 'validation_failed');
    }
    if (!in_array($votingAccess, ['Automatic', 'Open', 'Closed'], true)) {
        fail('Voting access status is invalid.', 422, 'validation_failed');
    }

    if ($method === 'PUT') {
        if (!$id) {
            fail('An election ID is required.', 422, 'missing_id');
        }
        $existingStatement = db()->prepare('SELECT status, application_starts_at, voting_starts_at, voting_ends_at, results_published FROM elections WHERE id = :id LIMIT 1');
        $existingStatement->execute(['id' => $id]);
        $existingElection = $existingStatement->fetch();
        if (!$existingElection) {
            fail('Election not found.', 404, 'not_found');
        }
        if ((bool) $existingElection['results_published']) {
            fail('An election with published results cannot be edited.', 409, 'election_locked');
        }
        if ($existingElection['status'] === 'Closed') {
            fail('A closed election cannot be edited. Reopen it first.', 409, 'election_closed');
        }
        if ($existingElection['application_starts_at'] !== $applicationStartsAt && strtotime($applicationStartsAt) < time()) {
            fail('The application start date cannot be in the past.', 422, 'start_date_in_past');
        }
        if ($existingElection['voting_starts_at'] !== $votingStartsAt && strtotime($votingStartsAt) < time()) {
            fail('The voting start date cannot be in the past.', 422, 'start_date_in_past');
        }
        $existingVotingEndsAt = $existingElection['voting_ends_at'];
        if ($existingVotingEndsAt !== null && strtotime($existingVotingEndsAt) <= time()) {
            fail('This election cannot be edited because its deadline has been reached.', 409, 'deadline_reached');
        }
        if ($votingEndsAt !== null && strtotime($votingEndsAt) <= time()) {
            fail('A voting end date cannot be moved into the past.', 422, 'deadline_in_past');
        }
    }

    if ($method === 'POST') {
        if (strtotime($applicationStartsAt) < time()) {
            fail('The application start date cannot be in the past.', 422, 'start_date_in_past');
        }
        if (strtotime($votingStartsAt) < time()) {
            fail('The voting start date cannot be in the past.', 422, 'start_date_in_past');
        }
    }

    if ($votingEndsAt !== null && strtotime($votingEndsAt) <= time()) {
        $status = 'Closed';
    }

    if (!$positionId) {
        fail('An electoral position is required.', 422, 'validation_failed');
    }
    $applicationStartTimestamp = strtotime($applicationStartsAt);
    $applicationEndTimestamp = strtotime($applicationEndsAt);
    $votingStartTimestamp = strtotime($votingStartsAt);
    $votingEndTimestamp = strtotime($votingEndsAt);
    if ($applicationEndTimestamp <= $applicationStartTimestamp) {
        fail('The application end date must be greater than the application start date.', 422, 'invalid_timeline');
    }
    if ($votingStartTimestamp <= $applicationEndTimestamp) {
        fail('The voting start date must be greater than the application end date.', 422, 'invalid_timeline');
    }
    if ($votingEndTimestamp <= $votingStartTimestamp) {
        fail('The voting end date must be greater than the voting start date.', 422, 'invalid_timeline');
    }
    if ($votingAccess === 'Open' && $votingStartTimestamp > time()) {
        fail('Voting cannot be opened before the voting start date.', 422, 'voting_not_started');
    }
    $positionStatement = db()->prepare("SELECT id FROM positions WHERE id = :id AND status = 'Active' LIMIT 1");
    $positionStatement->execute(['id' => $positionId]);
    if (!$positionStatement->fetch()) {
        fail('That electoral position does not exist.', 422, 'invalid_position');
    }

    $candidateCountStatement = db()->prepare(
        'SELECT COUNT(*)
         FROM applications a
         INNER JOIN candidates c ON c.id = a.candidate_id
         INNER JOIN users cu ON cu.id = c.user_id
         WHERE a.position_id = :position_id AND a.status = \'Approved\'
           AND c.status = \'Active\' AND cu.status = \'Active\''
    );
    $candidateCountStatement->execute(['position_id' => $positionId]);
    $candidateCount = (int) $candidateCountStatement->fetchColumn();
    $votingOpenNow = $votingStartTimestamp <= time() && $votingEndTimestamp > time();
    if (($votingAccess === 'Open' || ($votingAccess === 'Automatic' && $votingOpenNow)) && $candidateCount < 1) {
        fail('Voting cannot be opened until at least one approved active candidate is available.', 422, 'candidate_required');
    }

    try {
        if ($method === 'POST') {
            $statement = db()->prepare(
                'INSERT INTO elections
                    (position_id, name, description, status, application_starts_at, application_ends_at, application_status,
                     voting_starts_at, voting_ends_at, voting_access)
                 VALUES (:position_id, :name, :description, :status, :application_starts_at, :application_ends_at, :application_status,
                         :voting_starts_at, :voting_ends_at, :voting_access)'
            );
            $statement->execute([
                'position_id' => $positionId, 'name' => $name, 'description' => $description,
                'status' => $status, 'application_starts_at' => $applicationStartsAt,
                'application_ends_at' => $applicationEndsAt, 'application_status' => $applicationStatus,
                'voting_starts_at' => $votingStartsAt,
                'voting_ends_at' => $votingEndsAt, 'voting_access' => $votingAccess,
            ]);
            $id = (int) db()->lastInsertId();
            audit_log((int) $user['id'], 'created', 'election', $id, ['name' => $name]);
        } else {
            if (!$id) {
                fail('An election ID is required.', 422, 'missing_id');
            }
            $statement = db()->prepare(
                'UPDATE elections SET position_id = :position_id, name = :name, description = :description,
                     status = :status, application_starts_at = :application_starts_at,
                     application_ends_at = :application_ends_at, application_status = :application_status,
                     voting_starts_at = :voting_starts_at, voting_ends_at = :voting_ends_at,
                     voting_access = :voting_access
                 WHERE id = :id'
            );
            $statement->execute([
                'id' => $id, 'position_id' => $positionId, 'name' => $name, 'description' => $description,
                'status' => $status, 'application_starts_at' => $applicationStartsAt,
                'application_ends_at' => $applicationEndsAt, 'application_status' => $applicationStatus,
                'voting_starts_at' => $votingStartsAt,
                'voting_ends_at' => $votingEndsAt, 'voting_access' => $votingAccess,
            ]);
            audit_log((int) $user['id'], 'updated', 'election', $id, ['name' => $name, 'status' => $status]);
        }
    } catch (PDOException $exception) {
        fail('Only one election can exist for each position.', 409, 'duplicate_election');
    }
    respond(['success' => true, 'election' => get_election($id)], $method === 'POST' ? 201 : 200);
}

if ($method === 'DELETE') {
    if (!$id) {
        fail('An election ID is required.', 422, 'missing_id');
    }
    $existingStatement = db()->prepare(
        'SELECT status, results_published FROM elections WHERE id = :id LIMIT 1'
    );
    $existingStatement->execute(['id' => $id]);
    $existingElection = $existingStatement->fetch();
    if (!$existingElection) {
        fail('Election not found.', 404, 'not_found');
    }
    if ((bool) $existingElection['results_published']) {
        fail('An election with published results is locked and cannot be deleted.', 409, 'election_locked');
    }
    if ($existingElection['status'] === 'Closed') {
        fail('A closed election is locked and cannot be deleted.', 409, 'election_locked');
    }
    $statement = db()->prepare("UPDATE elections SET status = 'Closed' WHERE id = :id");
    $statement->execute(['id' => $id]);
    if (!$statement->rowCount()) {
        fail('Election not found.', 404, 'not_found');
    }
    audit_log((int) $user['id'], 'closed', 'election', $id);
    respond(['success' => true]);
}

fail('Method not allowed.', 405, 'method_not_allowed');
