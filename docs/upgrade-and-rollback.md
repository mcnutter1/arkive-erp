# Upgrade and Rollback Guide

## Upgrade

Run:

```bash
scripts/update.sh
```

The updater fetches from `origin` and fast-forwards the current branch to the latest remote commit. If HEAD is detached, it uses `UPDATE_BRANCH` (if set) or falls back to `origin/HEAD`.
By default, `origin` is set to `https://github.com/mcnutter1/arkive-erp.git` (override with `ARKIVE_GIT_REPO_URL` in `.env`).

Operational runtime files are written under `ARKIVE_DATA_ROOT` (default `/opt/arkive`), including deploy locks, deploy history, and backups.

Behavior:

- Pulls latest commit from GitHub remote
- Auto-stashes dirty working tree by default before pull (`AUTO_STASH_DIRTY_DEPLOY=true`)
- Supports explicit dirty deploy override (`ALLOW_DIRTY_DEPLOY=true`)
- Acquires deployment lock
- Runs pre-deploy backup
- Aborts if `COMPOSE_PROJECT_NAME` changes from last successful deploy
- Rebuilds containers and runs migration
- Runs health checks

## Rollback

Run:

```bash
scripts/rollback.sh <release-tag>
```

Note: database schema rollback may require restoring from backup if migration is not backward compatible.
