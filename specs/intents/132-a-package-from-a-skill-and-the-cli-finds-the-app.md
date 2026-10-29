<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-132: A Package from a Skill, and the CLI Finds the App

## Status

Implemented and locally verified; CI, independent review and an installed-app walk pending.

## Intent

Let a fresh user publish a skill or a spec they already have from the CLI alone, and let the CLI reach the running Spex app — desktop or server shell — without a hand-copied access URL.

## Deliverables

- [x] The core keeps `local/endpoint.json` while it serves a loopback endpoint, and the server shell announces its loopback access URL; a seat and a public bind write none.
- [x] Attached commands fall back to the endpoint file after `--server` and `SPEX_SERVER_URL`, with the running-app guidance on every failure to find or reach it.
- [x] `spex package init` makes `spex-packages/<name>/` from skill folders and a spec file offline, refusing before any write and naming the next steps.
- [x] The getting-started guide, the CLI guide and both changelogs show the two flows and the discovery order.

## Tasks

1. Write, announce and remove the endpoint file in the core and the server shell, with endpoint, server and seat integration evidence.
2. Add endpoint-file discovery and `package init` to the CLI, with packed-CLI integration evidence read through the core's release reader.
3. Align the guides, changelogs and this record with the verified results.

## Verification

- `npm run build`: every workspace built, exit 0.
- `npm test -w packages/cli`: 156 tests, 156 passed, 0 failed, among them the endpoint-file discovery case [[attached-cli-6](../packages/attached-cli.md#attached-cli-6)] and the `spex package init` suite read through the core's own release reader [[attached-cli-13](../packages/attached-cli.md#attached-cli-13)].
- `packages/core`: `node scripts/run-tests.cjs '^endpoint\.integration\.test\.js$'`: 4 tests, 4 passed, 0 failed [[core-service-143](../packages/core-service.md#core-service-143)].
- `apps/server`: `node --test dist/server.integration.test.js`: 14 tests, 14 passed, 0 failed; `node --test dist/seat.integration.test.js`: 6 tests, 6 passed, 0 failed — the loopback bind's file, and none for a public bind or a seat.
- A walk in a scratch Git folder with an Apache-2.0 `LICENSE`, a skill under `.claude/skills/` and a spec file: `package init` from the skill, from the spec, from both with `--license` and `--language`, and with `--move`; each listed refusal exits 1 and writes nothing; every folder made is accepted by the core's `readPublishableRelease`.
- A SKILL.md behind a byte order mark, which the core's and the registry's readers find no frontmatter in, is refused naming it, nothing written; a spec file behind one still yields a folder the core accepts.
- `apps/server`: the loopback bind's file, and none for a public bind or a seat, stand under [[server-shell-28](../packages/server-shell.md#server-shell-28)]; the core's own file under [[core-service-144](../packages/core-service.md#core-service-144)].
- `spex lint`: 0 errors.
- `npm run prepush`: clean.
