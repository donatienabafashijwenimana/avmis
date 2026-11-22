<?php

require __DIR__ . '/bootstrap.php';

$user = require_auth('voter');
close_expired_elections();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Only POST requests are allowed.', 405, 'method_not_allowed');
}

$data = request_body();
$candidateId = (int) ($data['candidateId'] ?? 0);
$position = trim((string) ($data['position'] ?? ''));
if (!$candidateId || $position === '') {
    fail('Candidate and position are required.', 422, 'validation_failed');
}

$connection = db();
$connection->beginTransaction();
try {
    $voterStatement = $connection->prepare(
        'SELECT id FROM voter WHERE user_id = :user_id LIMIT 1 FOR UPDATE'
    );
    $voterStatement->execute(['user_id' => (int) $user['id']]);
    $voterId = $voterStatement->fetchColumn();
    if ($voterId === false) {
        $connection->rollBack();
        fail('Voter profile not found.', 403, 'voter_profile_missing');
    }

    $candidateStatement = $connection->prepare(
        'SELECT c.id, a.position_id, p.name AS position_name
         FROM candidates c
         INNER JOIN users cu ON cu.id = c.user_id AND cu.status = \'Active\'
         INNER JOIN applications a
             ON a.candidate_id = c.id AND a.status = \'Approved\'
         INNER JOIN positions p ON p.id = a.position_id
         WHERE c.id = :id AND c.status = \'Active\' AND p.status = \'Active\'
           AND p.name = :position
         LIMIT 1 FOR UPDATE'
    );
    $candidateStatement->execute(['id' => $candidateId, 'position' => $position]);
    $candidate = $candidateStatement->fetch();
    if (!$candidate || $candidate['position_name'] !== $position) {
        $connection->rollBack();
        fail('Candidate is not available for this position.', 422, 'invalid_candidate');
    }

    $electionStatement = $connection->prepare(
        'SELECT e.id
         FROM elections e
         WHERE e.position_id = :position_id AND e.status = \'Open\'
           AND e.results_published = 0
           AND e.voting_access <> \'Closed\'
           AND EXISTS (
               SELECT 1
               FROM applications ea
               INNER JOIN candidates ec ON ec.id = ea.candidate_id
               INNER JOIN users eu ON eu.id = ec.user_id
               WHERE ea.position_id = e.position_id AND ea.status = \'Approved\'
                 AND ec.status = \'Active\' AND eu.status = \'Active\'
           )
           AND (e.voting_access = \'Open\'
                OR (e.voting_access = \'Automatic\'
                    AND (e.voting_starts_at IS NULL OR e.voting_starts_at <= NOW())
                    AND (e.voting_ends_at IS NULL OR e.voting_ends_at > NOW())))
         LIMIT 1 FOR UPDATE'
    );
    $electionStatement->execute(['position_id' => (int) $candidate['position_id']]);
    $electionId = $electionStatement->fetchColumn();
    if ($electionId === false) {
        $connection->rollBack();
        fail('Voting is not open for this position.', 422, 'election_closed');
    }

    $existingStatement = $connection->prepare(
        'SELECT id FROM votes WHERE voter_id = :voter_id AND election_id = :election_id LIMIT 1'
    );
    $existingStatement->execute([
        'voter_id' => (int) $voterId,
        'election_id' => (int) $electionId,
    ]);
    if ($existingStatement->fetch()) {
        $connection->rollBack();
        fail('You have already voted for this position.', 409, 'already_voted');
    }

    $insert = $connection->prepare(
        'INSERT INTO votes (voter_id, election_id, candidate_id)
         VALUES (:voter_id, :election_id, :candidate_id)'
    );
    $insert->execute([
        'voter_id' => (int) $voterId,
        'election_id' => (int) $electionId,
        'candidate_id' => $candidateId,
    ]);
    $connection->commit();
} catch (Throwable $exception) {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }
    throw $exception;
}

$countStatement = $connection->prepare('SELECT COUNT(*) FROM votes WHERE candidate_id = :candidate_id');
$countStatement->execute(['candidate_id' => $candidateId]);

respond([
    'success' => true,
    'candidate' => [
        'id' => $candidateId,
        'votes' => (int) $countStatement->fetchColumn(),
    ],
    'voterId' => $user['voter_id'],
    'position' => $position,
]);
