<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Release Smoke Checklist

Run before tagging any release (RELEASE-20/21). The automated suite
comes first; the manual passes exercise what automation cannot —
real agents, packaging, and look-and-feel.

## 1. Automated suite

```bash
npm run smoke -- --desktop
```

Stages: build → spec lint → unit tests → core integration tests →
core round-trip (template composes with `/code` + `/discuss`,
builtin catalog and artifacts served, Academy example seeds and its
tree parses) → Electron render with screenshot (`--desktop` flips
the native ABI to Electron and restores it).
Omit `--desktop` for a quick mid-development pass.
A failure names its stage; fix before continuing.

## 2. Manual pass — desktop app

Launch: `npm run rebuild:electron -w apps/desktop && npm start -w apps/desktop`.

| Step | Expect |
| --- | --- |
| First launch, fresh config (`XDG_CONFIG_HOME` unset or pointing at a home without `playbook/playbook.config.yaml`) | Captain home greets; quick start lists `/code` and `/discuss`; readiness names any signed-out agents |
| Palette (⌘P) → "Try the Academy example" | Project seeds, registers, and becomes current; repeat click reopens it without error |
| Specs tab over Academy | Packages and Compositions branches render; filters and search work; a binding item shows serves/provides rows, a scenario composes, a test executes/verifies; jumps land and flash |
| Playbooks surface | `/code` and `/discuss` pipelines show source, gears, and state machine; example card stages all four artifacts; prefill fills the compile form (roles pre-mapped) |
| Real run: `/code` a one-task slice over the Academy project | Coder streams; committer commits; reviewer reviews; findings loop converges; abort works and parks cleanly with the attention badge |
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
