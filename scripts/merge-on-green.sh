#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
# Merge a pull request the moment its head's checks are green (release-29,
# DR-145): the way to merge where the repository cannot hold branch
# protection — a private repository on GitHub's free plan — and a
# stand-in for `gh pr merge --auto` elsewhere.
# GitHub's rollup keeps the checks of every run on the head, so only each
# workflow's newest run is judged; a status context has no run, stays,
# and is judged by its state. The merge names the head checked, so a
# push between the read and the merge is refused, not merged.
# (A close and reopen adds a run; a re-run replaces its own run's checks.)
# Start it once the head's newest run exists: a run that has not yet
# created its jobs leaves the earlier run's checks looking current.
#   npm run merge-on-green -- <number>
set -euo pipefail
number="${1:?pull request number}"
newest='.statusCheckRollup | map(. + {run: (((.detailsUrl // "") | capture("/runs/(?<r>[0-9]+)")? | .r | tonumber) // 0), name: (.name // .context), status: (.status // (if .state == "PENDING" or .state == "EXPECTED" then "PENDING" else "COMPLETED" end)), conclusion: (.conclusion // .state)}) | group_by(.workflowName) | map((map(.run) | max) as $m | map(select(.run == $m))) | add // []'
head="$(gh pr view "$number" --json headRefOid --jq .headRefOid)"
echo "Waiting for the checks of #$number at ${head:0:8}"
while true; do
  state="$(gh pr view "$number" --json headRefOid,mergeable,statusCheckRollup --jq "($newest)"' as $checks | {head: .headRefOid, mergeable, done: (($checks|length) > 0 and ([$checks[] | .status] | all(. == "COMPLETED"))), green: (($checks|length) > 0 and ([$checks[] | .conclusion] | all(. == "SUCCESS" or . == "SKIPPED" or . == "NEUTRAL")))}' 2>/dev/null || echo '{}')"
  # A failed or empty read is polled again; only another head is a move.
  now="$(printf '%s' "$state" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).head || ""' 2>/dev/null || true)"
  if [ -n "$now" ] && [ "$now" != "$head" ]; then
    echo "The head moved; run again for the new head." >&2; exit 2
  fi
  if printf '%s' "$state" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.done ? (s.green ? "green" : "red") : "pending"' | grep -q green; then
    gh pr merge "$number" --merge --match-head-commit "$head" || { echo "GitHub refused the merge; if the head moved, run again for the new head." >&2; exit 2; }
    echo "Merged #$number"; exit 0
  elif printf '%s' "$state" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.done ? "done" : "pending"' | grep -q done; then
    echo "The checks finished and are not green:" >&2
    gh pr view "$number" --json statusCheckRollup --jq "($newest)"' | .[] | select(.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL") | [.name, .conclusion] | join(" ")' >&2
    exit 1
  fi
  sleep 60
done
