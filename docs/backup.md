# Backups

## Making a backup

You need the PostgreSQL client tools, **version 18 or newer**, because `pg_dump` refuses to back up a server newer than itself. They come with PostgreSQL from <https://www.postgresql.org/download/>. On Windows, the installer can install the command line tools alone.

```bash
pnpm db:backup
```

This reads `DATABASE_URL` from your environment or from `apps/api/.env`, and saves a compressed file such as `backups/shikshya-2026-11-07-14-30.dump`. The `backups` folder is ignored by git, because **a backup holds everyone's personal data and password hashes**. Keep copies somewhere private.

To save a backup of a different database, set it first: `DATABASE_URL=postgresql://... pnpm db:backup`.

## Restoring a backup

**This replaces the data in the target database, so check that `DATABASE_URL` points at the one you mean.**

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" backups/shikshya-2026-11-07-14-30.dump
```

If `DATABASE_URL` has `connection_limit` or `pool_timeout` on the end, remove them first, because they are settings for Prisma and `pg_restore` rejects them.

Then check it worked:

1. Run `pnpm --filter @shikshya/api exec prisma migrate status`. It should say the database is up to date.
2. Start the app and log in.
3. Open a student's results and a recent invoice.

If the backup is older than the current code, run `pnpm --filter @shikshya/api exec prisma migrate deploy` to bring it up to date.

Restoring to a database with no pgvector, such as `pnpm db:local`, reports an error about the `embedding` column and its index. Everything else restores, and college-rules search uses keywords instead.

## Uploaded files

`pg_dump` covers the database, not uploaded files. With `STORAGE_DRIVER=local`, copy the `apps/api/uploads` folder as well. With S3-compatible storage, use the provider's own tools or versioning.

## Neon's own history

Neon keeps a recent history of the database on its side, and can restore a point in time or create a branch from one, which is the quickest way to undo a mistake. How far back it goes depends on the plan: see [Neon's documentation](https://neon.com/docs/introduction/branch-restore.md). It lives in the same place as the database, so also keep `pg_dump` backups of anything important.

## Before relying on this

A backup you have never restored is only a hope. Restore one into a spare database at least once, and do the checks above. `pg_dump` was not installed on the computer this was written on, so `pnpm db:backup` has only been checked as far as its message when `pg_dump` is missing. Try a full backup and restore yourself before depending on it.
