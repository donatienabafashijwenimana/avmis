<?php

require __DIR__ . '/bootstrap.php';

$user = require_auth();
if (!in_array($user['role'], ['admin', 'candidate', 'voter'], true)) {
    fail('Published results are available to voters, candidates, and administrators.', 403, 'forbidden');
}

$electionId = isset($_GET['electionId']) ? (int) $_GET['electionId'] : 0;
    $sql = 'SELECT e.id, e.position_id AS positionId, e.name, e.results_published_at AS publishedAt,
               p.name AS position
        FROM elections e
        INNER JOIN positions p ON p.id = e.position_id
        WHERE e.results_published = 1';
if ($electionId) {
    $sql .= ' AND e.id = :election_id';
}
$sql .= ' ORDER BY e.results_published_at DESC, e.id DESC';
$statement = db()->prepare($sql);
if ($electionId) {
    $statement->execute(['election_id' => $electionId]);
} else {
    $statement->execute();
}
$elections = $statement->fetchAll();

$candidateStatement = db()->prepare(
    'SELECT c.id, c.candidate_number AS candidateNumber, u.name,
            pp.name AS party, COUNT(DISTINCT v.id) AS votes
     FROM candidates c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN political_parties pp ON pp.id = c.party_id
     LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = :election_id
     WHERE EXISTS (
         SELECT 1
         FROM applications a
         WHERE a.candidate_id = c.id
           AND a.position_id = :position_id
           AND a.status = \'Approved\'
     )
     GROUP BY c.id, c.candidate_number, u.name, pp.name
     ORDER BY votes DESC, u.name'
);

$payload = [];
$seenPositions = [];
foreach ($elections as $election) {
    $positionId = (int) $election['positionId'];
    if (isset($seenPositions[$positionId])) {
        continue;
    }
    $seenPositions[$positionId] = true;

    $candidateStatement->execute([
        'election_id' => (int) $election['id'],
        'position_id' => $positionId,
    ]);
    $candidates = [];
    $seenCandidates = [];
    foreach ($candidateStatement->fetchAll() as $row) {
        $candidateId = (int) $row['id'];
        if (isset($seenCandidates[$candidateId])) {
            continue;
        }
        $seenCandidates[$candidateId] = true;
        $candidates[] = [
            'id' => $candidateId,
            'candidateNumber' => $row['candidateNumber'] ?? '',
            'name' => $row['name'],
            'party' => $row['party'] ?? '',
            'votes' => (int) $row['votes'],
        ];
    }
    $payload[] = [
        'id' => (int) $election['id'],
        'name' => $election['name'],
        'position' => $election['position'],
        'publishedAt' => $election['publishedAt'],
        'totalVotes' => array_sum(array_column($candidates, 'votes')),
        'candidates' => $candidates,
    ];
}

respond(['success' => true, 'elections' => $payload]);
