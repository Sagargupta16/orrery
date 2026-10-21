#!/usr/bin/env bash
# Seeds the empty run workspace with the deliberately bad spec at docs/architecture.yaml. Runs only
# with --scaffold. Its measured baseline (score 74.1 at 880 px) is in evals/README.md.
set -euo pipefail
src="$(dirname "${BASH_SOURCE[0]:-$0}")/../../fixtures/bad-spec/repo"
if [ ! -d "$src" ]; then
  echo "fixture not found: $src" >&2
  exit 1
fi
cp -R "$src/." .
