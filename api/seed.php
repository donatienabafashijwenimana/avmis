<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Run this file from the command line.\n");
}

$config = require __DIR__ . '/config.php';
$serverDsn = sprintf(
    'mysql:host=%s;port=%s;charset=utf8mb4',
    $config['db_host'],
    $config['db_port']
);

function table_exists(PDO $connection, string $table): bool
{
    $statement = $connection->prepare('SHOW TABLES LIKE :table');
    $statement->execute(['table' => $table]);
    return (bool) $statement->fetchColumn();
}

function column_exists(PDO $connection, string $table, string $column): bool
{
    $statement = $connection->prepare("SHOW COLUMNS FROM `{$table}` LIKE :column");
    $statement->execute(['column' => $column]);
    return (bool) $statement->fetch();
}

function index_exists(PDO $connection, string $table, string $index): bool
{
    $statement = $connection->prepare(
        'SELECT 1 FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :index LIMIT 1'
    );
    $statement->execute(['table' => $table, 'index' => $index]);
    return (bool) $statement->fetchColumn();
}

function drop_foreign_keys(PDO $connection, string $table): void
{
    if (!table_exists($connection, $table)) {
        return;
    }

    $statement = $connection->prepare(
        'SELECT CONSTRAINT_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND REFERENCED_TABLE_NAME IS NOT NULL'
    );
    $statement->execute(['table' => $table]);
    foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $constraint) {
        $connection->exec("ALTER TABLE `{$table}` DROP FOREIGN KEY `{$constraint}`");
    }
}

function add_foreign_key_if_missing(PDO $connection, string $table, string $constraint, string $definition): void
{
    $statement = $connection->prepare(
        'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = :table AND CONSTRAINT_NAME = :constraint'
    );
    $statement->execute(['table' => $table, 'constraint' => $constraint]);
    if (!$statement->fetchColumn()) {
        $connection->exec("ALTER TABLE `{$table}` ADD CONSTRAINT `{$constraint}` {$definition}");
    }
}

function party_id(PDO $connection, string $name): ?int
{
    $statement = $connection->prepare('SELECT id FROM political_parties WHERE name = ? LIMIT 1');
    $statement->execute([$name]);
    $id = $statement->fetchColumn();
    return $id === false ? null : (int) $id;
}

function position_record(PDO $connection, string $name): ?array
{
    $statement = $connection->prepare(
        'SELECT id, name, category, criteria, required_documents
         FROM positions WHERE name = ? LIMIT 1'
    );
    $statement->execute([$name]);
    $record = $statement->fetch();
    return $record ?: null;
}

function ensure_candidate_user(PDO $connection, int $candidateId, string $name, string $photo, ?int $legacyUserId = null): int
{
    if ($legacyUserId) {
        $statement = $connection->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$legacyUserId]);
        $userId = $statement->fetchColumn();
        if ($userId !== false) {
            return (int) $userId;
        }
    }

    $username = 'candidate' . str_pad((string) $candidateId, 2, '0', STR_PAD_LEFT);
    $email = $username . '@votingsystem.local';
    $statement = $connection->prepare(
        'INSERT INTO users
            (username, name, email, password_hash, role, polling_district, status, id_photo)
         VALUES (?, ?, ?, ?, \'candidate\', \'National\', \'Active\', ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), role = \'candidate\',
           status = \'Active\', id_photo = VALUES(id_photo)'
    );
    $statement->execute([
        $username,
        $name,
        $email,
        password_hash('Candidate@123', PASSWORD_DEFAULT),
        $photo,
    ]);

    $lookup = $connection->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $lookup->execute([$username]);
    return (int) $lookup->fetchColumn();
}

function copy_legacy_votes(PDO $connection, string $table, string $userJoin, string $timeColumn): void
{
    if (!table_exists($connection, $table)) {
        return;
    }

    $sql = "INSERT IGNORE INTO votes (voter_id, election_id, candidate_id, cast_at)
            SELECT v.id, e.id, old_vote.candidate_id, old_vote.`{$timeColumn}`
            FROM `{$table}` old_vote
            INNER JOIN users u ON {$userJoin}
            INNER JOIN voter v ON v.user_id = u.id
            INNER JOIN candidates c ON c.id = old_vote.candidate_id
            INNER JOIN elections e ON e.position_id = (
                SELECT p.id FROM positions p WHERE p.name = old_vote.position LIMIT 1
            )";
    $connection->exec($sql);
}

