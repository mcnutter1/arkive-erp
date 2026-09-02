# Backup and Restore Guide

## Backups

Run:

```bash
scripts/backup.sh
```

Artifacts include:

- PostgreSQL dump
- Environment backup
- Integrity checksum file (when available)

## Restore

Run:

```bash
scripts/restore.sh <backup-directory>
```

Restore must be tested in an isolated environment before production changes.
