<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-045: First-Run Guidance

## Status

In progress

## Intent

Close the first-run defects a heuristic audit found, so a new user is led from an empty workspace to a running playbook without a glossary, every edit is acknowledged where it was made, and every control speaks in plain words per [DR-010](../decisions/010-interface-craft.md) §8 with its shortcut in the platform's own modifier.

## Deliverables

- [ ] The empty Captain home carries its two ways in — Add a project… and Try the Academy example — and its greeting says what a playbook is.
- [ ] The palette with no project is an add flow: no filter, the path field focused, the Academy row leading; it is modal, Tab wraps inside it, and Escape closes from anywhere in it.
- [ ] The collapsed sidebar keeps the palette control; row ages come from the shared time vocabulary with the exact moment on hover; every row control is a 24px target.
- [ ] Tooltips and labels in plain verbs, the composer's secondary action reading "Add to Up next", and every shortcut label naming ⌘ or Ctrl by platform.
- [ ] Settings acknowledges every edit (Saved ✓, disabled in flight), explains permission modes and writable paths, names the terminal theme for the CLI and stands it last, says when it created the starter config, offers Retry for a missing one, and lists the keyboard shortcuts.
- [ ] Playbooks say "Enable", confirm removal with "Remove" and "Keep", and tell an empty list how to get a first playbook.

## Tasks

1. Spec amendments for the first-run guidance.
2. Captain home and palette: the ways in, the zero-state add flow, the dialog's keys.
3. Sidebar rail: the collapsed palette control, ages, targets, shortcut labels.
4. Settings: acknowledgments, guidance, the missing-config remedy, the shortcut sheet.
5. Playbooks copy, the journeys, and this record.

## Verification

ui 283 green; the journeys `run-view-97`, `projects-28`, `settings-29`, `playbook-library-41`, `run-view-101`, and `run-view-102` (light and dark) green.
