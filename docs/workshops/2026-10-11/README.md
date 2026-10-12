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
| W-40 the repositories listing failing past about twenty-five spex repositories | spex-pub PR 8 |
| W-41 the pick's first sync before the host's README; W-42 a repository the host leaves empty, and the creation mark lost on a restart | spex PR 128 and PR 129; confirmed on the eleven workshop clones |
| W-44 the cost of a host read | spex-pub PR 12 (`project.json` first, the branch only where it is absent, the pair held for a minute per person) |
| W-47 the pick's join without the sharing notice | spex PR 135 |
| W-43 a host's rate limit read as a network failure | spex PR 140 (its own cause, the seconds named, Retry waits them out) |
| W-48 the group picker naming groups by path alone | spex PR 137 |
| W-50 the Compile control promising 30 to 120 minutes | spex PR 136 |
| W-51 the Now band titled with the Boss's answer | spex PR 139 |
| W-52 a package's intent printing its markdown links as typed | spex PR 138 |
| W-49 History reading "Nothing done here yet" for chat-turn runs; W-53 the Running band titled with the session's first turn | spex PR 142 |

## The final-build walk

On 2026-10-12, with every fix of the simulation merged (spex main `7af05f85`, spex-pub `b254a89`), each team ran its own procedure once more on its Day-3 project from its own home, an agent playing the representative through the protocol: T01 `/shape`, T02 `/verify`, T03 `/propose`, T04 `/sprint-plan`, T05 the adopted `/release`, T06 `/contrib` to a pull request on GitHub, T07 `/requirements`, T08 `/evaluate`, T09 `/prototype`, T10 `/incident`.
Eight runs ended `committed` or `opened`; T05's ended `heldWithFindings` and T10's `notCleared`, the endings their procedures define; no run failed, parked on a defect or needed a Retry; W-23 and W-34 did not recur.
Each team's page records the questions, answers, commits and rough edges; the rough edges became W-54 to W-59.

## What is still open

