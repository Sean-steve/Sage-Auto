#!/usr/bin/env bash
set -euo pipefail
# Avoid accidental data loss. Database reset is not a synonym for migration.
echo "ERROR: db:reset is intentionally disabled until a real, local-only, backup-aware reset workflow is implemented." >&2
echo "Use pnpm db:migrate to apply PostgreSQL schema updates without deleting records." >&2
exit 2
