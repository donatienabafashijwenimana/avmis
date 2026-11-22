<?php

require __DIR__ . '/bootstrap.php';
$admin = require_auth('admin');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Only POST requests are allowed.', 405, 'method_not_allowed');
}

$connection = db();
$connection->beginTransaction();
try {
    $connection->exec('DELETE FROM votes');
    $connection->commit();
    try {
        audit_log((int) $admin['id'], 'reset_votes', 'votes');
    } catch (Throwable $auditException) {
        // Vote reset has already committed; audit logging must not turn it into a false failure.
    }
} catch (Throwable $exception) {
    if ($connection->inTransaction()) {
        $connection->rollBack();
    }
    fail('Votes could not be reset.', 500, 'reset_failed');
}

respond(['success' => true]);
