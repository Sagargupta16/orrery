#!/usr/bin/env bash
# Seeds the empty run workspace with the serverless API fixture repository. Runs only with
# --scaffold. The answer key (expected.json) stays behind, so the agent never sees it.
set -euo pipefail
src="$(dirname "${BASH_SOURCE[0]:-$0}")/../../fixtures/serverless-api/repo"
if [ ! -d "$src" ]; then
  echo "fixture not found: $src" >&2
  exit 1
fi
cp -R "$src/." .
