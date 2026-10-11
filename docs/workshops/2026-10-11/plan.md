<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Workshop simulation 2026-10-11: plan

Ten fictional teams go through Day 2 (one procedure per SDLC stage, shared across teams) and Day 3 (a project delivered with those procedures, spec packages reused across teams) on the Spex stack as it stands on `main` today.
The aim is to find and fix what stops a real team or makes the app hard to use; every finding is recorded in [issues.md](issues.md), every team in its own file.

## The model

| Thing in the course | Thing in the stack |
| --- | --- |
| a team | a GitLab subgroup `claude-workshop-261011/<team>`; its records in `<team>-spex` |
| a participant's device | one Spex home signed in as `slgamma` (`SPEX_HOME`), served by the server shell on its own port; the desktop shell is walked once for its own flows |
| a procedure (规程) | a playbook: authored in the Playbooks surface, compiled by slc, enabled per role with the team's players, run from the Captain |
| submitting a procedure to the system | publishing the spec package to spex.pub internal under the workshop org `claude-workshop-261011/<team>-<pkg>` |
| sharing, distributing, reusing, extending | Add from registry in another team's environment, enable, run; a fork of the source published as a new package or a new version |
| a project | a working folder paired with a project spex repository created in the team's subgroup; new projects by Create project, existing ones by Add |
| a project's spec package | the project's `specs/` tree packaged and published; another team adds it and regenerates or recasts from it |

Fixed by the environment: the organizer is `slbeta` (owner of the workshop group, claims the org at spex.pub); every team's representative is `slgamma` (Maintainer of the workshop group, inherited by every subgroup, so it can create spex repositories and publish).
Teams may bind only Claude Opus 5.5 (effort up to `max`) and GPT-6.1 Sol (`gpt-6.1-sol`, effort up to `xhigh`).

## Teams

| Team | Language | Who they are | Process today | Code | Day-2 playbooks they author | Agents |
| --- | --- | --- | --- | --- | --- | --- |
| T01 Lumen Labs | en | 6-person SaaS startup | founder-led Kanban, trunk-based, continuous deploy | TypeScript | `shape` — plan and design merged: a request becomes an intent with spec items and acceptance checks in one sitting | Captain Opus 5.5; coder Sol xhigh; reviewer Opus 5.5 high |
| T02 华芯智造 | zh | 300-person industrial controls maker, firmware team | V-model, formal verification, release sign-off | C | `验证` — verify: traceability matrix from spec items to tests, test evidence; `发布评审` — deploy: sign-off with a rollback note | all Opus 5.5 (single approved vendor) |
| T03 Meridian Bank Digital | en | 2,000-person bank, digital channels | SAFe, change advisory board | Java | `propose` — plan with risk classification; `release` — deploy gate: approval question, rollback plan, evidence bundle | Captain Opus 5.5 max; coder Opus 5.5 high; reviewer Sol xhigh |
| T04 云课堂 | zh | 40-person edtech | Scrum, two-week sprints, PM-driven | Python | `迭代计划` — plan: an epic becomes intents with 验收标准 | coder Sol xhigh; reviewer Opus 5.5 |
| T05 Northwind Mobile | en | 15-person mobile agency | client milestones, fixed scope | Swift | `design` — design: options table, trade-offs, client sign-off question | Captain Opus 5.5; players Sol xhigh |
| T06 OpenGraphLab | en | open-source maintainers of a Rust crate | GitHub issues and pull requests, CI, reviewer rotation | Rust | `contrib` — implement and verify: issue to branch to pull request with tests, built on `branch` and `pr` | coder Opus 5.5 medium (volunteer budget); reviewer Sol high |
| T07 数智政务 | zh | 500-person government IT contractor | waterfall, formal requirement review, acceptance by the client | Go | `需求评审` — plan and design merged: numbered requirements, a review record; `合规检查` — deploy: compliance checklist | all Opus 5.5 |
| T08 Kestrel Data | en | 80-person data and ML platform company | experiment-driven, metric gates | Python | `evaluate` — verify: evals with thresholds; `promote` — deploy: promotion decision from eval results | coder Sol xhigh; reviewer Opus 5.5 |
| T09 乐游工作室 | zh | 25-person indie game studio | Kanban, weekly playable builds | TypeScript | `原型` — implement without review; `试玩` — verify: playtest checklist | all Sol xhigh |
| T10 Atlas Platform | en | 150-person internal platform and SRE team | GitOps, trunk-based, canary rollouts | Go | `rollout` — deploy: canary plan, rollback decisions; `incident` — plan: an incident becomes an intent | mixed: coder Sol xhigh, reviewer Opus 5.5 high |

