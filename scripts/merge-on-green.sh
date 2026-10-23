#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
# Merge a pull request the moment its head's checks are green (release-29,
# DR-145): the way to merge where the repository cannot hold branch
# protection — a private repository on GitHub's free plan — and a
# stand-in for `gh pr merge --auto` elsewhere.
#   npm run merge-on-green -- <number>
set -euo pipefail
number="${1:?pull request number}"
head="$(gh pr view "$number" --json headRefOid --jq .headRefOid)"
echo "Waiting for the checks of #$number at ${head:0:8}"
while true; do
  state="$(gh pr view "$number" --json headRefOid,mergeable,statusCheckRollup --jq '{head: .headRefOid, mergeable, done: ((.statusCheckRollup|length) > 0 and ([.statusCheckRollup[] | .status] | all(. == "COMPLETED"))), green: ((.statusCheckRollup|length) > 0 and ([.statusCheckRollup[] | .conclusion] | all(. == "SUCCESS" or . == "SKIPPED" or . == "NEUTRAL")))}' 2>/dev/null || echo '{}')"
  if [ "$(printf '%s' "$state" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).head || ""')" != "$head" ]; then
    echo "The head moved; run again for the new head." >&2; exit 2
  fi
  if printf '%s' "$state" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.done ? (s.green ? "green" : "red") : "pending"' | grep -q green; then
    gh pr merge "$number" --merge
    echo "Merged #$number"; exit 0
  elif printf '%s' "$state" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.done ? "done" : "pending"' | grep -q done; then
    echo "The checks finished and are not green:" >&2
    gh pr view "$number" --json statusCheckRollup --jq '.statusCheckRollup[] | select(.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL") | [.name, .conclusion] | join(" ")' >&2
    exit 1
  fi
  sleep 60
done
