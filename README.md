# Automated Voting System

React/Vite frontend with a PHP 8 + MySQL backend.

## Backend setup

The PHP API is in [`api/`](api). Configure the database connection in [`api/config.php`](api/config.php), or set these environment variables:

```text
VOTING_DB_HOST=127.0.0.1
VOTING_DB_PORT=3306
VOTING_DB_NAME=voting_system
VOTING_DB_USER=root
VOTING_DB_PASSWORD=1234
VOTING_APP_URL=http://localhost:5173
VOTING_MAIL_FROM=no-reply@votingsystem.local
VOTING_SMTP_HOST=smtp.gmail.com
VOTING_SMTP_PORT=587
VOTING_SMTP_USERNAME=your email username
VOTING_SMTP_PASSWORD=your SMTP password or app password
VOTING_SMTP_ENCRYPTION=tls
VOTING_SMTP_FROM=your verified sender email
```

Create the database tables and demo accounts with the PHP setup script:

```bash
php api/seed.php
```

Or create the normalized database schema from [`database.sql`](database.sql):

```bash
mysql -u root -p < database.sql
```

Then run `php api/seed.php` to add the positions, parties, elections, demo
accounts, candidates, polling districts, and migration data.

The local default connection uses `root` with password `1234`. You can override
it with the `VOTING_DB_USER` and `VOTING_DB_PASSWORD` environment variables.
Set `VOTING_APP_URL` to the URL where the React app is reachable so password
reset links point to the correct frontend. Password recovery uses PHPMailer over
authenticated SMTP. Install dependencies with `composer install`, then set the
SMTP variables for Gmail, Brevo SMTP, or Mailtrap SMTP. PHPMailer does not use
Mailtrap or Brevo API tokens.

For local development, these variables can be placed in the ignored
`.env.local` file in the project root. The PHP configuration loads that file
when a corresponding server environment variable is not already defined.

Start the PHP API from the project root:

```bash
php -S 127.0.0.1:8000 -t .
```

In another terminal, start the React app:

```bash
npm install
npm run dev
```

Vite proxies `/api` requests to the PHP server during development. For Apache/XAMPP, place the project in the web root and keep the `api` directory accessible at `/api`.

## Demo logins

```text
Admin:  112005 / Admin@123
Voter:  donaabafashijwe@gmail.com / Dna1@123
Candidate: candidate01 / Candidate@123
```

The frontend no longer stores voters, candidates, passwords, or votes in `localStorage`. Passwords are hashed in PHP with `password_hash()`, authentication uses expiring bearer tokens, and the database enforces one vote per voter per election.

## Assessment modules

The project includes candidate and voter CRUD, electoral positions and parties,
election scheduling/status control, polling-district management, secure voting,
aggregated Recharts reports with CSV export, persistent light/dark themes, and
administrative audit logging. See [`docs/SYSTEM_DOCUMENTATION.md`](docs/SYSTEM_DOCUMENTATION.md)
and [`docs/ERD.md`](docs/ERD.md) for the module/API and relationship overview.

Voter IDs are stored in the role-specific `voter` table; they are not stored in
the shared `users` table. Voters can authenticate with their voter ID or email,
while administrators and candidates use their username or email. Run
`php api/seed.php` once to apply the schema migration to an existing database
and seed the additional election tables.

Users can select **Forgot password?** on the login page. The system emails a
one-time reset link that expires after 60 minutes, invalidates existing sessions
after a successful reset, and can be used only once.
