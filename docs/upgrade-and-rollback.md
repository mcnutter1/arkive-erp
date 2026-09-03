# Upgrade and Rollback Guide

## Upgrade

Run:

```bash
scripts/update.sh
```

The updater fetches from `origin` and fast-forwards the current branch to the latest remote commit. If HEAD is detached, it uses `UPDATE_BRANCH` (if set) or falls back to `origin/HEAD`.

Behavior:

- Requires explicit tag
- Blocks dirty working tree unless override set
- Acquires deployment lock
- Runs pre-deploy backup
- Rebuilds containers and runs migration
- Runs health checks

## Rollback

Run:

```bash
scripts/rollback.sh <release-tag>
```

Note: database schema rollback may require restoring from backup if migration is not backward compatible.
