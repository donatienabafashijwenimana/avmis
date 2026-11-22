<?php

declare(strict_types=1);

function db(bool $withDatabase = true): PDO
{
    static $connections = [];
    global $config;

    $key = $withDatabase ? 'database' : 'server';
    if (isset($connections[$key])) {
        return $connections[$key];
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%s%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_port'],
        $withDatabase ? ';dbname=' . $config['db_name'] : ''
    );

    try {
        $connections[$key] = new PDO($dsn, $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $exception) {
        fail('Database connection failed. Check api/config.php and MySQL.', 503, 'database_unavailable');
    }

    return $connections[$key];
}
