<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Release Smoke Checklist

Run before tagging any release (RELEASE-20/21). The automated suite
comes first; the manual passes exercise what automation cannot —
real agents, packaging, and look-and-feel.

## 1. Automated suite (hermetic — the tagging gate)

```bash
npm run smoke -- --desktop
```

Stages: build → spec lint → unit tests → core integration tests →
core round-trip (template composes with `/code` + `/discuss` as
inline agent blocks, builtin catalog and artifacts served, Academy
example seeds and its tree parses) → Electron render with screenshot
(`--desktop` flips the native ABI to Electron and restores it, on
every exit path).
Omit `--desktop` for a quick mid-development pass.
No provider or sign-in is involved; a failure names its stage.

## 1b. Live desktop smoke (signed-in — the app-release gate)

```bash
npm run smoke:desktop
```

Boots the real desktop app against a scratch home and walks the
critical path over the app's own socket: seeded config valid →
Academy seeds and parses → session starts → a minimal `/code` turn
dispatches → the coder's live output is observed (real agents) →
abort → clean teardown, with the ABI flipped and restored by the
driver (RELEASE-22).
Needs a locally signed-in Claude adapter; budget ~5–8 minutes.
Provider-side flakes may be retried or waived with the reason
recorded beside the tag; app-side failures block.

## 2. Manual pass — desktop app

Launch: `npm run rebuild:electron -w apps/desktop && npm start -w apps/desktop`.

| Step | Expect |
| --- | --- |
| First launch, fresh config (`XDG_CONFIG_HOME` unset or pointing at a home without `playbook/playbook.config.yaml`) | Captain home greets; quick start lists `/code` and `/discuss`; readiness names any signed-out agents |
| Palette (⌘P) → "Try the Academy example" | Project seeds, registers, and becomes current; repeat click reopens it without error |
| Specs tab over Academy | The Packages branch renders its collection directories (the migrated corpus has no compositions, so no Compositions branch appears); filters and search work; an item with citations shows outbound citation rows, cited items show grouped inbound backlinks, and jumps land and flash |
| Playbooks surface | `/code` and `/discuss` pipelines show source, gears, and state machine; example card stages all four artifacts; prefill fills the compile form (roles pre-mapped) |
| (The live run is automated by `npm run smoke:desktop`; spot-check the dock badge and notification banners during it) | Badge counts parked/failed sessions; banners appear per prefs |
| Dashboard | The run's usage appears; attention queue lists any parked/aborted turn |
| Settings | Profile edit round-trips (`effort` field); config stays valid |
| Dark theme (OS toggle) | Sidebar mark, panes, and spec view stay legible |

## 3. Manual pass — packaging

```bash
npm run package -w apps/desktop
```

| Step | Expect |
| --- | --- |
| Open the zip in `apps/desktop/release/` | App bundle carries the sunset-rabbit icon |
| Launch the packaged app | Boots to Captain home; seeding and Specs tab work as in the dev pass |
| `npm pack --dry-run -w packages/cli` | Tarball lists only production files (RELEASE-17) |

## 4. Record

Note the smoke run (date, commit, deviations) in the release PR or
tag message. Any red step blocks the tag (RELEASE-21).
