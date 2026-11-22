<?php

require __DIR__ . '/bootstrap.php';

require_auth('admin');

$positionRows = db()->query(
    'SELECT p.id, p.name, p.category, p.status,
            e.id AS election_id, e.name AS election, e.status AS election_status
     FROM positions p
     LEFT JOIN elections e ON e.position_id = p.id
     ORDER BY p.name, p.id'
)->fetchAll();

$applicationRows = db()->query(
    'SELECT a.id, a.status, a.submitted_at,
            c.id AS candidate_id, c.status AS candidate_status,
            u.name AS candidate,
            pp.id AS party_id, pp.name AS party,
            p.id AS position_id, p.name AS position,
            e.id AS election_id, e.name AS election, e.status AS election_status
     FROM applications a
     INNER JOIN candidates c ON c.id = a.candidate_id
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN political_parties pp ON pp.id = c.party_id
     INNER JOIN positions p ON p.id = a.position_id
     LEFT JOIN elections e ON e.position_id = a.position_id
     ORDER BY p.name, u.name, a.id'
)->fetchAll();

$voteRows = db()->query(
    'SELECT vo.id, vo.cast_at,
            e.id AS election_id, e.name AS election, e.status AS election_status,
            p.id AS position_id, p.name AS position,
            c.id AS candidate_id, c.status AS candidate_status,
            cu.name AS candidate,
            pp.id AS party_id, pp.name AS party,
            a.status AS application_status
     FROM votes vo
     INNER JOIN elections e ON e.id = vo.election_id
     INNER JOIN positions p ON p.id = e.position_id
     INNER JOIN candidates c ON c.id = vo.candidate_id
     INNER JOIN users cu ON cu.id = c.user_id
     LEFT JOIN political_parties pp ON pp.id = c.party_id
     LEFT JOIN applications a ON a.candidate_id = vo.candidate_id AND a.position_id = e.position_id
     ORDER BY p.name, vo.cast_at DESC, vo.id DESC'
)->fetchAll();

$electionRows = db()->query(
    'SELECT e.id, e.name, e.description, e.status,
            e.application_starts_at, e.application_ends_at, e.application_status,
            e.voting_starts_at, e.voting_ends_at, e.voting_access,
            e.results_published, e.results_published_at,
            p.id AS position_id, p.name AS position,
            COUNT(DISTINCT a.id) AS application_count,
            COUNT(DISTINCT CASE WHEN a.status = \'Approved\' THEN a.candidate_id END) AS approved_candidate_count,
            COUNT(DISTINCT CASE WHEN a.status = \'Rejected\' THEN a.candidate_id END) AS rejected_candidate_count,
            COUNT(DISTINCT vo.id) AS vote_count
     FROM elections e
     INNER JOIN positions p ON p.id = e.position_id
     LEFT JOIN applications a ON a.position_id = e.position_id
     LEFT JOIN votes vo ON vo.election_id = e.id
     GROUP BY e.id, e.name, e.description, e.status,
              e.application_starts_at, e.application_ends_at, e.application_status,
              e.voting_starts_at, e.voting_ends_at, e.voting_access,
              e.results_published, e.results_published_at, p.id, p.name
     ORDER BY e.id DESC'
)->fetchAll();

respond([
    'success' => true,
    'positions' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'category' => $row['category'],
        'status' => $row['status'],
        'electionId' => $row['election_id'] !== null ? (int) $row['election_id'] : null,
        'election' => $row['election'] ?? '',
        'electionStatus' => $row['election_status'] ?? '',
    ], $positionRows),
    'applications' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'],
        'status' => $row['status'],
        'submittedAt' => $row['submitted_at'],
        'candidateId' => (int) $row['candidate_id'],
        'candidateStatus' => $row['candidate_status'],
        'candidate' => $row['candidate'],
        'partyId' => $row['party_id'] !== null ? (int) $row['party_id'] : null,
        'party' => $row['party'] ?? 'Independent',
        'positionId' => (int) $row['position_id'],
        'position' => $row['position'],
        'electionId' => $row['election_id'] !== null ? (int) $row['election_id'] : null,
        'election' => $row['election'] ?? '',
        'electionStatus' => $row['election_status'] ?? '',
    ], $applicationRows),
    'votes' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'],
        'castAt' => $row['cast_at'],
        'electionId' => (int) $row['election_id'],
        'election' => $row['election'],
        'electionStatus' => $row['election_status'],
        'positionId' => (int) $row['position_id'],
        'position' => $row['position'],
        'candidateId' => (int) $row['candidate_id'],
        'candidateStatus' => $row['candidate_status'],
        'candidate' => $row['candidate'],
        'partyId' => $row['party_id'] !== null ? (int) $row['party_id'] : null,
        'party' => $row['party'] ?? 'Independent',
        'applicationStatus' => $row['application_status'] ?? 'Not received',
    ], $voteRows),
    'elections' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'description' => $row['description'] ?? '',
        'status' => $row['status'],
        'applicationStartsAt' => $row['application_starts_at'],
        'applicationEndsAt' => $row['application_ends_at'],
        'applicationStatus' => $row['application_status'],
        'votingStartsAt' => $row['voting_starts_at'],
        'votingEndsAt' => $row['voting_ends_at'],
        'votingAccess' => $row['voting_access'],
        'resultsPublished' => (bool) $row['results_published'],
        'resultsPublishedAt' => $row['results_published_at'],
        'positionId' => (int) $row['position_id'],
        'position' => $row['position'],
        'applicationCount' => (int) $row['application_count'],
        'approvedCandidateCount' => (int) $row['approved_candidate_count'],
        'rejectedCandidateCount' => (int) $row['rejected_candidate_count'],
        'voteCount' => (int) $row['vote_count'],
    ], $electionRows),
]);
