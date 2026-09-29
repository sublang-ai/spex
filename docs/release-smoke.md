<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Release Smoke Checklist

What to run before tagging, by tier
([DR-086](../specs/decisions/086-tests-in-tiers.md),
[DR-089](../specs/decisions/089-every-fresh-user-scenario-walked-for-real.md)).
The checks — unit, integration and browser journeys, on Linux and
macOS — are CI's: tag only a commit whose CI run concluded `success`
(release-15). Nothing below repeats them.

| Tag | Smoke | Live smoke | Regression | Manual residue |
| --- | --- | --- | --- | --- |
| `app-vX.Y.Z` | `npm run smoke -- --live` | its `live` stage | yes | yes |
| `app-vX.Y.Z-beta.N` | `npm run smoke -- --live` | its `live` stage | no | no |
| `cli-vX.Y.Z` | `npm run smoke` | no | no | no |

An app tag runs the smoke and the live smoke as one command: the live
smoke is the smoke's last stage, run inside the fresh install (section
2).

A CLI tag also runs the live migration smoke (`npm run smoke:migration`,
release-24).

## 1. The smoke — every release candidate

```bash
npm run smoke
```

Four stages, fail-fast, each named: `build` → `lint` (the spec lint) →
`fresh-install` → `cli-user`. No sign-in is involved; budget about ten
minutes, most of it `npm ci` on an empty cache. Run it on a clean tree:
the build, the lint and the CLI pass read the working tree while the
fresh install clones `HEAD`, so the smoke refuses uncommitted changes
unless `--allow-dirty` is given. The release records under
`docs/releases/` are exempt: no stage reads them, and a release's record
is written while its gates run (section 6).

The fresh install (`scripts/install-smoke.mjs`) is a new user following
the README on this machine:

- It clones the committed tree — `HEAD`, not the working tree — into a
  scratch directory, and installs it with `npm ci` on an empty npm
  cache.
- `npm run start:server` runs as the README runs it, with only
  `SPEX_HOME` set to a scratch home and, beyond the README, an ephemeral
  port (`--port=0`) so it never meets a server already on 8137. It is
  walked over its printed token URL — the default loopback host with a
  generated token: the page served, the socket's hello, the config
  seeded at the home's `config/playbook.config.yaml` and valid with
  every template playbook, the built-in catalog and the `/code`
  artifacts, readiness for the Captain's and each bound player's adapter
  (this machine's sign-ins; none is asserted ready and no agent is
  called), the compiler check naming the clone's own `@sublang/slc`, the
  Academy example seeded and parsed. SIGTERM then exits it 0 with the
  port closed.
- `npm start` builds, rebuilds the native module for Electron, renders
  the desktop in acceptance mode on scratch user data — opening
  Playbooks, Settings and the Dashboard by their English names, the
  scratch home storing English as its language so the names hold on any
  system — writes a screenshot, and restores the module, all inside the
  clone: the developer tree's native module is never flipped.

The CLI user pass packs the release tarball, installs it into an
isolated prefix, and walks the README's fresh-user and upgrading-user
journeys through the installed `spex` bin.

- `--from=<stage>` resumes at a stage only after every earlier stage has
  passed on the current inputs; record the earlier results with the
  resumed run.
- `--keep` keeps the fresh install's scratch directory, screenshot
  included; a failure always keeps it and prints its path.
