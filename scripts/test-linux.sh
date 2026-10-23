#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
# Run a workspace's tests on the CI runners' platform (release-32, DR-145):
#   npm run test:linux                                   # packages/core, whole suite
#   npm run test:linux -- packages/ui                    # another workspace
#   npm run test:linux -- packages/core --test-name-pattern=space-60
# The working tree is copied into the container (node_modules, dist and
# .git excluded) and installed there, so the host's install stays as it is.
set -euo pipefail
workspace="${1:-packages/core}"
shift || true
root="$(cd "$(dirname "$0")/.." && pwd)"
image="spex-ci-parity"
docker build -q -t "$image" "$root/scripts/linux-ci" > /dev/null
echo "Running $workspace tests on Node 22 and Git 2.55 (Ubuntu 24.04)"
docker run --rm -t \
  -v "$root:/src:ro" \
  -v spex-ci-parity-npm:/root/.npm \
  -e WORKSPACE="$workspace" \
  -e EXTRA="$*" \
  "$image" bash -lc '
    set -euo pipefail
    rsync -a --exclude node_modules --exclude dist --exclude ui-dist --exclude .git /src/ /work/
    cd /work && git init -q . && git add -A > /dev/null && git -c user.name=ci -c user.email=ci@example.invalid commit -qm parity
    npm ci --no-audit --no-fund > /dev/null
    npm run build > /dev/null
    cd "$WORKSPACE" && npm test -- $EXTRA
  '