- Found on the final-build walks (2026-10-12): W-54 (players' commit trailers; cligent), W-55 (the session list reads uncertain while an answer's turn runs; core), W-56 (a later reviewer never hears the Boss's answers; the preamble now says how a source asks for it, spex PR 143; the default is a Playbook decision), W-57 (raw machine names as status lines; run view), W-58 (English continuation lines in a Chinese flow; Playbook), W-59 (a closing reply without the commit hash or branch; Playbook).
- Playbook: W-10 is settled, not fixed — DR-088 §4 declines an uncommitted-draft outcome with its reasons, drafts travel as text or each drafting step commits, and the preamble teaches the three effects.

## Where the records live

Every team's spex repository is at `claude-workshop-261011/<team>/<name>-spex` on the internal instance: the workshop's group, with one subgroup per team, all made from the organizer's Spex home.
The organizer shares the workshop's group with each team's representative at Maintainer, which lets them make subgroups and projects beneath it.
The teams published to the registry org `claude-workshop-261011`, named after the workshop's group.

> **Operator's note: cleanup.**
> At the backend the workshop's group is `spex-internal/claude-workshop-261011`; a Maintainer makes subgroups there by the backend's default, which the instance leaves unchanged.
> Two orphan copies of every team's records remain from the earlier placements, under `slbeta1/claude-workshop-2026-10-11/<team>` and under the top-level group `claude-workshop-261011/<team>`.
> The org `claude-workshop-261011` stays bound to that orphan top-level group, which therefore stands, until the operator rebinds the org to the workshop's group: spex-pub DR-023's one-name rule refuses a fresh claim of a name already bound.
> After the rebind and the eleven clones' one sync (below), the operator deletes both orphan groups and the copies in them.

## How the placement went wrong: the root cause, and what prevents it

The records were placed three times in storage: under an unrelated group the organizer owned; under a top-level group the simulator made by hand on the Git host's own pages, following a plan fixed before it read the product or the runbook; and inside the instance's own backend group.
The third placement was right in storage, but it was shown to every person as a group to see, join and ask for (W-45).
The owner's rule names the model the products lacked: "End users should only see the workshop group, their own personal groups, and projects."
The instance is the space; the Git host behind it is backend storage that no person sees.
Three causes built the wrong model, and each now has its prevention.

1. **The specs embodied the leaky model.**
   spex-pub's DR-018, DR-020 and DR-021 defined the host service as a pass-through of GitLab's paths, pages and roles, with no invariant that the instance is the space.
   So every agent re-derived the model from the code, and each fix of a symptom brought the backend closer to the person: "New group at gitlab.com" (spex DR-118), then the backend group named by the API (`host.group`, spex-pub DR-022), shown first on Groups as "this host's group" with "ask its owner" to share it (spex DR-120 as first written).
   The registry's org rule followed the same model: an org could bind only to a top-level group at the Git host, so publishing under the workshop's name needed a top-level group of that name.
   Prevention: the invariant stands in both products' decision records — spex-pub DR-024 "The instance is the space", and spex DR-120 rewritten under its number — with a mechanical leak test in each that fails wherever a response a client renders, a surface, a clone key or a page names, links or paths the backend.
2. **The environment had no inventory.**
   The test-environment runbook documented the instance's service token in a setup step, and held no list of what the environment already had.
   The agent did not re-read that step and asked the owner, twice, for a token that already existed (W-46).
   Prevention: the Inventory table at the top of spex-pub's `docs/test-environment.md`, and the rule that nothing is asked of the owner before it is read there.
3. **A decision was recorded from a misreading.**
   The owner's direction that every group is made inside the instance's own group was read as a group people see, join and ask for, and recorded so as spex-pub DR-022, instead of being checked against the owner's standing principle: "spex.pub is the space manager; the Git host is only today's backend."
   The decisions taken mid-simulation, spex DR-118 and DR-120 as first written, skipped the same check.
   Prevention: both repositories' `CLAUDE.md` state the invariant as an architecture invariant that every agent reads first.

### The redesign

spex-pub DR-024 supersedes DR-022 and amends DR-004, DR-018, DR-020, DR-021 and DR-023; spex DR-120 is rewritten under the same number, superseding DR-118 and amending DR-064, DR-103 and DR-114; spex PR 130, which built DR-120 as first written, closed unmerged.
The instance answers every group and repository by its path from the instance's own root, and makes a group at that root for any signed-in person with its own service identity, adding the person as Owner; no person is a member of the storage behind it.
An org binds to the group at the instance's root that carries its name, so New playbook's Org default matches the project's key by prefix (W-36).
Spex names only the instance, your own group, the groups you belong to and their projects, and links no page of the Git host; where the instance says no group may be made, the list's head reads "Groups are made by the people who run ⟨instance⟩" (W-20).
W-39 closes with the undo controls: Rename on a group's heading, Delete on an empty group's, and "Move to another group" on a repository row, each acting as the person and showing a refusal in place.
The organizer's page, [docs/groups.md](../../groups.md), says how a team or a workshop is set up.

### Migration

The repositories stay where they are in storage; only the paths the instance answers change, so the eleven workshop clones are re-keyed to `claude-workshop-261011/<team>/<name>-spex`.
A read, a Refresh or a restart never moves a clone, and its next sync does, so once the instance answers the new paths each of the eleven clones is synced once from the ten team homes.
The check afterwards: no team home's workspace holds a folder under the backend's path, and every clone keeps its remote and repository id.

## By the numbers

Read from each home's session list and usage after the final-build walks of 2026-10-12 (tokens count every call's input, cache reads included; commits include the scaffold commit and the playbook-package commits; T01's home also lists the three sessions of the eval-harness project it joined).

| Team | Sessions | Turns | Agent active (min) | Input tokens | Output tokens | Commits (incl. scaffold) |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | 7 | 12 | 252 | 65,015,042 | 1,328,960 | 14 |
| T02 | 5 | 7 | 140 | 88,640,879 | 1,452,701 | 15 |
| T03 | 7 | 17 | 100 | 115,985,692 | 1,903,817 | 28 |
| T04 | 5 | 9 | 115 | 47,363,321 | 887,139 | 14 |
| T05 | 4 | 13 | 44 | 15,623,906 | 633,962 | 10 |
| T06 | 4 | 10 | 52 | 18,312,998 | 254,146 | 10 |
| T07 | 5 | 10 | 136 | 67,066,849 | 2,043,795 | 15 |
| T08 | 4 | 7 | 48 | 12,723,676 | 295,293 | 10 |
| T09 | 4 | 5 | 42 | 3,450,888 | 82,972 | 8 |
| T10 | 4 | 9 | 64 | 27,646,558 | 686,940 | 13 |

## Reuse map as walked

| Team | Published to `claude-workshop-261011` | Adopted from the registry | The adoption's run | The second procedure's own run |
| --- | --- | --- | --- | --- |
| T01 | `shape` | `evaluate` (T08) | pass | — |
| T02 | `verify` (0.1.0, 0.1.1), `release-review` | `requirements` (T07) | committed | `release-review`: approved |
| T03 | `propose`, `release` | `rollout` (T10), `release-notes` (T05, from the page) | plan committed, W-23 at the end; on `rollout` 0.1.1 rejected cleanly | `release`: approved |
| T04 | `sprint-plan` | `shape` (T01) | committed | — |
| T05 | `design`, `trip-split` (spec only), `release-notes` (from the page) | `release` (T03) | held with findings, the owner never asked | — |
| T06 | `contrib` | `verify` (T02) | files committed, W-25 at the end; on `verify` 0.1.1 two commits taken, parked on W-27 | — |
| T07 | `requirements`, `compliance` | `sprint-plan` (T04) | committed, W-23 at the end | `compliance`: passed, twice |
| T08 | `evaluate`, `promote` | `design` (T05) | enabled | `promote`: promoted to staging |
| T09 | `prototype` | `contrib` (T06), `trip-split` (T05) | committed; the spec recast in TypeScript | — |
| T10 | `rollout` (0.1.0, 0.1.1), `incident` | `shape` (T01) | enabled | `incident`: not cleared at the review limit |