- The fresh install needs the network (the npm registry, and Electron's
  binary unless Electron's own download cache holds it) and a display:
  on a headless Linux, run `xvfb-run -a npm run smoke`.

## 2. The live smoke — every app release candidate

```bash
npm run smoke -- --live
```

The smoke with its `live` stage (release-20, release-22,
[DR-089](../specs/decisions/089-every-fresh-user-scenario-walked-for-real.md)):
after the CLI user pass, the live desktop smoke runs from the fresh
install's clone and inside it — the app as a new user installed it —
on this machine's signed-in agents and a scratch Spex home. It boots
the real desktop app and walks the critical path over the app's own
socket: seeded config valid → Academy seeds and parses → session
starts → a minimal `/code` turn dispatches → the coder emits text,
thinking or tool activity (initialization alone does not count) →
abort → released session → clean teardown, with the clone's native
module flipped to Electron and restored by the driver. Needs a locally
signed-in Claude adapter; budget ~5–8 minutes beyond the smoke's own.

- The stage takes over the fresh install's scratch directory: removed
  when the stage passes, kept with its path printed when it fails, kept
  always with `--keep`.
- A live run resumes only up to the fresh install
  (`--from=fresh-install`), whose clone the stage needs.
- `npm run smoke -- --live --dry-run` names the stages without running
  any.

`npm run smoke:desktop` runs the same driver from the developer tree,
for development; it is not the gate. There, after a successful build,
`SPEX_SMOKE_BUILD_READY=1 npm run smoke:desktop` reuses it while its
build inputs remain unchanged; ABI setup and restoration still run.
`SPEX_SMOKE_MANUAL=1` enables the scratch profile's abort notification
and keeps the settled session open for inspection (section 4). Press
Enter to finish; after five minutes the check fails and cleans up. No
extra agent turn runs.

A provider-side failure may be retried or waived, its reason recorded
beside the tag; an app-side failure blocks the tag.

## 3. The regression — regular app releases

```bash
npm run build          # the journeys import the built core and server
npm run regression
```

The browser journeys' live lane: the served shell on a scratch home,
this machine's real adapters and Captain, assertions through the page
(release-25). Both compiles run on the `compiler` roster player, bound
to `gpt-6-astra` at effort `xhigh` — the only work Codex gets — and the
compiled playbooks run on the template's claude players.

1. The app's own example (playbook-library-86): the text the
   Prefill places is used as the source, compiled for real from the
   workspace's Compile, registered on the Register tab's prefill, and
   run as `/workflow`: the turn finishes with both players engaged and
   a commit in the repository.
2. The chat-authored two-role changelog playbook
   (playbook-library-78): authored in the draft's conversation,
   compiled, registered and run to a finished turn with both players
   engaged and their commit in the repository — the harder case.
3. A new project (dashboard-63, run-view-150): created from the
   palette with specs scaffolded, then developed through a `/decide`
   intent started from the Dashboard and a `/code` intent queued behind
   it. Each settles after its review, the queue hands off without
   confirmation, a question a player asks is answered through the
   Captain, the repository's tests pass with a commit from each cycle,
   and History lists both intents.

Needs Claude signed in for the Captain and the players that run
playbooks, and Codex for the compiles. It takes hours and real model
calls; each journey attaches the Captain's and the players'
transcripts, and a refused compile the compiler's output. Judge each
failure by its class
([DR-089](../specs/decisions/089-every-fresh-user-scenario-walked-for-real.md)):

| Failure | Outcome |
| --- | --- |
| Provider-side: a refusal, a quota, an outage | retried, or waived with its reason recorded beside the tag |
| The bundled compiler refusing the app's own example | blocks the tag |
| The compiler refusing the chat-authored source after the bounded relay | may be waived, the compiler's output attached and an issue filed against `slc` |
| Any other app-side failure | blocks the tag |

The hermetic journeys run the example as the real `slc` compiled it
(playbook-library-87) from a committed fixture, captured by the first
journey: set `SPEX_E2E_CAPTURE_COMPILED` to the fixture's directory
for the run, as `e2e/fixtures/compiled/README.md` says, whenever the
playbook engine changes generation or the example's text changes, and
commit what it writes.

## 4. The manual residue — regular app releases

What no automation sees (release-21).

| Step | Expect |
| --- | --- |
| A settled turn's notification and badge: `SPEX_SMOKE_MANUAL=1 npm run smoke:desktop` | The native notification follows the scratch preferences; the dock badge matches the Dashboard's attention, and a cleanly settled standalone session leaves both at zero. A failure blocks the tag. |
| The packaged app, a local option and not a gate — app releases ship no binaries ([DR-040](../specs/decisions/040-source-only-app-releases.md)): `npm run package -w apps/desktop` | The zip in `apps/desktop/release/` carries the sunset-rabbit icon; the packaged app boots to the Captain home and seeds the Academy example. |

## 5. Beta app releases

A beta ships for early trial without the regression
([DR-087](../specs/decisions/087-beta-app-releases.md)).

- Tag `app-vX.Y.Z-beta.N`, `N` counting from 1 within one version; the
  workflow refuses any other pre-release identifier.
- Bump `apps/desktop` and `apps/server` together to `X.Y.Z-beta.N`,
  verbatim.
- Gates: CI green for the tagged commit and `npm run smoke -- --live` —
  the smoke with the live smoke as its last stage. No regression, no
  manual residue.
- Notes: the changelog's `[Unreleased]` section as it stands at the tag,
  which must not be empty. The changelog gains no section for a beta:
  the regular release that follows moves `[Unreleased]` into its version
  section, folding the betas' notes into it.
- The GitHub release is a pre-release titled `Spex App vX.Y.Z-beta.N`,
  stating that it ran the smoke and the live smoke but not the
  regression.

## 6. Record

Record each run — date, commit, stage timings, deviations, any waiver
and its reason — in `docs/releases/<version>-preparation.md`, shaped like
the existing files there, as the release playbook
([`playbooks/release.md`](../playbooks/release.md)) does; the smoke's
clean-tree check exempts that directory, so a gate re-run needs no
`--allow-dirty` over the record. Any red step blocks the tag.
