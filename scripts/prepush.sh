#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
# The pre-push check (release-35, DR-145, DR-251): no conflict marker in
# the tree, then the spec lint, the catalogs' checks, the guards and the
# type checks — what the first CI minute would refuse, and a spec item id
# another branch took.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
pattern='^(<<<<<<< |=======$|>>>>>>> )'
if git grep -nE "$pattern" -- ':!scripts/prepush.sh' ':!scripts/ci-workflow.test.mjs' > /dev/null 2>&1; then
  echo "prepush: conflict markers left in the tree:" >&2
  git grep -nE "$pattern" -- ':!scripts/prepush.sh' ':!scripts/ci-workflow.test.mjs' >&2
  exit 1
fi
npx @sublang/spex lint
# The root build type-checks every workspace, compiles the catalogs and
# runs their checks — what the first CI minute does.
npm run -s build > /dev/null
# The guards run on the CLI just built, as CI runs them.
node packages/cli/dist/cli.js verify
npm run -s typecheck -w e2e
echo "prepush: clean"
