<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-001: Scaffold CLI

## Goal

Implement the `scaffold` subcommand as a TypeScript CLI per the
SCAF spec package.

## Deliverables

- [x] Node.js project setup (package.json, tsconfig.json, .gitignore updates)
- [x] CLI entry point with `scaffold` subcommand routing
- [ ] `createSpecsStructure()` per [SCAF-7](../items/dev/scaffold.md#scaf-7)
- [ ] `copyTemplates()` per [SCAF-8](../items/dev/scaffold.md#scaf-8), [SCAF-9](../items/dev/scaffold.md#scaf-9)
- [ ] `appendAgentSpecs()` per [SCAF-10](../items/dev/scaffold.md#scaf-10)
- [ ] Target resolution per [SCAF-1](../items/user/scaffold.md#scaf-1), [SCAF-2](../items/user/scaffold.md#scaf-2), [SCAF-3](../items/user/scaffold.md#scaf-3)
- [ ] Idempotency per [SCAF-4](../items/user/scaffold.md#scaf-4)
- [ ] Agent instructions per [SCAF-5](../items/user/scaffold.md#scaf-5)
- [ ] Error handling per [SCAF-6](../items/user/scaffold.md#scaf-6)

## Tasks

1. **Project bootstrap** — Create `package.json` (name: `spex`,
   bin: `spex`, scripts including `build`), `tsconfig.json` targeting
   ES2022/NodeNext, update `.gitignore` for `dist/` and
   `node_modules/`

2. **CLI entry point** — `src/cli.ts` with argument parsing;
   `scaffold [<path>]` subcommand dispatching to the scaffold module

3. **Target resolution** — Resolve base path: explicit `<path>` →
   git repo root → cwd ([SCAF-1](../items/user/scaffold.md#scaf-1),
   [SCAF-2](../items/user/scaffold.md#scaf-2),
   [SCAF-3](../items/user/scaffold.md#scaf-3))

4. **createSpecsStructure()** — Create `specs/` and subdirectories
   ([SCAF-7](../items/dev/scaffold.md#scaf-7)), skip existing with
   `(already exists)` ([SCAF-4](../items/user/scaffold.md#scaf-4))

5. **getScaffoldDir() + copyTemplates()** — Resolve bundled
   `scaffold/` path from `dist/` ([SCAF-9](../items/dev/scaffold.md#scaf-9)),
   recursively copy template files without overwriting
   ([SCAF-8](../items/dev/scaffold.md#scaf-8))

6. **appendAgentSpecs()** — Read `scaffold/agent-specs.txt`,
   create/update `CLAUDE.md` and `AGENTS.md` with section
   replacement logic ([SCAF-10](../items/dev/scaffold.md#scaf-10),
   [SCAF-5](../items/user/scaffold.md#scaf-5))

7. **Error handling** — Non-zero exit on unrecoverable errors with
   stderr messages ([SCAF-6](../items/user/scaffold.md#scaf-6))

8. **Build & smoke test** — `npm run build` succeeds; manual
   `mkdir -p /tmp/test-target && npx spex scaffold /tmp/test-target`
   produces expected output

## Acceptance criteria

- `spex scaffold <path>` creates full specs structure in target
- Bundled template files (e.g., `specs/map.md`) appear at destination
- `spex scaffold` without path resolves to git root or cwd
- Re-running scaffold skips existing entries with `(already exists)`
- Pre-existing template files are not overwritten by a rerun
- `CLAUDE.md`/`AGENTS.md` are created or updated with specs section
- Invalid path exits non-zero with error on stderr
