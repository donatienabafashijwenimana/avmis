<?php

// Load local development settings without committing credentials. Server-level
// environment variables remain authoritative when they are already defined.
$localEnvFile = dirname(__DIR__) . '/.env.local';
if (is_readable($localEnvFile)) {
    foreach (file($localEnvFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if ($value !== '' && (($value[0] === '"' && substr($value, -1) === '"') || ($value[0] === "'" && substr($value, -1) === "'"))) {
            $value = substr($value, 1, -1);
        }
        if ($name !== '' && getenv($name) === false) {
            putenv($name . '=' . $value);
        }
    }
}

return [
    'db_host' => getenv('VOTING_DB_HOST') ?: '127.0.0.1',
    'db_port' => getenv('VOTING_DB_PORT') ?: '3306',
    'db_name' => getenv('VOTING_DB_NAME') ?: 'voting_system',
    'db_user' => getenv('VOTING_DB_USER') ?: 'root',
    'db_password' => getenv('VOTING_DB_PASSWORD') ?: '1234',
    'token_days' => 7,
    'mail_from' => getenv('VOTING_MAIL_FROM') ?: 'no-reply@votingsystem.local',
    'smtp_host' => getenv('VOTING_SMTP_HOST') ?: '',
    'smtp_port' => (int) (getenv('VOTING_SMTP_PORT') ?: 587),
    'smtp_username' => getenv('VOTING_SMTP_USERNAME') ?: '',
    'smtp_password' => getenv('VOTING_SMTP_PASSWORD') ?: '',
    'smtp_encryption' => strtolower(getenv('VOTING_SMTP_ENCRYPTION') ?: 'tls'),
    'smtp_from' => getenv('VOTING_SMTP_FROM') ?: (getenv('VOTING_MAIL_FROM') ?: 'no-reply@votingsystem.local'),
    'app_url' => rtrim(getenv('VOTING_APP_URL') ?: 'http://localhost:5173', '/'),
    'password_reset_minutes' => 60,
];
