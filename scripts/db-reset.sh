#!/usr/bin/env bash
set -e

echo "==> [CAR HIRE OS] Resetting local database..."
bash scripts/db-migrate.sh
bash scripts/db-seed.sh
echo "==> Database reset and seeded successfully."
