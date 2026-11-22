<?php

require __DIR__ . '/bootstrap.php';

function position_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'category' => $row['category'],
        'criteria' => $row['criteria'],
        'requiredDocuments' => $row['required_documents'] ?? '',
        'status' => $row['status'],
    ];
}

function get_position(int $id): ?array
{
    $statement = db()->prepare('SELECT id, name, category, criteria, required_documents, status FROM positions WHERE id = :id LIMIT 1');
    $statement->execute(['id' => $id]);
    $row = $statement->fetch();
    return $row ? position_payload($row) : null;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $rows = db()->query(
        'SELECT id, name, category, criteria, required_documents, status
         FROM positions WHERE status = \'Active\' ORDER BY name'
    )->fetchAll();
    respond(['success' => true, 'positions' => array_map('position_payload', $rows)]);
}

$user = require_auth('admin');
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

if ($method === 'POST') {
    $data = request_body();
    $name = validate_text_value((string) ($data['name'] ?? ''), 'Position name', 120);
    $category = validate_text_value((string) ($data['category'] ?? ''), 'Position category', 80);
    $criteria = validate_text_value((string) ($data['criteria'] ?? ''), 'Eligibility criteria', 3000);
    $requiredDocuments = validate_text_value((string) ($data['requiredDocuments'] ?? ''), 'Required documents', 2000);

    $statement = db()->prepare(
        'INSERT INTO positions (name, category, criteria, required_documents)
         VALUES (:name, :category, :criteria, :required_documents)'
    );
    try {
        $statement->execute([
            'name' => $name, 'category' => $category, 'criteria' => $criteria, 'required_documents' => $requiredDocuments,
        ]);
    } catch (PDOException $exception) {
        fail('That position already exists.', 409, 'duplicate_position');
    }
    $positionId = (int) db()->lastInsertId();
    audit_log((int) $user['id'], 'created', 'position', $positionId, ['name' => trim($data['name'])]);
    respond(['success' => true, 'position' => get_position($positionId)], 201);
}

if (!$id) {
    fail('A position ID is required.', 422, 'missing_id');
}

if ($method === 'PUT') {
    $data = request_body();
    $name = validate_text_value((string) ($data['name'] ?? ''), 'Position name', 120);
    $category = validate_text_value((string) ($data['category'] ?? ''), 'Position category', 80);
    $criteria = validate_text_value((string) ($data['criteria'] ?? ''), 'Eligibility criteria', 3000);
    $requiredDocuments = validate_text_value((string) ($data['requiredDocuments'] ?? ''), 'Required documents', 2000);

    $statement = db()->prepare(
        'UPDATE positions
         SET name = :name, category = :category, criteria = :criteria,
             required_documents = :required_documents
         WHERE id = :id'
    );
    try {
        $statement->execute([
            'id' => $id,
            'name' => $name, 'category' => $category, 'criteria' => $criteria, 'required_documents' => $requiredDocuments,
        ]);
    } catch (PDOException $exception) {
        fail('That position already exists.', 409, 'duplicate_position');
    }
    $position = get_position($id);
    if (!$position) {
        fail('Position not found.', 404, 'not_found');
    }
    audit_log((int) $user['id'], 'updated', 'position', $id);
    respond(['success' => true, 'position' => $position]);
}

if ($method === 'DELETE') {
    $statement = db()->prepare("UPDATE positions SET status = 'Inactive' WHERE id = :id");
    $statement->execute(['id' => $id]);
    if (!$statement->rowCount()) {
        fail('Position not found.', 404, 'not_found');
    }
    audit_log((int) $user['id'], 'deactivated', 'position', $id);
    respond(['success' => true]);
}

fail('Method not allowed.', 405, 'method_not_allowed');
