<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-136: Guards, First Stage

## Status

In progress (2026-11-26); every deliverable is on the branch, and CI on its pull request is still to run.

## Intent

Give a project guards it can keep beside its code and check from the command line with fast-check alone — `spex verify` and `spex approve`, the `guard` skill that drafts a guard with a person, and a first guard on Spex itself run in this repository's checks — under [DR-251](../decisions/251-a-guard-is-kept-beside-the-code.md).

## Deliverables

- [x] DR-251 accepted with DR-243 and DR-244, the `guards` spec package, and the amended `cli` and `agent-skills` packages, map and reciprocal Status lines [[guards-1](../packages/guards.md#guards-1)] [[cli-21](../packages/cli.md#cli-21)] [[agent-skills-13](../packages/agent-skills.md#agent-skills-13)].
- [x] The checking library in the CLI: a guard's files and items, the binding's declaration and module, readings and their language, the patch applier, the copy and its process, a failing binding, and approval inputs [[guards-2](../packages/guards.md#guards-2)] [[guards-3](../packages/guards.md#guards-3)] [[guards-7](../packages/guards.md#guards-7)] [[guards-9](../packages/guards.md#guards-9)] [[guards-11](../packages/guards.md#guards-11)] [[guards-12](../packages/guards.md#guards-12)] [[guards-36](../packages/guards.md#guards-36)] [[guards-14](../packages/guards.md#guards-14)].
- [x] `spex approve` and `spex verify` with their report and exit statuses, in the usage and each command's help, with the integration suite on fixture projects [[guards-16](../packages/guards.md#guards-16)] [[guards-17](../packages/guards.md#guards-17)] [[guards-26](../packages/guards.md#guards-26)] [[guards-27](../packages/guards.md#guards-27)] [[guards-29](../packages/guards.md#guards-29)] [[cli-21](../packages/cli.md#cli-21)].
- [x] The `guard` skill under `skills/guard/` with its `references/`, its `zh-CN` translations and its version, read by the atlas scan [[agent-skills-13](../packages/agent-skills.md#agent-skills-13)] [[agent-skills-14](../packages/agent-skills.md#agent-skills-14)] [[agent-skills-10](../packages/agent-skills.md#agent-skills-10)].
- [x] The first guard on Spex, protecting a placed spec's standing copy [[environments-41](../packages/environments.md#environments-41)]: its assertion and example items in `environments.md`, its binding, readings, kept fault and approval record under `guards/`, passing `spex verify`.
- [x] `spex verify` in this repository's pull-request checks and before a push, with `guards/` owned in the selection of suites [[release-34](../packages/release.md#release-34)] [[release-35](../packages/release.md#release-35)].
- [x] The CLI's README and changelog, and the skills' guide.

## Tasks

1. Specs: DR-251 accepted with DR-243 and DR-244, `guards.md`, the amendments to `cli.md`, `agent-skills.md`, `environments.md` and `release.md`, the map and the reciprocal Status lines; `spex lint` clean.
2. The checking library and the two commands: `packages/cli/src/guards/` with the language, readings, files, items, approval, patch applier, copy, the copy's process with fast-check, the report and the `verify` and `approve` commands in the usage and help; unit tests and the integration suite `guards-29` to `guards-35` green.
3. The `guard` skill: `skills/guard/` with its prompts and file forms under `references/`, its translations pinned and its version, the atlas test for it and the skills' guide; `npm run test:scripts` green.
4. The first guard on Spex and the checks: the items in `environments.md`, `guards/bindings/` and the guard's folder with its kept fault and approval record, `spex verify` in the pull-request checks and the pre-push check, `guards/` in the selection of suites, the README and changelog; every suite the change reaches green.

## Verification

- `spex lint` clean after each spec change.
- `npm test -w packages/cli` green, the integration suite running the built CLI on fixture projects written to a temp folder.
- `npm run test:scripts` green, with the `guard` skill's form, translations, version and atlas scan.
- `spex verify` in this repository exits `0`, reports **Sampled on the implementation** for the first guard on today's code, and catches its kept fault.
- CI green on the pull request before merge.
