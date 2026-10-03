#!/usr/bin/env bash
# ============================================================================
# CAR HIRE OS — DATABASE MIGRATION CLI & RUNNER SCRIPT
# Safe, versioned, locked, transactional PostgreSQL migration execution
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/infrastructure/database/migrations"

NODE_ENV="${NODE_ENV:-development}"
APP_ENV="${APP_ENV:-$NODE_ENV}"

echo "======================================================================"
echo "CAR HIRE OS — DATABASE MIGRATION ENGINE"
echo "Environment: ${APP_ENV} | Directory: ${MIGRATIONS_DIR}"
echo "======================================================================"

# Step 1: Pre-flight checks
if [ ! -d "${MIGRATIONS_DIR}" ]; then
  echo "❌ Error: Migrations directory not found at ${MIGRATIONS_DIR}" >&2
  exit 1
fi

echo "🔍 Auditing SQL migration scripts on disk..."
for sql_file in "${MIGRATIONS_DIR}"/*.sql; do
  [ -f "$sql_file" ] || continue
  filename="$(basename "$sql_file")"
  echo "  - Found: ${filename}"
done

# Step 2: Execute TypeScript Migration Runner under transactional safety and lock
echo ""
echo "🚀 Executing transactional migration engine..."

node --import tsx -e "
import { ProductionMigrationEngine } from './packages/database/src/migration-engine';
import path from 'path';

async function run() {
  const dir = path.resolve(process.cwd(), 'infrastructure/database/migrations');
  console.log('[Runner] Acquiring exclusive advisory lock on database...');
  const result = await ProductionMigrationEngine.applyMigrations(dir, 'cli-runner-' + process.pid);
  console.log('[Runner] Migration status: Successfully processed ' + result.applied.length + ' pending migration(s) in ' + result.executionTimeMs + 'ms.');
  if (result.applied.length > 0) {
    result.applied.forEach(m => console.log('  ✔ Applied: ' + m));
  } else {
    console.log('  ✔ Database schema is fully up-to-date.');
  }
}

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
"

echo "======================================================================"
echo "✅ PostgreSQL Database Migrations Completed Cleanly."
echo "======================================================================"
