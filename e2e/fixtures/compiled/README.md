<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Compiled fixtures

`workflow/` is the app's own example — the text the authoring
workspace's Prefill places (`packages/ui/src/examples/slc-demo`) — as
the real `slc` compiled it, for the hermetic journey
`playbook-library-87` ([DR-089](../../../specs/decisions/089-every-fresh-user-scenario-walked-for-real.md)).
CI registers it and runs it on substitute agents, proving the run path
of a compiled playbook on every commit.

It holds the compiler's output and nothing of the app's:

| File | What it is |
| --- | --- |
| `workflow.playbook/` | slc's artifact layout, as emitted |
| `workflow.ts` | the registry entry slc emits beside it |
| `workflow.md` | the source it compiled |
| `capture.json` | the compiler, the compile's agent, and the engine generation — runtime ABI and artifact schema — the fixture belongs to |

The journey's stub `slc` places these files and the app packages them
as it packages any compile; the stub refuses a draft whose source is
not `workflow.md`.

## Capturing it

The fixture is captured, never written by hand: the regression's
example journey (`playbook-library-86`) compiles the example for real
on the compile player, and `SPEX_E2E_CAPTURE_COMPILED` copies the
compiler's output here.

```bash
npm run build
SPEX_E2E_CAPTURE_COMPILED="$PWD/e2e/fixtures/compiled/workflow" \
  npm run journeys:live -w e2e -- --grep playbook-library-86
```

It needs Codex signed in for the compile (`gpt-6-astra` at `xhigh`) and
Claude for the run; a full `npm run regression` with the variable set
captures it too. Commit the directory as captured.

Capture it again whenever:

- the playbook engine changes generation — a new runtime ABI or
  artifact schema: the journey fails, naming the fixture's generation
  and the app's;
- the example's text changes: the stub refuses the new source.

Until a fixture is captured, the journey skips, naming this file.
