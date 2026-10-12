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

## What is still open

- Playbook: W-10 is settled, not fixed — DR-088 §4 declines an uncommitted-draft outcome with its reasons, drafts travel as text or each drafting step commits, and the preamble teaches the three effects; W-32 (the Captain rewords a playbook's one question and drops the facts its ending reports) and W-33 (a structured-question tool the Captain cannot use) are the Captain's prompt and adapter.
- Playbooks surface: W-30 (an upgraded app keeps the lock's older built-ins with nothing saying a newer release is seeded; a resolve moves them), W-36 (the Org default under a nested group), W-37 (a source's first line as the Library title; minor).
- Dashboard: W-35 (a finished row titled with the Boss's last answer; a design question under DR-035).
- Authoring: W-38 (the source-order rule learned only from a failed compile; minor).

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
