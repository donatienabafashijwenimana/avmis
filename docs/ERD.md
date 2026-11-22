# Entity relationships

```text
users 1 ─── 0..1 voter
users 1 ─── 0..1 candidates ─── * votes
political_parties 1 ─── * candidates
positions 1 ─── * candidates
positions 1 ─── * elections ─── * votes
voter 1 ─── * votes
users 1 ─── * auth_tokens
users 1 ─── * audit_logs
```

The database schema is defined in [`api/schema.sql`](../api/schema.sql), and
`api/seed.php` creates or migrates the database and seed data.
