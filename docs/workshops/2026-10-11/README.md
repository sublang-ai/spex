<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Workshop simulation 2026-10-11

Ten fictional teams went through Day 2 (one procedure per SDLC stage, shared across teams through the registry) and Day 3 (a project each, cross-team reuse) on the Spex stack, each driven by an agent playing its representative, with the organizer on her own Spex home.
The aim was to find what stops a real team or makes the app hard to use, and to fix what mattered.

| File | What it holds |
| --- | --- |
| [plan.md](plan.md) | the teams, their procedures, their projects, the reuse map and how the simulation ran |
| [issues.md](issues.md) | every finding, most severe first, with its state (fixed, being fixed, open, not ours) |
| [T01.md](T01.md) … [T10.md](T10.md) | one page per team: what happened, what they found |

## What was fixed during the simulation

| Finding | Fix |
| --- | --- |
| W-01 subgroups invisible; W-02 no groups or sharing without GitLab.com; W-15 Chinese group names refused; W-03 second-device conflict over the seeded environment | spex-pub DR-021 (groups at every depth, `can` flags, GitLab's roles, members, optional `path`) and Spex DR-114 (New group, New subgroup, Members, Share, Remove, Path field, second-device join) — spex PR 103, spex-pub PRs 5 and 6 (all merged; spex-pub deployed to the internal instance) |
| W-07 built-ins read as not enabled; W-09 Chinese project gets an English package; W-11/W-12 compile failures a preamble hint prevents | spex PR 104 (merged) |
| W-22 a recovered session wears the failure tone forever | spex PR 105 (merged) |
| W-14 created group not listed until a refresh | spex PR 106 (merged) |
| W-17 untracked package blocks `/pr`; W-18 org defaults to an unclaimable login; W-19 compiler cache in releases; W-21 missing license refused by the registry | spex PR 107 (merged) |
| W-26 a spec-kind package reaches no agent | spex PR 109 (merged), DR-115 |
| W-11 English relay marker inside Chinese sources; W-12 two-word roles fail late | slc PR 44 (merged, 0.16.1), Playbook PR 71 (guide) |
| W-23 a judge's reply shape fails a completed step and the closing reply misreports it; W-25 a step that committed twice or found its work already committed fails the run | Playbook PRs 72 and 73 (released as 17.8.0); Spex adopts it with slc 0.16.1 by DR-116 (PR 110); confirmed on T04's re-linked `sprint-plan` |
| W-08 built-in playbooks' intents in English on a Chinese home | spex PR 112 |
| W-13 seven near-identical recovery rows; W-06 Git's raw words on a failed first commit | spex PR 113, DR-117 |
| W-24 a clone's sync standing read from Git when no record exists; W-04 signed-out own-group name; W-05 name and path separator; W-20 "New group at <site>" where the host refuses creation | spex PR 114, DR-118 |
| W-28 two tests each losing a CI run on a slow macOS runner (a pick-race hold taken by another reader; a two-pass push against a 15 s budget) | spex PR 116 |
| W-27 a role's prompt carrying the procedure's later rounds | spex PR 118 (the preamble's rule) |
| W-29 a repository moved into a team group reading "Never synced" | spex PR 119, space-5/space-73 |
| W-34 a playbook's exported skill derailing its own player | spex PR 120, environments-16 |
| W-31 an unreadable directive block relayed to no one | spex PR 121, playbook-library-53/65/66 |
| W-30 an upgraded app keeping the lock's older built-ins with nothing saying so | spex PR 123 (the line and its Update control) |
| W-32 the Captain rewording a playbook's question and dropping the facts its ending reports | Playbook 17.8.1 (PR 75) |
| W-33 a structured-question tool the Captain cannot use, shown as a refused call | cligent 0.33.4 (PRs 74, 75) |
| W-35 a finished row titled with the Boss's last answer | spex PR 126, DR-119 |
| W-36 the Org default under a nested group | spex PR 125 with spex-pub PR 7 (the orgs API) |
| W-37 a source's first line as the Library title; W-38 the source-order rule learned only from a failed compile | spex PR 124 |

## What is still open

- Playbook: W-10 is settled, not fixed — DR-088 §4 declines an uncommitted-draft outcome with its reasons, drafts travel as text or each drafting step commits, and the preamble teaches the three effects.
- Groups: W-39 (no "Move to another group" on the surface; the eleven moves below went through the protocol) and W-40 (host reads that stopped completing after one failure; to confirm on the next restart).

## Where the records live

Every team's spex repository sits at `spex-internal/claude-workshop-261011/<team>/<name>-spex`: the workshop group is a private subgroup of the internal instance's public top-level group `spex-internal`, with one subgroup per team, all created from the organizer's Spex home, and the organizer shares the workshop group with each team's representative at Maintainer so that projects created there get their first commit.
The registry org the teams publish to stays the top-level group `claude-workshop-261011`, because spex.pub binds an org to a top-level namespace only.
The records were first placed under `slbeta1/claude-workshop-2026-10-11/<team>` and then under the top-level `claude-workshop-261011/<team>`, both wrong placements corrected on the owner's instruction by moving every repository with its full history through the protocol (W-39); the copies left under the two old paths are orphans the owner may delete.

### How the placement went wrong, and what changes

- **No concept of the instance's group.** spex.pub told clients nothing of the one group it keeps on GitLab.com; its `can_create_group` was false with the explanation that a first group is "made once on GitLab.com's own pages", and Spex rendered that as the first control on Groups ("New group at gitlab.com", DR-118, written mid-simulation on that wrong premise). Fixed: the host names its group, Spex shows it first and New group creates a private subgroup of it (DR-120).
- **The registry's org rule pulled the other way.** An org could bind only to a top-level group, so publishing under the workshop's name forced a top-level group of that name — which then looked like the home for the teams. Fixed: an org may bind to a direct subgroup of the instance's group.
- **A flat, unmarked list.** Groups listed every host group in name order with nothing marking the instance's group, so an unrelated top-level group the organizer owned read as hers. Fixed with DR-120's order and key phrase.
- **No page said the right way.** The only text naming the instance's group was the test-environment runbook. Added: [docs/groups.md](../../groups.md).
- **The simulator's own errors.** It fixed the top-level plan before reading the product or the runbook, created the first group by hand on GitLab.com, and read every later ambiguity through that premise instead of asking at the first one.

## By the numbers

Read from each home's session list and usage at the end of the simulation (tokens count every call's input, cache reads included; commits include the scaffold commit and the playbook-package commits).

| Team | Sessions | Turns | Agent active (min) | Input tokens | Output tokens | Commits (incl. scaffold) |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | 3 | 5 | 179 | 48,495,722 | 934,911 | 13 |
| T02 | 4 | 6 | 101 | 68,902,321 | 1,160,937 | 13 |
| T03 | 6 | 16 | 90 | 114,229,237 | 1,806,432 | 27 |
| T04 | 4 | 7 | 94 | 44,492,419 | 809,609 | 13 |
| T05 | 2 | 8 | 35 | 11,412,683 | 566,161 | 6 |
| T06 | 3 | 7 | 46 | 14,552,110 | 210,642 | 9 |
| T07 | 4 | 8 | 96 | 54,419,764 | 1,379,422 | 14 |
| T08 | 3 | 5 | 34 | 11,193,936 | 269,955 | 9 |
| T09 | 3 | 4 | 40 | 3,128,546 | 77,937 | 7 |
| T10 | 3 | 6 | 51 | 22,903,768 | 549,421 | 11 |

## Reuse map as walked

| Team | Published to `claude-workshop-261011` | Adopted from the registry | The adoption's run | The second procedure's own run |
| --- | --- | --- | --- | --- |
| T01 | `shape` | `evaluate` (T08) | pass | — |
| T02 | `verify` (0.1.0, 0.1.1), `release-review` | `requirements` (T07) | committed | `release-review`: approved |
| T03 | `propose`, `release` | `rollout` (T10) | plan committed, W-23 at the end; on `rollout` 0.1.1 rejected cleanly | `release`: approved |
| T04 | `sprint-plan` | `shape` (T01) | committed | — |
| T05 | `design`, `trip-split` (spec only) | `release` (T03) | held with findings, the owner never asked | — |
| T06 | `contrib` | `verify` (T02) | files committed, W-25 at the end; on `verify` 0.1.1 two commits taken, parked on W-27 | — |
| T07 | `requirements`, `compliance` | `sprint-plan` (T04) | committed, W-23 at the end | `compliance`: passed, twice |
| T08 | `evaluate`, `promote` | `design` (T05) | enabled | `promote`: promoted to staging |
| T09 | `prototype` | `contrib` (T06), `trip-split` (T05) | committed; the spec recast in TypeScript | — |
| T10 | `rollout` (0.1.0, 0.1.1), `incident` | `shape` (T01) | enabled | `incident`: not cleared at the review limit |
