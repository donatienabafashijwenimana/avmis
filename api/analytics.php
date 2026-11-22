<?php

require __DIR__ . '/bootstrap.php';

require_auth('admin');

$totalVoters = (int) db()->query("SELECT COUNT(*) FROM users WHERE role = 'voter'")->fetchColumn();
$votedVoters = (int) db()->query('SELECT COUNT(DISTINCT voter_id) FROM votes')->fetchColumn();
$totalVotes = (int) db()->query('SELECT COUNT(*) FROM votes')->fetchColumn();

$candidateRows = db()->query(
    'SELECT c.id, c.candidate_number AS candidateNumber, u.name, pp.name AS party, p.name AS position, COUNT(v.id) AS votes
     FROM candidates c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN political_parties pp ON pp.id = c.party_id
     INNER JOIN applications a ON a.candidate_id = c.id AND a.status = \'Approved\'
     INNER JOIN positions p ON p.id = a.position_id
     LEFT JOIN votes v ON v.candidate_id = c.id
     GROUP BY c.id, c.candidate_number, u.name, pp.name, p.name
     ORDER BY votes DESC, u.name'
)->fetchAll();

$districtRows = db()->query(
     "SELECT COALESCE(d.name, NULLIF(u.polling_district, ''), 'Unassigned') AS name,
            COUNT(DISTINCT u.id) AS registered,
            COUNT(DISTINCT v.voter_id) AS voted
     FROM users u
     LEFT JOIN voter vr ON vr.user_id = u.id
     LEFT JOIN polling_districts d ON d.id = vr.polling_district_id
     LEFT JOIN votes v ON v.voter_id = vr.id
     WHERE u.role = 'voter'
     GROUP BY COALESCE(d.name, NULLIF(u.polling_district, ''), 'Unassigned')
     ORDER BY name"
)->fetchAll();

$trendRows = db()->query(
    "SELECT DATE(cast_at) AS date, COUNT(*) AS votes
     FROM votes GROUP BY DATE(cast_at) ORDER BY date"
)->fetchAll();

$electionRows = db()->query(
    'SELECT e.id, e.name, e.status, p.name AS position, COUNT(v.id) AS votes
     FROM elections e
     INNER JOIN positions p ON p.id = e.position_id
     LEFT JOIN votes v ON v.election_id = e.id
     GROUP BY e.id, e.name, e.status, p.name ORDER BY e.id DESC'
)->fetchAll();

respond([
    'success' => true,
    'summary' => [
        'totalVoters' => $totalVoters,
        'votedVoters' => $votedVoters,
        'notVotedVoters' => max(0, $totalVoters - $votedVoters),
        'totalVotes' => $totalVotes,
        'turnout' => $totalVoters ? round(($votedVoters / $totalVoters) * 100, 1) : 0,
    ],
    'candidates' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'], 'candidateNumber' => $row['candidateNumber'] ?? '', 'name' => $row['name'], 'party' => $row['party'] ?? '',
        'position' => $row['position'], 'votes' => (int) $row['votes'],
    ], $candidateRows),
    'districts' => array_map(static fn (array $row): array => [
        'name' => $row['name'], 'registered' => (int) $row['registered'], 'voted' => (int) $row['voted'],
        'turnout' => (int) $row['registered'] ? round(((int) $row['voted'] / (int) $row['registered']) * 100, 1) : 0,
    ], $districtRows),
    'trend' => array_map(static fn (array $row): array => [
        'date' => $row['date'], 'votes' => (int) $row['votes'],
    ], $trendRows),
    'elections' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'], 'name' => $row['name'], 'status' => $row['status'],
        'position' => $row['position'], 'votes' => (int) $row['votes'],
    ], $electionRows),
]);
