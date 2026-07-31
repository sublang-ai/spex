<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Smoke fixtures

`legacy-tree/` is a complete sample project whose `specs/` tree
DELIBERATELY carries the previous spec-structure generation:
`compositions/` directory, ALLCAPS short-form item IDs,
single-bracket citations, and a Goal/Acceptance-criteria intent
record, modeled on the pre-migration Academy corpus (commit
954c10e).

Do not "fix" or modernize it in this repo: `spex lint` and the
migration skill's checker are SUPPOSED to fail on it. The
migration smoke (`scripts/migration-smoke.mjs`, run as
`npm run smoke:migration`) copies it into a scratch repo and has
a real coding agent migrate that copy with the bundled
spec-structure-migration skill; the fixture staying
old-generation is the point.

The notice lives here rather than inside `legacy-tree/` so the
migrating agent never sees an instruction not to modernize the
tree it is supposed to migrate.