try {
    $server = new PDO($serverDsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $databaseName = str_replace('`', '``', $config['db_name']);
    $server->exec("CREATE DATABASE IF NOT EXISTS `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $connection = new PDO(
        $serverDsn . ';dbname=' . $config['db_name'],
        $config['db_user'],
        $config['db_password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );

    // Convert the previous denormalized model into the user/profile and election/vote model.
    $needsNormalization = table_exists($connection, 'candidates')
        && (!column_exists($connection, 'candidates', 'user_id')
            || !column_exists($connection, 'voter', 'user_id')
            || !column_exists($connection, 'votes', 'election_id')
            || !column_exists($connection, 'elections', 'position_id'));

    if ($needsNormalization) {
        foreach (['applications', 'candidates', 'voter', 'votes', 'elections'] as $table) {
            drop_foreign_keys($connection, $table);
        }

        foreach (['candidates', 'voter', 'votes', 'elections'] as $table) {
            if (table_exists($connection, $table)) {
                $connection->exec("RENAME TABLE `{$table}` TO `{$table}_pre_normalization`");
            }
        }
    }

    $connection->exec(file_get_contents(__DIR__ . '/schema.sql'));
    if (!column_exists($connection, 'political_parties', 'email')) {
        $connection->exec('ALTER TABLE political_parties ADD email VARCHAR(255) NULL AFTER name');
    }
    $connection->exec("ALTER TABLE political_parties MODIFY status ENUM('Pending', 'Approved', 'Rejected', 'Active', 'Inactive') NOT NULL DEFAULT 'Pending'");
    if (column_exists($connection, 'elections', 'status')) {
        $connection->exec("ALTER TABLE elections MODIFY status ENUM('Draft', 'Open', 'Suspended', 'Closed') NOT NULL DEFAULT 'Open'");
    }
    // Keep voter IDs on voter profiles, not on the shared users table.
    if (!column_exists($connection, 'users', 'username')) {
        $connection->exec('ALTER TABLE users ADD username VARCHAR(32) NULL AFTER id');
    }
    if (!column_exists($connection, 'voter', 'voter_id')) {
        $connection->exec('ALTER TABLE voter ADD voter_id VARCHAR(32) NULL AFTER user_id');
    }
    if (!column_exists($connection, 'voter', 'national_id_document')) {
        $connection->exec('ALTER TABLE voter ADD national_id_document LONGTEXT NULL AFTER voter_id');
    }
    if (!column_exists($connection, 'voter', 'polling_district_id')) {
        $connection->exec('ALTER TABLE voter ADD polling_district_id BIGINT UNSIGNED NULL AFTER voter_id');
    }
    add_foreign_key_if_missing(
        $connection,
        'voter',
        'voter_district_fk',
        'FOREIGN KEY (polling_district_id) REFERENCES polling_districts(id) ON DELETE SET NULL'
    );
    if (!column_exists($connection, 'elections', 'description')) {
        $connection->exec('ALTER TABLE elections ADD description TEXT NULL AFTER name');
    }
    if (!column_exists($connection, 'elections', 'application_starts_at')) {
        $connection->exec('ALTER TABLE elections ADD application_starts_at DATETIME NULL AFTER status');
    }
    if (!column_exists($connection, 'elections', 'application_ends_at')) {
        $connection->exec('ALTER TABLE elections ADD application_ends_at DATETIME NULL AFTER application_starts_at');
    }
    if (!column_exists($connection, 'elections', 'application_status')) {
        $connection->exec("ALTER TABLE elections ADD application_status ENUM('Automatic', 'Open', 'Closed') NOT NULL DEFAULT 'Automatic' AFTER application_ends_at");
    }
    if (!column_exists($connection, 'elections', 'voting_starts_at')) {
        $connection->exec('ALTER TABLE elections ADD voting_starts_at DATETIME NULL AFTER application_ends_at');
    }
    if (!column_exists($connection, 'elections', 'voting_ends_at')) {
        $connection->exec('ALTER TABLE elections ADD voting_ends_at DATETIME NULL AFTER voting_starts_at');
    }
    if (!column_exists($connection, 'elections', 'voting_access')) {
        $connection->exec("ALTER TABLE elections ADD voting_access ENUM('Automatic', 'Open', 'Closed') NOT NULL DEFAULT 'Automatic' AFTER voting_ends_at");
    }
    // Legacy starts_at/ends_at were used for the former single election window.
    // Preserve those dates as application dates before removing the redundant columns.
    if (column_exists($connection, 'elections', 'starts_at')) {
        $connection->exec('UPDATE elections SET application_starts_at = COALESCE(application_starts_at, starts_at)');
    }
    if (column_exists($connection, 'elections', 'ends_at')) {
        $connection->exec('UPDATE elections SET application_ends_at = COALESCE(application_ends_at, ends_at)');
    }
    if (column_exists($connection, 'elections', 'starts_at')) {
        $connection->exec('ALTER TABLE elections DROP COLUMN starts_at');
    }
    if (column_exists($connection, 'elections', 'ends_at')) {
        $connection->exec('ALTER TABLE elections DROP COLUMN ends_at');
    }
    if (!column_exists($connection, 'elections', 'results_published')) {
        $connection->exec('ALTER TABLE elections ADD results_published TINYINT(1) NOT NULL DEFAULT 0 AFTER voting_ends_at');
    }
    if (!column_exists($connection, 'elections', 'results_published_at')) {
        $connection->exec('ALTER TABLE elections ADD results_published_at DATETIME NULL AFTER results_published');
    }
    if (!column_exists($connection, 'elections', 'results_published_by')) {
        $connection->exec('ALTER TABLE elections ADD results_published_by BIGINT UNSIGNED NULL AFTER results_published_at');
    }
    add_foreign_key_if_missing(
        $connection,
        'elections',
        'elections_results_publisher_fk',
        'FOREIGN KEY (results_published_by) REFERENCES users(id) ON DELETE SET NULL'
    );
    if (!column_exists($connection, 'candidates', 'candidate_number')) {
        $connection->exec('ALTER TABLE candidates ADD candidate_number VARCHAR(32) NULL AFTER party_id');
    }
    if (!column_exists($connection, 'candidates', 'national_id')) {
        $connection->exec('ALTER TABLE candidates ADD national_id VARCHAR(16) NULL AFTER party_id');
    }
    if (!column_exists($connection, 'candidates', 'national_id_document')) {
        $connection->exec('ALTER TABLE candidates ADD national_id_document LONGTEXT NULL AFTER national_id');
    }
    if (!column_exists($connection, 'candidates', 'biography')) {
        $connection->exec('ALTER TABLE candidates ADD biography TEXT NULL AFTER candidate_number');
    }
    if (!column_exists($connection, 'candidates', 'status')) {
        $connection->exec("ALTER TABLE candidates ADD status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active' AFTER photo");
    }
    $connection->exec("UPDATE candidates SET national_id = CONCAT('11', LPAD(id, 14, '0')) WHERE national_id IS NULL OR national_id NOT REGEXP '^1[12][0-9]{14}$'");
    $connection->exec("UPDATE candidates SET candidate_number = CONCAT('C-', LPAD(id, 5, '0')) WHERE candidate_number IS NULL OR TRIM(candidate_number) = ''");
    $connection->exec("UPDATE candidates SET biography = '' WHERE biography IS NULL");
    $connection->exec("UPDATE candidates SET photo = '' WHERE photo IS NULL");
    $connection->exec('ALTER TABLE candidates MODIFY candidate_number VARCHAR(32) NOT NULL');
    $connection->exec('ALTER TABLE candidates MODIFY national_id VARCHAR(16) NOT NULL');
    if (!index_exists($connection, 'candidates', 'candidates_national_id_unique')) {
        $connection->exec('ALTER TABLE candidates ADD UNIQUE KEY candidates_national_id_unique (national_id)');
    }
    $connection->exec('ALTER TABLE candidates MODIFY biography TEXT NOT NULL');
    $connection->exec('ALTER TABLE candidates MODIFY photo LONGTEXT NOT NULL');
    // Position assignment belongs to an application, not the candidate profile.
    // Preserve any legacy candidate-position assignments as approved applications before dropping the column.
    if (column_exists($connection, 'candidates', 'position_id')) {
        $connection->exec(
            'INSERT IGNORE INTO applications
                (candidate_id, position_id, status, criteria_confirmed, criteria_snapshot,
                 required_documents_snapshot, application_message)
             SELECT c.id, c.position_id, \'Approved\', 1, p.criteria,
                    p.required_documents, c.campaign_message
             FROM candidates c
             INNER JOIN positions p ON p.id = c.position_id
             LEFT JOIN applications a
                    ON a.candidate_id = c.id AND a.position_id = c.position_id
             WHERE c.position_id IS NOT NULL AND a.id IS NULL'
        );
        $candidatePositionForeignKeys = $connection->query(
            'SELECT DISTINCT CONSTRAINT_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'candidates\'
               AND COLUMN_NAME = \'position_id\' AND REFERENCED_TABLE_NAME IS NOT NULL'
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($candidatePositionForeignKeys as $constraint) {
            $connection->exec("ALTER TABLE candidates DROP FOREIGN KEY `{$constraint}`");
        }
        if (index_exists($connection, 'candidates', 'candidates_position_idx')) {
            $connection->exec('ALTER TABLE candidates DROP INDEX candidates_position_idx');
        }
        $connection->exec('ALTER TABLE candidates DROP COLUMN position_id');
    }
    if (column_exists($connection, 'candidates', 'campaign_message')) {
        $connection->exec(
            'UPDATE applications a
             INNER JOIN candidates c ON c.id = a.candidate_id
             SET a.application_message = c.campaign_message
             WHERE TRIM(c.campaign_message) <> \'\'
               AND (a.application_message IS NULL OR TRIM(a.application_message) = \'\')'
        );
        $connection->exec('ALTER TABLE candidates DROP COLUMN campaign_message');
    }
    if (!column_exists($connection, 'applications', 'application_documents')) {
        $connection->exec('ALTER TABLE applications ADD application_documents LONGTEXT NULL AFTER application_message');
    }
    if (column_exists($connection, 'users', 'voter_id')) {
        $connection->exec(
            "UPDATE users SET username = voter_id
             WHERE role IN ('admin', 'candidate') AND (username IS NULL OR username = '')"
        );
        $connection->exec(
            'INSERT INTO voter (user_id, voter_id)
             SELECT id, voter_id FROM users
             WHERE role = \'voter\' AND voter_id IS NOT NULL AND voter_id <> \'\'
             ON DUPLICATE KEY UPDATE voter_id = VALUES(voter_id)'
        );
        if (index_exists($connection, 'users', 'users_voter_id_unique')) {
            $connection->exec('ALTER TABLE users DROP INDEX users_voter_id_unique');
        }
        $connection->exec('ALTER TABLE users DROP COLUMN voter_id');
    }
    if (!index_exists($connection, 'users', 'users_username_unique')) {
        $connection->exec('ALTER TABLE users ADD UNIQUE KEY users_username_unique (username)');
    }
    if (!index_exists($connection, 'voter', 'voter_id_unique')) {
        $connection->exec('ALTER TABLE voter ADD UNIQUE KEY voter_id_unique (voter_id)');
    }
    $connection->exec("ALTER TABLE users MODIFY role ENUM('admin', 'voter', 'candidate') NOT NULL DEFAULT 'voter'");
} catch (Throwable $exception) {
    fwrite(STDERR, "Setup failed: {$exception->getMessage()}\n");
    exit(1);
}

$passwords = [
    'admin' => password_hash('Admin@123', PASSWORD_DEFAULT),
    'voter' => password_hash('Dna1@123', PASSWORD_DEFAULT),
];

$positions = [
    ['President', 'National', 'At least 35 years old; Rwandan citizen; university degree; 10 years of public leadership experience.', "National ID\nAcademic certificate\nCriminal record certificate\nProof of leadership experience"],
    ['Senator', 'Regional', 'Rwandan citizen; resident of the region; clean legal record; relevant civic or professional experience.', "National ID\nAcademic certificate\nProof of regional residence\nCriminal record certificate"],
    ['Deputy', 'National', 'Rwandan citizen; minimum age requirement met; university degree; public service experience.', "National ID\nAcademic certificate\nCriminal record certificate\nCurriculum vitae"],
    ['Mayor', 'District', 'Rwandan citizen; resident of the district; clean legal record; local leadership experience.', "National ID\nProof of district residence\nCriminal record certificate\nCurriculum vitae"],
    ['Councilor', 'Sector', 'Rwandan citizen; resident of the sector; commitment to public accountability.', "National ID\nProof of sector residence\nCriminal record certificate"],
];
$districts = [
    ['District A - Kigali', 'KGL-A'], ['District B - Huye', 'HUY-B'],
    ['District C - Musanze', 'MSN-C'], ['District D - Rubavu', 'RUB-D'],
    ['District E - Muhanga', 'MUH-E'], ['District F - Nyagatare', 'NYA-F'],
    ['District G - Rusizi', 'RSZ-G'],
];
$districtStatement = $connection->prepare(
    'INSERT INTO polling_districts (name, code) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE status = \'Active\''
);
foreach ($districts as $district) {
    $districtStatement->execute($district);
}
$positionStatement = $connection->prepare(
    'INSERT INTO positions (name, category, criteria, required_documents) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE category = VALUES(category), criteria = VALUES(criteria),
       required_documents = VALUES(required_documents), status = \'Active\''
);
foreach ($positions as $position) {
    $positionStatement->execute($position);
}

$parties = [
    ['RPF-Inkotanyi', 'RPF', 'Unity, accountability, and national transformation.'],
    ['PSD', 'PSD', 'Social development and inclusive governance.'],
    ['PL', 'PL', 'Liberal values and citizen participation.'],
    ['PPC', 'PPC', 'Progress through responsible leadership.'],
    ['PS-Imberakuri', 'PSI', 'Justice, equality, and democratic representation.'],
    ['DGPR', 'DGPR', 'Good governance and public responsibility.'],
    ['UDPR', 'UDPR', 'Democracy, peace, and sustainable development.'],
    ['Independent', 'IND', 'Independent candidate.'],
];
$partyStatement = $connection->prepare(
    'INSERT INTO political_parties (name, abbreviation, slogan, status) VALUES (?, ?, ?, \'Approved\')
     ON DUPLICATE KEY UPDATE abbreviation = VALUES(abbreviation), slogan = VALUES(slogan), status = \'Approved\''
);
foreach ($parties as $party) {
    $partyStatement->execute($party);
}

$users = [
    ['112005', 'Admin', null, $passwords['admin'], 'admin', 'HQ', 'Active', ''],
    [null, 'Emmanuel Habimana', 'donaabafashijwe@gmail.com', $passwords['voter'], 'voter', 'District A - Kigali', 'Active', 'https://ui-avatars.com/api/?name=Emmanuel+Habimana&background=ff9800&color=fff&size=100'],
    [null, 'Diane Mukamana', 'kamana@gmail.com', $passwords['voter'], 'voter', 'District B - Huye', 'Active', 'https://ui-avatars.com/api/?name=Diane+Mukamana&background=9c27b0&color=fff&size=100'],
    [null, 'Samuel Niyonzima', 'kaneza@gmail.com', $passwords['voter'], 'voter', 'District C - Musanze', 'Active', 'https://ui-avatars.com/api/?name=Samuel+Niyonzima&background=00bcd4&color=fff&size=100'],
    [null, 'Claudine Uwera', 'claudine.uwera@gmail.com', $passwords['voter'], 'voter', 'District D - Rubavu', 'Inactive', 'https://ui-avatars.com/api/?name=Claudine+Uwera&background=f44336&color=fff&size=100'],
    [null, 'Abafashijwenimana Donatien', 'adn@gmail.com', $passwords['voter'], 'voter', 'District E - Muhanga', 'Active', 'https://ui-avatars.com/api/?name=Eric+Bizimana&background=607d8b&color=fff&size=100'],
];
$userStatement = $connection->prepare(
    'INSERT INTO users (username, name, email, password_hash, role, polling_district, status, id_photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash),
       role = VALUES(role), polling_district = VALUES(polling_district), status = VALUES(status), id_photo = VALUES(id_photo)'
);
foreach ($users as $seedUser) {
    $userStatement->execute($seedUser);
}

$voterIds = [
    'donaabafashijwe@gmail.com' => '1200580157606056',
    'kamana@gmail.com' => '1200580157606055',
    'kaneza@gmail.com' => '1199056789012345',
    'claudine.uwera@gmail.com' => '1200580157606054',
    'adn@gmail.com' => '1199034567890123',
];
$connection->exec(
    'INSERT IGNORE INTO voter (user_id)
     SELECT id FROM users WHERE role = \'voter\''
);
$voterIdStatement = $connection->prepare(
    'UPDATE voter v INNER JOIN users u ON u.id = v.user_id
     SET v.voter_id = ? WHERE u.email = ?'
);
foreach ($voterIds as $email => $voterId) {
    $voterIdStatement->execute([$voterId, $email]);
}
$connection->exec(
    'UPDATE voter v INNER JOIN users u ON u.id = v.user_id
     LEFT JOIN polling_districts d ON d.name = u.polling_district
     SET v.polling_district_id = d.id'
);

// Every position has one election event. Votes reference this event; elections do not duplicate ballots.
$electionStatement = $connection->prepare(
    'INSERT INTO elections (position_id, name, status) VALUES (?, ?, \'Open\')
     ON DUPLICATE KEY UPDATE name = VALUES(name), status = \'Open\''
);
foreach ($positions as $position) {
    $record = position_record($connection, $position[0]);
    if ($record) {
        $electionStatement->execute([(int) $record['id'], $record['name'] . ' Election']);
    }
}

$candidates = [
    [1, 'Alice Uwimana', 'RPF-Inkotanyi', 'President', 'National', 'https://ui-avatars.com/api/?name=Alice+Uwimana&background=1565c0&color=fff&size=200', 'Building a digital future for all citizens through innovation and technology.', 'At least 35 years old; Rwandan citizen; university degree; 10 years of public leadership experience.'],
    [2, 'Jean Baptiste Nzeyimana', 'PSD', 'President', 'National', 'https://ui-avatars.com/api/?name=Jean+Nzeyimana&background=c62828&color=fff&size=200', 'Education and healthcare reform for a stronger nation.', 'Rwandan citizen; university degree; clean legal record; demonstrated national leadership experience.'],
    [3, 'Marie Claire Mukamana', 'PL', 'President', 'National', 'https://ui-avatars.com/api/?name=Marie+Mukamana&background=2e7d32&color=fff&size=200', 'Empowering women and youth through sustainable development.', 'Rwandan citizen; minimum age requirement met; university degree; public service experience.'],
    [4, 'Patrick Habimana', 'RPF-Inkotanyi', 'Senator', 'Regional', 'https://ui-avatars.com/api/?name=Patrick+Habimana&background=1565c0&color=fff&size=200', 'Strengthening regional infrastructure and economic growth.', 'Rwandan citizen; resident of the region; clean legal record; relevant civic or professional experience.'],
    [5, 'Grace Umutoni', 'PSD', 'Senator', 'Regional', 'https://ui-avatars.com/api/?name=Grace+Umutoni&background=c62828&color=fff&size=200', 'Transparency and accountability in governance.', 'Rwandan citizen; resident of the region; university degree; commitment to public accountability.'],
];

// Migrate candidates from the previous table, creating a candidate account where one did not exist.
$legacyCandidatesTable = table_exists($connection, 'candidates_pre_normalization') ? 'candidates_pre_normalization' : null;
if ($legacyCandidatesTable) {
    foreach ($connection->query("SELECT * FROM `{$legacyCandidatesTable}` ORDER BY id")->fetchAll() as $legacyCandidate) {
        $legacyUserId = null;
        if (column_exists($connection, 'users', 'candidate_id')) {
            $lookup = $connection->prepare('SELECT id FROM users WHERE candidate_id = ? LIMIT 1');
            $lookup->execute([(int) $legacyCandidate['id']]);
            $legacyUserId = $lookup->fetchColumn() ?: null;
        }
        $userId = ensure_candidate_user(
            $connection,
            (int) $legacyCandidate['id'],
            (string) $legacyCandidate['name'],
            (string) ($legacyCandidate['photo'] ?? ''),
            $legacyUserId ? (int) $legacyUserId : null
        );
        $position = position_record($connection, (string) $legacyCandidate['position']);
        $partyId = party_id($connection, (string) $legacyCandidate['party']) ?: party_id($connection, 'Independent');
        if ($position && $partyId) {
            $statement = $connection->prepare(
                'INSERT INTO candidates (id, user_id, party_id, national_id, national_id_document, candidate_number, biography, photo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), party_id = VALUES(party_id),
                   national_id_document = COALESCE(VALUES(national_id_document), national_id_document),
                   candidate_number = VALUES(candidate_number),
                   biography = VALUES(biography), photo = VALUES(photo)'
            );
            $statement->execute([
                (int) $legacyCandidate['id'],
                $userId,
                $partyId,
                '11' . str_pad((string) $legacyCandidate['id'], 14, '0', STR_PAD_LEFT),
                null,
                trim((string) ($legacyCandidate['candidate_number'] ?? '')) ?: 'C-' . str_pad((string) $legacyCandidate['id'], 5, '0', STR_PAD_LEFT),
                trim((string) ($legacyCandidate['biography'] ?? $legacyCandidate['campaign_message'] ?? 'Candidate profile')) ?: 'Candidate profile',
                (string) ($legacyCandidate['photo'] ?? ''),
            ]);
        }
    }
}

$candidateStatement = $connection->prepare(
    'INSERT INTO candidates (id, user_id, party_id, national_id, national_id_document, candidate_number, biography, photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), party_id = VALUES(party_id),
       national_id_document = COALESCE(VALUES(national_id_document), national_id_document),
       candidate_number = VALUES(candidate_number),
       biography = VALUES(biography), photo = VALUES(photo)'
);
foreach ($candidates as $candidate) {
    $candidateUserId = ensure_candidate_user($connection, (int) $candidate[0], (string) $candidate[1], (string) $candidate[5]);
    $position = position_record($connection, $candidate[3]);
    $partyId = party_id($connection, $candidate[2]) ?: party_id($connection, 'Independent');
    if ($position && $partyId) {
        $candidateStatement->execute([
            (int) $candidate[0],
            $candidateUserId,
            $partyId,
            '11' . str_pad((string) $candidate[0], 14, '0', STR_PAD_LEFT),
            null,
            'C-' . str_pad((string) $candidate[0], 5, '0', STR_PAD_LEFT),
            $candidate[6],
            $candidate[5],
        ]);
    }
}
$candidateDetails = [
    1 => ['C-001', 'Experienced public leader focused on innovation and accessible digital services.'],
    2 => ['C-002', 'Community advocate committed to education, health, and accountable public service.'],
    3 => ['C-003', 'Youth and women empowerment advocate with a sustainable development platform.'],
    4 => ['C-004', 'Regional development advocate focused on infrastructure and inclusive growth.'],
    5 => ['C-005', 'Public accountability advocate focused on transparent and responsive institutions.'],
];
$candidateDetailStatement = $connection->prepare(
    'UPDATE candidates SET candidate_number = ?, biography = ? WHERE id = ?'
);
foreach ($candidateDetails as $candidateId => $details) {
    $candidateDetailStatement->execute([$details[0], $details[1], $candidateId]);
}

// Recreate role-specific voter rows without copying common user data into the voter table.
$legacyVoterTable = table_exists($connection, 'voter_pre_normalization') ? 'voter_pre_normalization' : null;
$voterInsert = $connection->prepare('INSERT IGNORE INTO voter (id, user_id) VALUES (?, ?)');
if ($legacyVoterTable && !column_exists($connection, $legacyVoterTable, 'position_id')) {
    foreach ($connection->query("SELECT id, voter_id FROM `{$legacyVoterTable}`")->fetchAll() as $legacyVoter) {
        $lookup = $connection->prepare('SELECT user_id FROM voter WHERE voter_id = ? LIMIT 1');
        $lookup->execute([(string) $legacyVoter['voter_id']]);
        $userId = $lookup->fetchColumn();
        if ($userId !== false) {
            $voterInsert->execute([(int) $legacyVoter['id'], (int) $userId]);
        }
    }
}
$connection->exec(
    'INSERT IGNORE INTO voter (user_id)
     SELECT id FROM users WHERE role = \'voter\''
);

// Keep every voter national ID exactly 16 digits, including migrated records.
$connection->exec("UPDATE voter SET voter_id = CONCAT('11', LPAD(id, 14, '0')) WHERE voter_id IS NULL OR voter_id NOT REGEXP '^1[12][0-9]{14}$'");
$connection->exec('ALTER TABLE voter MODIFY voter_id VARCHAR(16) NULL');

// Move all previous vote-shaped records into votes, while resolving new foreign keys.
if ($legacyVoterTable && column_exists($connection, $legacyVoterTable, 'position_id')) {
    copy_legacy_votes($connection, $legacyVoterTable, "u.id = old_vote.voter_id", 'created_at');
}
if (table_exists($connection, 'votes_pre_normalization')) {
    $legacyVotesTable = 'votes_pre_normalization';
    if (column_exists($connection, $legacyVotesTable, 'user_id')) {
        copy_legacy_votes($connection, $legacyVotesTable, 'u.id = old_vote.user_id', 'created_at');
    } else {
        copy_legacy_votes($connection, $legacyVotesTable, 'v.voter_id = old_vote.voter_id', 'created_at');
    }
}
if (table_exists($connection, 'elections_pre_normalization')) {
    $legacyElectionsTable = 'elections_pre_normalization';
    if (column_exists($connection, $legacyElectionsTable, 'user_id')) {
        copy_legacy_votes($connection, $legacyElectionsTable, 'u.id = old_vote.user_id', 'voted_at');
    } else {
        copy_legacy_votes($connection, $legacyElectionsTable, 'v.voter_id = old_vote.voter_id', 'voted_at');
    }
}

$positionLookup = $connection->prepare(
    'SELECT id, criteria, required_documents FROM positions WHERE name = ? LIMIT 1'
);
$applicationStatement = $connection->prepare(
    'INSERT INTO applications
        (candidate_id, position_id, status, criteria_confirmed, criteria_snapshot,
         required_documents_snapshot, application_message)
     VALUES (?, ?, \'Approved\', 1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE criteria_snapshot = VALUES(criteria_snapshot),
       required_documents_snapshot = VALUES(required_documents_snapshot),
       application_message = VALUES(application_message), status = \'Approved\''
);
foreach ($candidates as $candidate) {
    $positionLookup->execute([$candidate[3]]);
    $positionRecord = $positionLookup->fetch();
    if ($positionRecord) {
        $applicationStatement->execute([
            $candidate[0],
            $positionRecord['id'],
            $positionRecord['criteria'],
            $positionRecord['required_documents'],
            $candidate[6],
        ]);
    }
}

// Remove the old back-reference and restore the application relation after candidates were rebuilt.
if (column_exists($connection, 'users', 'candidate_id')) {
    $connection->exec('ALTER TABLE users DROP COLUMN candidate_id');
}
add_foreign_key_if_missing(
    $connection,
    'applications',
    'applications_candidate_fk',
    'FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE'
);
add_foreign_key_if_missing(
    $connection,
    'applications',
    'applications_position_fk',
    'FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE'
);
add_foreign_key_if_missing(
    $connection,
    'applications',
    'applications_reviewer_fk',
    'FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL'
);

foreach (['candidates_pre_normalization', 'voter_pre_normalization', 'votes_pre_normalization', 'elections_pre_normalization'] as $legacyTable) {
    if (table_exists($connection, $legacyTable)) {
        $connection->exec("DROP TABLE `{$legacyTable}`");
    }
}

echo "Database ready: {$config['db_name']}\n";
echo "Admin login: 112005 / Admin@123\n";
echo "Voter login: donaabafashijwe@gmail.com / Dna1@123\n";
echo "Candidate login: candidate01 / Candidate@123\n";
