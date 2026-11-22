<?php

require __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = require_auth();
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

if ($method === 'GET') {
    $rows = db()->query(
        'SELECT d.id, d.name, d.code, d.status, d.created_at AS createdAt,
                COUNT(u.id) AS voterCount
         FROM polling_districts d
         LEFT JOIN voter v ON v.polling_district_id = d.id
         LEFT JOIN users u ON u.id = v.user_id AND u.role = \'voter\'
         GROUP BY d.id, d.name, d.code, d.status, d.created_at
         ORDER BY d.name'
    )->fetchAll();
    respond(['success' => true, 'districts' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'code' => $row['code'],
        'status' => $row['status'],
        'createdAt' => $row['createdAt'],
        'voterCount' => (int) $row['voterCount'],
    ], $rows)]);
}

if ($user['role'] !== 'admin') {
    fail('Only administrators can manage polling districts.', 403, 'forbidden');
}

if ($method === 'POST' || $method === 'PUT') {
    $data = request_body();
    $name = validate_text_value((string) ($data['name'] ?? ''), 'District name', 120);
    $code = validate_code_value((string) ($data['code'] ?? ''), 'District code');
    $status = ($data['status'] ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active';

    try {
        if ($method === 'POST') {
            $statement = db()->prepare(
                'INSERT INTO polling_districts (name, code, status)
                 VALUES (:name, :code, :status)'
            );
            $statement->execute(['name' => $name, 'code' => $code, 'status' => $status]);
            $id = (int) db()->lastInsertId();
            audit_log((int) $user['id'], 'created', 'polling_district', $id, ['name' => $name, 'code' => $code]);
        } else {
            if (!$id) {
                fail('A polling district ID is required.', 422, 'missing_id');
            }
            $statement = db()->prepare(
                'UPDATE polling_districts SET name = :name, code = :code, status = :status WHERE id = :id'
            );
            $statement->execute(['id' => $id, 'name' => $name, 'code' => $code, 'status' => $status]);
            audit_log((int) $user['id'], 'updated', 'polling_district', $id, ['name' => $name, 'code' => $code]);
        }
    } catch (PDOException $exception) {
        fail('That polling district name or code already exists.', 409, 'duplicate_district');
    }

    $row = db()->prepare('SELECT id, name, code, status FROM polling_districts WHERE id = :id');
    $row->execute(['id' => $id]);
    respond(['success' => true, 'district' => $row->fetch()], $method === 'POST' ? 201 : 200);
}

if ($method === 'DELETE') {
    if (!$id) {
        fail('A polling district ID is required.', 422, 'missing_id');
    }
    $districtStatement = db()->prepare('SELECT name FROM polling_districts WHERE id = :id LIMIT 1');
    $districtStatement->execute(['id' => $id]);
    $district = $districtStatement->fetch();
    if (!$district) {
        fail('Polling district not found.', 404, 'not_found');
    }

    $connection = db();
    $connection->beginTransaction();
    try {
        $connection->prepare(
            'UPDATE voter SET polling_district_id = NULL WHERE polling_district_id = :id'
        )->execute(['id' => $id]);
        $connection->prepare(
            'UPDATE users u
             INNER JOIN voter v ON v.user_id = u.id
             SET u.polling_district = NULL
             WHERE v.polling_district_id IS NULL AND u.polling_district = :name'
        )->execute(['name' => $district['name']]);
        $connection->prepare('DELETE FROM polling_districts WHERE id = :id')->execute(['id' => $id]);
        $connection->commit();
    } catch (Throwable $exception) {
        if ($connection->inTransaction()) {
            $connection->rollBack();
        }
        throw $exception;
    }
    audit_log((int) $user['id'], 'deleted', 'polling_district', $id, ['name' => $district['name']]);
    respond(['success' => true, 'message' => 'Polling district deleted.']);
}

fail('Method not allowed.', 405, 'method_not_allowed');