Every team enables the built-ins it does not replace (`decide`, `code`, `review`, `dev`, `branch`, `pr`) with its own players, so each stage of each team has one procedure.

## Day 2 — converge

Each team adds at least one other team's playbook from the registry, enables it with its own players and runs it on its Day-3 project; at least three originating teams publish a second version after feedback.

| Adopter | Adopts | Why |
| --- | --- | --- |
| T04 | T01 `shape` | sprint stories need acceptance checks in one pass |
| T01 | T08 `evaluate` | a metric gate before deploy |
| T09 | T06 `contrib` | outside contributors send pull requests |
| T02 | T07 `需求评审` | the same formal review, in Chinese |
| T03 | T10 `rollout` | canary before the CAB gate |
| T05 | T03 `release` | client-visible release evidence |
| T06 | T02 `验证` | traceability for a safety-adjacent crate |
| T07 | T04 `迭代计划` | breaking a phase into deliverable slices |
| T08 | T05 `design` | options tables for model changes |
| T10 | T01 `shape` | small ops changes planned in one sitting |

## Day 3 — projects

| Team | Project | How it starts | Delivered through |
| --- | --- | --- | --- |
| T01 | `invite-codes`: waitlist and invite-code HTTP API | Create project (TypeScript) | `shape` → `code` → `review` → `evaluate` (T08's) |
| T02 | `modbus-frame`: Modbus RTU frame parser library | Create project (C) | `需求评审` (T07's) → `decide` → `code` → `验证` → `发布评审` |
| T03 | an owner search by phone in `spring-petclinic` | Add an existing clone | `propose` → `decide` → `code` → `review` → `rollout` (T10's) → `release` |
| T04 | `quiz-service`: quizzes and grading | Create project (Python) | `迭代计划` → `shape` (T01's) → `code` → `review` |
| T05 | `tripsplit-core`: trip expense splitting library | Create project (Swift) | `design` → `code` → `review` → `release` (T03's) |
| T06 | a feature in a forked Rust crate on GitHub | Add an existing clone with a GitHub remote | `dev` with an issue → `contrib` → `验证` (T02's) |
| T07 | `material-forms`: declaration form service | Create project (Go) | `需求评审` → `迭代计划` (T04's) → `code` → `review` → `合规检查` |
| T08 | a feature in a small Python library | Add an existing clone | `design` (T05's) → `code` → `evaluate` → `promote` |
| T09 | `match3-core`: match-three game rules | Create project (TypeScript) | `原型` → `试玩` → `contrib` (T06's) |
| T10 | `rollout-check`: canary rule checker CLI | Create project (Go) | `incident` → `shape` (T01's) → `code` → `rollout` |

Cross-team reuse at the end: each team publishes its project's spec package; T04 regenerates T01's `invite-codes` in Python from the spec alone, T09 recasts T05's `tripsplit-core` in TypeScript, and T10 recasts T07's `material-forms` with its own rollout stage.
The retrospective reads each session's usage line, active time per agent and the review rounds per delivery.

## How the simulation runs

1. Setup: the workshop group and ten subgroups on GitLab; the org claimed at spex.pub internal by the organizer; the app built from `main`; one home per team under `~/.spex-workshop-261011/homes/<team>` with `SPEX_HOST_URL` naming the internal instance, served on ports 8201–8210; each signed in as `slgamma` through the device flow, approved in Safari.
2. The first team (T01) is walked by hand in the browser, end to end, before any other team starts: this pass is where fresh-user issues show.
3. Teams then run in parallel, three or four at a time, each driven by an agent playing its representative: Day 2 authoring, publishing and adoption first, then Day 3.
4. A blocking issue pauses every team it affects; it is fixed on a branch, merged, the app rebuilt, and the affected homes restarted between turns.
5. Reports: one page per team, one issues list, both under this folder.
