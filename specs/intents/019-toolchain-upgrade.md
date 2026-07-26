<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-019: Released Toolchain Upgrade

## Goal

Adopt `@sublang/playbook` 2.0.0, `@sublang/cligent` 0.16.0, and the published `@sublang/slc` 0.1.0 per [DR-014](../decisions/014-released-toolchain.md): canonical `effort` key with a read-only legacy alias, registry generation as a normalization wrapper over slc's emitted entry, role reconciliation, stale-bundle invalidation, and session `cwd` injection.

## Deliverables

- [x] `packages/core` depends on `@sublang/playbook` ^2.0.0 and `@sublang/cligent` ^0.16.0; the tree installs and builds.
- [x] `effort` is the canonical agent key across core validation, composition, protocol, template, config edits, and UI; `reasoningEffort` still composes as a legacy alias and both-set blocks are invalid.
- [x] `compilePlaybook` consumes slc's emitted `<id>.ts` entry: normalization wrapper (command/intent overrides, lowercased role ids with a port-seam casing shim, contract marker), fail-closed validation, state ids as display metadata only.
- [x] `compile.run` re-keys player assignments onto derived role ids case-insensitively and reports unmatched roles as a structured error before any config write.
- [x] Config composition rejects marker-less file-path registries with recompile guidance.
- [x] Session creation injects the project path as each accepting playbook's `cwd` option.
- [x] Record-sequence expectations updated for the playbook 2.0 Captain failure contract.
- [x] PBLIB package spec amended (registry generation, roles, invalidation); map row added.

## Tasks

1. Bump `@sublang/playbook` and `@sublang/cligent` in `packages/core`, refresh the lockfile, and fix compile errors from the cligent 0.16 type surface.
2. Rename to `effort` across core config validation/composition (legacy alias accepted, both-set rejected), protocol, config-edit ops, and the config template.
3. Sweep the UI (`ProfilePopover`, `CaptainHome`, `SettingsSurface`, config ops, labels) to the `effort` field.
4. Rewrite `compile.ts` registry generation as the DR-014 normalization wrapper over the emitted entry, with the contract marker and updated expected-artifact checks.
5. Implement role reconciliation and the structured derived-roles error in the `compile.run` service path.
6. Enforce the contract marker for file-path registries in config composition with recompile guidance.
7. Inject the session `cwd` option at session creation behind a `validateOptions` acceptance probe.
8. Update scripted-captain and integration record expectations for the 2.0 failure contract; green core, ui, cli, and desktop suites.
9. Amend the PBLIB spec items and `map.md`.

## Acceptance criteria

- `npm run build` and `npm test` pass at the repo root on system Node.
- A config block using `reasoningEffort` composes with the value surfaced as `effort`; a block with both keys is invalid with a naming error.
- A stub-slc compile that emits a 2.0-shape entry with capitalized role ids registers successfully, and its composed players use lowercased host role ids.
- A marker-less absolute-path registry makes the config invalid with guidance naming the playbook and recompilation.
- A registered playbook accepting `cwd` receives the project path when a session starts, and a YAML-set `cwd` wins.
