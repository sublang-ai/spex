<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-136: Guards, First Stage

## Status

In progress (2026-11-27).

## Intent

Give a project guards it can keep beside its code and check from the command line on TLA+ and TLC — `spex verify` and `spex approve`, the `guard` skill that drafts a guard with a person, and a first guard on Spex itself run in this repository's checks — under [DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md), [DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md) and [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md).

## Deliverables

- [ ] DR-243, DR-244 and DR-252 and the `guards` spec package, with the `cli`, `agent-skills`, `environments` and `release` packages, DR-228, DR-242 and the map in line with them.
- [ ] The checking library in the CLI: a guard's files and the cases of its guard item, each case's steps mapped to it by label, the binding's declaration and module, the declaration in TLA+, the form of a translation, the TLA+ files generated for TLC with its runs and what is read from them, Java and the pinned TLC jar, the patch applier, the copy and its process, the test of the code on every step of the model, a failing binding, and approval inputs; nothing random, and no dependency added for guards.
- [ ] `spex approve` and `spex verify` with `--keep`, their report and exit statuses, in the usage and each command's help, with the integration suite running real TLC on fixture projects.
- [ ] The `guard` skill under `skills/guard/` with its `references/`, its `zh-CN` translations and its version, read by the atlas scan.
- [ ] The first guard on Spex: its rule as a behavior item [[environments-55](../packages/environments.md#environments-55)], the guard item with its six cases, three permitted and three forbidden [[environments-56](../packages/environments.md#environments-56)], and under `guards/` the `installs` binding, the guard file, translations drafted independently in TLA+ that agree, and the kept fault.
- [ ] The first guard's approval record, written by the owner with `spex approve` and by no agent.
- [ ] `spex verify` in this repository's pull-request checks and before a push, with `guards/` owned in the selection of suites and the pinned TLC jar in CI's download caches.
- [ ] The CLI's README and changelog, the skills' guide, and the first guard's measurement in DR-252 from its final run.

## Tasks

1. Specs: DR-243, DR-244 and DR-252, `guards.md`, then `cli.md`, `agent-skills.md`, `environments.md`, `release.md`, DR-228, DR-242 and the map in line; `spex lint` clean.
2. The checking library and the two commands: `packages/cli/src/guards/` with the guard's files and items and the mapping of steps to cases, the declaration in TLA+, the form of a translation, the generated TLA+ files and the runs of TLC, Java and the jar, approval, the patch applier, the copy and its process with the test of the code, the report, and the `verify` and `approve` commands in the usage and help; unit tests and the `guards` package's integration suite green on real TLC.
3. The `guard` skill: `skills/guard/` with its prompts and file forms under `references/`, its `zh-CN` translations pinned and its version, the atlas test for it and the skills' guide; `npm run test:scripts` green.
4. The first guard on Spex and the checks: the items in `environments.md`, `guards/bindings/installs/` and the guard's folder with its guard file, translations and kept fault, `spex verify` in the pull-request checks and the pre-push check with the jar restored from CI's download caches, `guards/` in the selection of suites, the README and changelog, and the measurement in DR-252; every suite the change reaches green.

## Verification

- `spex lint` clean after each spec change.
- `npm test -w packages/cli` green on a machine with Java, the integration suite running the built CLI and real TLC on fixture projects written to a temp folder.
- `npm run test:scripts` green, with the `guard` skill's form, `zh-CN` translations, version and atlas scan.
- `spex verify` in this repository reports, for the first guard, every translation allowing each permitted case and forbidding each forbidden case, the translations in agreement, **Model checked, code tested** on today's code and the kept fault caught.
- Until the owner has run `spex approve`, the guard does not pass for want of approval alone; after it, `spex verify` exits `0`.
- The CLI declares no dependency for guards.
- CI green on the pull request before merge.
