<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Workshop readiness exercise

This exercise tests whether ten fictional but representative teams can complete the course's Day 2 process workshops and Day 3 project delivery using Spex and its toolchain.
It prioritizes reproducible failures and substantial usability barriers.
The teams below are designed scenarios, not claims about actual companies.
Results remain pending until their artifacts and execution evidence exist.

The exercise started October 2, 2026 at 08:37 Pacific and ends October 3 at 06:37 Pacific.
The final two hours are reserved for verification, delivery, concise team reports, and cleanup.

## Course adaptation

The [Claude Academy course](https://academy.claude.com/courses/ai-native-sdlc-playbook/introduction) treats development as an artifact-driven loop and moves human attention toward judgment and exceptions.
Here, accepted intent records, decision records, spec packages, executable playbooks, integration results, and repository history carry that loop through Spex.
Course artifact names are mapped to the repository's canonical spec format; parallel copies of the same requirement are avoided.

The planning workshop captures a concrete problem and acceptance conditions, following [intent capture](https://academy.claude.com/courses/ai-native-sdlc-playbook/capture-intent).
Design combines requirements and constraints where practical, following [requirements and design](https://academy.claude.com/courses/ai-native-sdlc-playbook/requirements-and-design).
Implementation uses scoped instructions and independent review; reusable organizational rules follow the [skills lesson](https://academy.claude.com/courses/ai-native-sdlc-playbook/skills-as-institutional-knowledge).
The course's governance examples inform these simulated workflows; this exercise does not certify regulatory compliance.

## Teams and transition strategies

| Team | Profile and current process | Day 3 delivery | AI-native transition |
| --- | --- | --- | --- |
| T01 Seed SaaS | 5 people; English; TypeScript; founder-led Kanban; new product | Small internal skill catalog | Combine problem framing and design; delegate bounded implementation and checks; founder reviews useful outcomes. |
| T02 华东软件 | 18 people; Chinese; Python; two-week sprints; customer requests | Searchable enterprise spec index | Convert request discussions into accepted intents; share design rules; replace late QA handoff with executable acceptance checks. |
| T03 Meridian Bank | 1,800 technology staff; English; Java legacy services; formal change boards | Skill promotion and approval service | Keep risk ownership and separation of duties; automate evidence gathering and routine checks; route material exceptions to simulated owners. |
| T04 精工制造 | 350 technology staff; Chinese; C# and device gateways; V-model and offline sites | Versioned maintenance specification catalog | Preserve traceable acceptance and offline delivery; reuse stable packages; use agents to expose conflicting requirements early. |
| T05 Harbor Health | 120 people; English; Python APIs; product squads plus privacy review | Synthetic-data access and redaction service | Join product and privacy design; encode data boundaries; run negative integration cases throughout delivery. |
| T06 星河电商 | 600 technology staff; Chinese; TypeScript monorepo; continuous delivery | Feature rollout rules service | Link incidents to intents; parallelize isolated changes; gate promotion on acceptance and rollback evidence. |
| T07 Northstar Agency | 45 people; English; PHP and web apps; client-specific milestones | Reusable client project spec catalog | Separate reusable packages from client constraints; retain client acceptance; distribute improvements without copying stale project facts. |
| T08 城市服务 | 900 technology staff; Chinese; Java legacy systems; procurement and staged acceptance | Public-service change evidence index | Turn handoff documents into precise versioned contracts; combine routine analysis; preserve accountable acceptance decisions. |
| T09 Atlas Platform | 70 people; English; Go; platform backlog and GitOps | Internal skill distribution service | Make platform policies reusable; separate producer and consumer contracts; test version upgrades and rollback across teams. |
| T10 数澜数据 | 40 people; Chinese; Python batch pipelines; experiment-driven Kanban | Dataset contract and quality checker | Convert failed quality checks into intents; keep deterministic evaluators; preserve lineage when workflow rules evolve. |

Company size denotes the simulated organization's relevant staff, not the number of workshop participants.
Each workshop group represents a product or domain owner, an engineering lead, implementers, a verifier, and an operations or policy owner; small teams combine these responsibilities.

## Day 2 process adaptations

Every team authors or extends procedures for all five workshops, shares a version, consumes another team's version, and records what it changes.
A procedure may combine adjacent stages when that makes the team's process simpler; the stage's outputs and checks must still be exercised.

| Team | Plan | Design | Implement | Verify | Deploy and learn |
| --- | --- | --- | --- | --- | --- |
| T01 | Founder request and scope limit | Minimal catalog contract | Small reviewed slices | CLI/API acceptance | Local release, rollback, feedback intent |
| T02 | Chinese request triage | Search and citation decisions | Spec-first coding | Chinese acceptance examples | Sprint delivery evidence and retrospective |
| T03 | Risk-tiered change intent | Approval and audit contract | Independent coder/reviewer | Rejection and audit cases | Simulated approval gate and rollback |
| T04 | Field fault and offline constraints | Version and compatibility rules | Adapter isolation | Offline and stale-package cases | Signed-off local bundle and fault replay |
| T05 | Synthetic privacy use case | Data minimization and roles | Redaction implementation | Forbidden-data and access cases | Synthetic release evidence and incident intent |
| T06 | Incident and rollout hypothesis | Flag and rollback boundary | Parallel isolated changes | Boundary and regression checks | Canary simulation and rollback trigger |
| T07 | Client request and exclusions | Shared versus client-specific rules | Reuse with provenance | Per-client contract checks | Client acceptance simulation and package update |
| T08 | Service outcome and owner | Traceable acceptance rules | Bounded legacy adaptation | Evidence completeness and refusal | Staged acceptance simulation and correction intent |
| T09 | Consumer need and compatibility | Distribution contract | Producer and consumer slices | Install, upgrade, rollback | Versioned local registry promotion |
| T10 | Failed quality band | Dataset and lineage contract | Deterministic data transforms | Good, bad, and missing input | Batch delivery and next corrective intent |

## Cross-team reuse

The initial exchange pairs are T01→T09 (skill metadata), T09→T03 (promotion), T03→T08 (approval evidence), T08→T02 (spec indexing), T02→T07 (search contracts), T07→T04 (versioned reuse), T04→T06 (rollback), T06→T05 (safe rollout), T05→T10 (data boundaries), and T10→T01 (quality feedback).
Each recipient must consume a concrete versioned package, adapt it to its own project, and rerun the behavior checks.
The exchange order may change to avoid blocking independent work, while preserving actual producer/consumer evidence.

## Execution and evidence

- All simulated-team agents and compiler agents explicitly use `claude-opus-5-5` at no more than `max`, or `gpt-6.1-sol` at no more than `xhigh`; delegated model settings obey the same bounds.
- Every team gets an isolated Spex home and Git repositories under `.workshop-20261002/teams/`, with no access to real customer data or production deployments.
- Record the installed version and source commit, exact command or UI action, expected and observed outcomes, elapsed time, and evidence paths.
- Distinguish real-provider simulation, deterministic integration checks, static inspection, environment repair, and untested inference.
- Use the desktop or served interface for user journeys; CLI and protocol runs supplement them and are labeled accordingly.
- A completed team has its five workshop outputs, a working project, test evidence, a consumed package, and a retrospective that creates or rejects a follow-up intent.
- Each significant product fix follows its repository's specs and includes relevant integration or system verification. Existing product gates still govern releases.
- One-commit branches or PRs integrate by rebase; multiple-commit branches or PRs integrate with a merge commit.

The evolving execution state is in [status.json](status.json).
Final team reports and the complete resolved/open issue report will be linked here as they are completed.
