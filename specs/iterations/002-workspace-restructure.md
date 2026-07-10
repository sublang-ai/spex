<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-002: Workspace Restructure

## Goal

Convert the repo to the npm-workspaces monorepo decided in
[DR-002](../decisions/002-desktop-app-architecture.md), moving the
`@sublang/spex` scaffold CLI to `packages/cli` while keeping its npm
identity and `v*` release flow intact.

## Deliverables

- [ ] `packages/cli` holding the scaffold CLI (sources, scaffold
  templates, tests, tsconfig, CHANGELOG, README, LICENSE) with an
  unchanged published surface
- [ ] Private workspace root `package.json` with delegating
  build/test scripts
- [ ] Workspace-aware CI workflow
- [ ] Release workflow building, validating, and publishing from
  `packages/cli` on `v*` tags
- [ ] RELEASE spec updated for the workspace layout

## Tasks

1. **Move CLI into `packages/cli`** — `git mv` `src/`, `scaffold/`,
   `scripts/`, `tsconfig.json`, `CHANGELOG.md`, `README.md` into
   `packages/cli/`; copy `LICENSE` there (npm tarball needs it);
   give the package a `repository.directory` field; new private
   root `package.json` with `workspaces: ["packages/*", "apps/*"]`
   and delegating scripts; root gets a monorepo `README.md`.

2. **Update CI for workspaces** — root `npm ci` / `npm run build` /
   `npm test` exercise all workspaces (`--workspaces --if-present`);
   matrix unchanged.

3. **Update release workflow** — build/test at root; validate the
   tarball, verify tag-vs-version, extract release notes, and
   publish with `-w packages/cli`; changelog path
   `packages/cli/CHANGELOG.md`.

4. **Update RELEASE spec** — rules referencing `package.json` and
   `CHANGELOG.md` become explicit about the released package's
   directory; map summary refreshed if needed.

## Acceptance criteria

- `npm run build` and `npm test` succeed from the repo root.
- `npm pack --dry-run -w packages/cli` lists exactly the same files
  as the pre-move tarball (31 files: dist JS/d.ts sans tests,
  scaffold templates, README, LICENSE, package.json).
- `node packages/cli/dist/cli.js scaffold <tmpdir>` produces the
  same scaffold as before the move.
- Release workflow references only paths that exist
  (`packages/cli/package.json`, `packages/cli/CHANGELOG.md`).
