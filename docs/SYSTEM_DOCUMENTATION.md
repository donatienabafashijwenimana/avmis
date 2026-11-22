# Automated Voting System

This project implements the practical-assessment workflow described in
`AUTOMATED VOTING SYSTEM.docx`: administrators manage positions, candidates,
voters, polling districts, elections, and reporting; voters authenticate and
cast one vote per open election; candidates can maintain their campaign
profile.

## Modules

- Login, token authentication, role protection, registration, and logout.
- Candidate CRUD with MUI DataGrid, filtering/sorting/pagination, image preview,
  details dialog, edit dialog, and deletion confirmation.
- Voter CRUD with voter ID stored in the `voter` profile table, image preview,
  status activation/deactivation, validation, and DataGrid management.
- Electoral positions and political parties.
- Election CRUD with position assignment, description, schedule, Draft/Open/
  Suspended/Closed status control, and vote counts.
- Polling district CRUD with codes, status, and registered-voter counts.
- Voting cards, candidate details, confirmation dialog, backend eligibility and
  schedule checks, transaction handling, and a database unique constraint for
  one vote per voter per election.
- Results and reports with Recharts bar, pie, and line charts, turnout by
  district, current leads, automatic 30-second dashboard refresh, and CSV export.
- Persistent light/dark theme toggles in the header and sidebar.
- Audit logging for administrative changes.

## API endpoints

All protected requests use `Authorization: Bearer <token>`.

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/login.php` | POST | Authenticate a user and issue a token |
| `/api/logout.php` | POST | Revoke the current bearer token |
| `/api/register.php` | POST | Register voter or candidate accounts |
| `/api/candidates.php` | GET, POST, PUT, DELETE | Candidate retrieval and administration |
| `/api/voters.php` | GET, POST, PUT, DELETE | Voter administration |
| `/api/positions.php` | GET, POST, PUT, DELETE | Electoral positions |
| `/api/political_parties.php` | GET, POST, PUT, DELETE | Political parties |
| `/api/elections.php` | GET, POST, PUT, DELETE | Election events and status control |
| `/api/polling_districts.php` | GET, POST, PUT, DELETE | Polling districts |
| `/api/votes.php` | POST | Secure vote submission |
| `/api/analytics.php` | GET | Aggregated results, turnout, trends, and reports |
| `/api/applications.php` | GET | Candidate applications for administrators |

## Database model

`users` stores shared account credentials and role data. `voter` stores the
voter-specific voter ID and links one-to-one to `users`; voter ID is deliberately
not stored in `users`. `candidates` links candidate profiles to users, parties,
and positions. `elections` links one event to a position, while `votes` links a
voter profile, election, and candidate. The unique key
`one_vote_per_election (voter_id, election_id)` enforces single voting at the
database layer. `audit_logs` records authorized administrative changes.

Initialize or migrate the database with:

```bash
php api/seed.php
```

Start the backend and frontend from the project root as described in `README.md`.
