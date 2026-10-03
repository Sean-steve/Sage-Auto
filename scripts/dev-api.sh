#!/usr/bin/env bash
set -euo pipefail

port="${API_PORT:-3001}"

if command -v ss >/dev/null 2>&1 && ss -ltn | awk -v port=":${port}" '$4 ~ (port "$") { found = 1 } END { exit !found }'; then
  printf '@carhire/api is already running on port %s.\n' "$port"
  exit 0
fi

exec tsx watch apps/api/src/main.ts
