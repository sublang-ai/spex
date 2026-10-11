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

## What is still open

- Playbook runtime: W-23 (a judge's output shape fails a completed step and the closing reply misreports it), W-25 (a step's repository effect is fixed at link time: work already committed, or two commits, fail the run), W-10 (uncommitted drafts cannot link).
- slc: W-11 (English markers inside Chinese sources), W-12 (two-word roles fail late).
- Spex: W-26 (a spec-kind package reaches no agent), W-08 (built-in playbooks in English only), W-13, W-20, W-24, W-04, W-05, W-06 (minor).

## By the numbers

Read from each home's session list and usage at the end of the simulation (tokens count every call's input, cache reads included; commits include the scaffold commit and the playbook-package commits).

| Team | Sessions | Turns | Agent active (min) | Input tokens | Output tokens | Commits (incl. scaffold) |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | 3 | 5 | 179 | 48,495,722 | 934,911 | 13 |
| T02 | 3 | 4 | 89 | 62,969,995 | 1,051,862 | 9 |
| T03 | 4 | 10 | 77 | 108,605,664 | 1,731,351 | 23 |
| T04 | 3 | 5 | 75 | 42,124,330 | 738,826 | 12 |
| T05 | 1 | 6 | 30 | 8,215,566 | 527,453 | 5 |
| T06 | 2 | 5 | 32 | 9,621,434 | 133,988 | 7 |
| T07 | 3 | 6 | 78 | 36,735,225 | 1,174,059 | 9 |
| T08 | 2 | 2 | 28 | 8,721,056 | 227,028 | 6 |
| T09 | 3 | 4 | 40 | 3,128,546 | 77,937 | 7 |
| T10 | 2 | 4 | 33 | 14,677,774 | 377,659 | 7 |

## Reuse map as walked

| Team | Published to `claude-workshop-261011` | Adopted from the registry | Run on the adopter's project |
| --- | --- | --- | --- |
| T01 | `shape` | `evaluate` (T08) | yes — pass |
| T02 | `verify` | `requirements` (T07) | yes — committed |
| T03 | `propose` | `rollout` (T10) | yes — plan committed, W-23 at the end |
| T04 | `sprint-plan` | `shape` (T01) | yes — committed |
| T05 | `design`, `trip-split` (spec only) | — | — |
| T06 | `contrib` | `verify` (T02) | yes — files committed, W-25 at the end |
| T07 | `requirements` | `sprint-plan` (T04) | yes — committed, W-23 at the end |
| T08 | `evaluate` | `design` (T05) | enabled |
| T09 | `prototype` | `contrib` (T06), `trip-split` (T05) | yes — committed; the spec recast in TypeScript |
| T10 | `rollout` | `shape` (T01) | enabled |
