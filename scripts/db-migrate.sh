#!/usr/bin/env bash
# Real PostgreSQL migrations. No simulated registry, mock success, or destructive reset.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
dir="infrastructure/database/migrations"

# CI can provide exported DATABASE_URL. Otherwise respect the developer's
# git-ignored .env.local/.env without printing credentials.
if [[ -z "${DATABASE_URL:-}" && -z "${PGDATABASE:-}" ]]; then
  local_env=""
  if [[ -f ".env.local" ]]; then local_env=".env.local"
  elif [[ -f ".env" ]]; then local_env=".env"; fi
  if [[ -n "$local_env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$local_env"
    set +a
  fi
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: PostgreSQL psql client is required. Install postgresql-client or postgresql-client-17." >&2
  exit 2
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "ERROR: sha256sum is required for migration integrity." >&2
  exit 2
fi
if [[ ! -d "$dir" ]]; then
  echo "ERROR: No migration directory: $dir" >&2
  exit 2
fi
if [[ "${DB_MIGRATIONS_ALLOW_PRODUCTION:-false}" != "true" ]] && [[ "${NODE_ENV:-development}" == "production" || "${APP_ENV:-development}" == "production" ]]; then
  echo "ERROR: This command defaults to local development only; production migration requires an explicit deployment procedure." >&2
  exit 2
fi

# Explicitly require a DB connection rather than accidentally connecting to
# developer's OS user/default database. libpq honors PGHOST, PGPORT, etc.
if [[ -z "${DATABASE_URL:-}" && -z "${PGDATABASE:-}" ]]; then
  echo "ERROR: Set DATABASE_URL (or PGDATABASE + PGHOST/PGPORT/PGUSER) to the intended local PostgreSQL database." >&2
  exit 2
fi
if [[ "${DATABASE_URL:-}" == *"schema="* ]]; then
  echo "ERROR: DATABASE_URL contains a Prisma-only schema= parameter not accepted by psql. Remove ?schema=public." >&2
  exit 2
fi
url="${DATABASE_URL:-}"
connection=( )
if [[ -n "$url" ]]; then
  connection=("$url")
fi
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
export PGAPPNAME="sage-auto-local-migration"
echo "Checking live PostgreSQL connection..."
if ! psql -X -qAt -v ON_ERROR_STOP=1 "${connection[@]}" -c "SELECT 1" >/dev/null; then
  echo "ERROR: Live PostgreSQL connection failed. No migrations were recorded." >&2
  exit 1
fi
# Ledger is persisted INSIDE PostgreSQL. Never claim success based on memory.
psql -X -q -v ON_ERROR_STOP=1 "${connection[@]}" -c '
  CREATE TABLE IF NOT EXISTS sage_auto_schema_migrations (
    filename TEXT PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );' >/dev/null

shopt -s nullglob
files=("$dir"/*.sql)
if (( ${#files[@]} == 0 )); then
  echo "ERROR: No migration SQL files were found." >&2
  exit 2
fi

# The entire check-and-apply step for each migration happens in a single
# Postgres transaction protected by a shared PostgreSQL advisory lock.
count=0
for file in "${files[@]}"; do
  filename="${file##*/}"
  if [[ ! "$filename" =~ ^[a-zA-Z0-9_.-]+\.sql$ ]]; then
    echo "ERROR: Unsafe migration filename: $filename" >&2
    exit 2
  fi
  checksum="$(sha256sum "$file" | cut -d' ' -f1)"
  echo "Migration: $filename"
  # All \\gset values are calculated while holding the transaction lock.
  # psql variables are safely SQL-literal-quoted via :'filename'.
  script="$(mktemp)"
  {
    printf '%s\n' '\set ON_ERROR_STOP on'
    printf '%s\n' 'BEGIN;'
    printf '%s\n' 'SELECT pg_advisory_xact_lock(20471107);'
    printf '%s\n' "SELECT EXISTS(SELECT 1 FROM sage_auto_schema_migrations WHERE filename=:'filename') AS applied,"
    printf '%s\n' " EXISTS(SELECT 1 FROM sage_auto_schema_migrations WHERE filename=:'filename' AND checksum<>:'checksum') AS mismatch \\gset"
    printf '%s\n' '\if :mismatch'
    printf '%s\n' "  \\echo ERROR: Previously applied migration was modified. Stop and investigate."
    printf '%s\n' "  SELECT 1/0; -- fail closed"
    printf '%s\n' '\endif'
    printf '%s\n' '\if :applied'
    printf '%s\n' "  \\echo Already applied (checksum verified)."
    printf '%s\n' '\else'
    printf '%s\n' "\\i $file"
    printf '%s\n' "INSERT INTO sage_auto_schema_migrations(filename,checksum) VALUES (:'filename',:'checksum');"
    printf '%s\n' '\endif'
    printf '%s\n' 'COMMIT;'
  } > "$script"
  if ! psql -X -q -v ON_ERROR_STOP=1 -v "filename=$filename" -v "checksum=$checksum" "${connection[@]}" -f "$script"; then
    rm -f "$script"
    echo "ERROR: $filename did not apply. PostgreSQL transaction rolled back; no success reported." >&2
    exit 1
  fi
  rm -f "$script"
  ((count+=1))
done
echo "Verified $count versioned SQL migrations against live PostgreSQL."
echo "NOTE: The existing application repositories still use SQLite; schema migration is not application data integration."
