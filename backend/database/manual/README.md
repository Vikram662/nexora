# Manual SQL

Reviewed SQL that is run by hand on stag and prod (never applied automatically).

- One change per pair of files: `YYYYMMDD_<name>.sql` and `YYYYMMDD_<name>_rollback.sql`.
- Each file starts with a comment: what it does, which environments, expected rows affected.
- It is reviewed in the same PR as the code that needs it.
- Take an RDS snapshot before running it on prod; run on stag first.
- Plain schema changes are Prisma migrations (`prisma/migrations`), not files here.
