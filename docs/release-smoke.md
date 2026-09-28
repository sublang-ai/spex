<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Release Smoke Checklist

What to run before tagging, by tier
([DR-086](../specs/decisions/086-tests-in-tiers.md)). The checks — unit,
integration and browser journeys, on Linux and macOS — are CI's: tag
only a commit whose CI run concluded `success` (release-15). Nothing
below repeats them.

| Tag | Smoke | Live smoke | Regression | Manual residue |
| --- | --- | --- | --- | --- |
| `app-vX.Y.Z` | yes | yes | yes | yes |
| `app-vX.Y.Z-beta.N` | yes | yes | no | no |
| `cli-vX.Y.Z` | yes | no | no | no |

A CLI tag also runs the live migration smoke (`npm run smoke:migration`,
release-24).

## 1. The smoke — every release candidate

```bash
npm run smoke
```

Four stages, fail-fast, each named: `build` → `lint` (the spec lint) →
`fresh-install` → `cli-user`. No sign-in is involved; budget about ten
minutes, most of it `npm ci` on an empty cache.

The fresh install (`scripts/install-smoke.mjs`) is a new user following
the README on this machine:

- It clones the committed tree — `HEAD`, not the working tree; a warning
  names uncommitted changes — into a scratch directory, and installs it
  with `npm ci` on an empty npm cache.
- `npm run start:server` runs on a scratch Spex home and is walked over
  its printed token URL: the page served, the socket's hello, the seeded
  config valid with every template playbook, the built-in catalog and
  the `/code` artifacts, readiness for each configured adapter (this
  machine's sign-ins; none is asserted ready and no agent is called),
  the compiler check naming the clone's own `@sublang/slc`, the Academy
  example seeded and parsed. SIGTERM then exits it 0 with the port
  closed.
- `npm start` builds, rebuilds the native module for Electron, renders
  the desktop in acceptance mode on scratch user data — opening
  Playbooks, Settings and the Dashboard — writes a screenshot, and
  restores the module, all inside the clone: the developer tree's native
  module is never flipped.

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
npm run smoke:desktop
```

Boots the real desktop app against a scratch home and walks the
critical path over the app's own socket: seeded config valid →
Academy seeds and parses → session starts → a minimal `/code` turn
dispatches → the coder emits text, thinking or tool activity
(initialization alone does not count) → abort → released session →
clean teardown, with the ABI flipped and restored by the driver
(release-22). Needs a locally signed-in Claude adapter; budget ~5–8
minutes.

After a successful build, `SPEX_SMOKE_BUILD_READY=1 npm run
smoke:desktop` reuses it while its build inputs remain unchanged; ABI
setup and restoration still run.

`SPEX_SMOKE_MANUAL=1` enables the scratch profile's abort notification
and keeps the settled session open for inspection (section 4). Press
Enter to finish; after five minutes the check fails and cleans up. No
extra agent turn runs.

A provider-side failure may be retried or waived, its reason recorded
beside the tag; an app-side failure blocks the tag.

## 3. The regression — regular app releases

```bash
npm run regression
```

The browser journeys' live lane: the served shell on a scratch home,
this machine's real adapters and Captain, assertions through the page
(release-25).

1. A real `/code` is observed to live output and aborted cleanly.
2. The chat-authored two-role changelog playbook compiles for real on
   the `compiler` roster player, bound to `gpt-6-astra` at effort
   `xhigh`, then registers and runs: the turn finishes with both players
   engaged and their commit in the repository.
3. A new project is developed through two `/code` intents: a fresh
   repository with scaffolded specs is added from the palette, the
   first intent started from the Dashboard and the second queued behind
   it; each settles after its review, the queue hands off without
   confirmation, the tests pass with both changes committed, and
   History lists both intents.

Needs Claude signed in for the Captain and the players that run
playbooks, and Codex for the compile. It takes hours and real model
calls; each journey attaches the Captain's and the players'
transcripts. A provider-side failure may be retried or waived, its
reason recorded beside the tag; an app-side failure blocks the tag.

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
- Gates: CI green for the tagged commit, the smoke, and the live smoke.
  No regression, no manual residue.
- Notes: the changelog's `[Unreleased]` section as it stands at the tag,
  which must not be empty. The changelog gains no section for a beta:
  the regular release that follows moves `[Unreleased]` into its version
  section, folding the betas' notes into it.
- The GitHub release is a pre-release titled `Spex App vX.Y.Z-beta.N`,
  stating that it ran the smoke and the live smoke but not the
  regression.

## 6. Record

Note each run (date, commit, deviations, any waiver and its reason) in
the release PR or tag message. Any red step blocks the tag.
