<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-080: The Config Directory Is Named Config

## Status

Accepted (2026-09-20).
Amends [DR-037](037-playbook-12-adoption.md): the config relocation serves the home's former `playbook/` location ahead of the XDG one, and a former file inside the home is removed once the canonical file is published.
Adopts Playbook's [DR-064](https://github.com/sublang-ai/playbook/blob/main/specs/decisions/064-the-config-directory-is-named-config.md), which moves the canonical path; the core's dependency floor moves to the Playbook release shipping it.

## Context

- The shared config sat at `playbook/playbook.config.yaml` under the Spex home: Playbook's DR-043 gave the launcher a singular `playbook/` namespace beside the plural `playbooks/` library Spex owns.
- The home is otherwise laid out by what a directory holds — `sessions/`, `intents/`, `playbooks/`, `local/` — never by owning product; the launcher's own sessions sit at `sessions/`.
  The `playbook/` directory holds one file, stutters, and is one letter from the library.
- Playbook's DR-064 moves the canonical path to `config/playbook.config.yaml` and relocates from both former locations; whichever host launches first performs the move, so the core performs the same one.

## Decision

- `config/` is the home's directory of human-authored configuration, each file named for the format it follows; the launcher config is `config/playbook.config.yaml`, and its directory stays the primary configuration directory every relative locator resolves against.
  App-written state — `prefs.json`, caches, receipts — stays where it is; it is not configuration a person authors.
- The core relocates once at start, exactly as the launcher does, from the nearer former location first: the home's `playbook/playbook.config.yaml`, then the XDG path.
  A move is refused, and reported, only when a relative `sessions` or path-shaped `playbooks.<id>.from` locator would resolve to a different target from the new directory; a relative locator reaching beside or above the directory keeps its target across the sibling move, since `config/` sits at the depth `playbook/` did, and only one pointing into the directory is refused.
- A former file inside the home is removed once the canonical file is published, its directory with it when that leaves the directory empty, so the home holds one config and Git records a move rather than a copy.
  The XDG file is left in place as before.
- The Space names `config/playbook.config.yaml` the Settings unit and family; a `playbook/` path that still appears — a lingering directory, or an older device's edit arriving through sync — is what any other path is: a tracked path listed by name, or not a Spex folder.

Considered and declined:

- the file at the home's root: relative locators change depth and the launcher refuses such a move for a managed library; the file's backups would sit among the state files;
- `settings/`: the interface's word; the file is `*.config.yaml` and the launcher's flag is `--config`;
- renaming the file: `playbook.config.yaml` is Playbook's format name, and every raw `--config` and project-level config carries it.

## Consequences

- The storage catalog, the Space's unit and family tables, the Settings surface's intent and the relocation item name the new path; the relocation item gains its second source and its removal rule.
- A device that edits the former path before upgrading meets an explicit whole-file choice at its next sync, as any deletion against a modification does; upgrading every device before syncing avoids it.
- Until the CLI on a machine resolves `config/`, it seeds its own file at `playbook/`; the release ordering, not a runtime negotiation, keeps the two hosts on one file — as DR-037 already accepted.
