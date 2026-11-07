#!/usr/bin/env bash
set -euo pipefail
# Phase 5: no authoritative seeder exists. Never claim phantom demo records.
echo "ERROR: db:seed is not implemented. No records were inserted." >&2
echo "For isolated local accounts use: pnpm review:api (creates an isolated SQLite review DB)." >&2
echo "Production-grade PostgreSQL seeding requires validated, idempotent tenant records." >&2
exit 2
