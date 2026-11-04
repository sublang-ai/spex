<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-223: Windows Storage Checks What macOS Checks

## Status

Accepted (2026-11-04) on the owner's direction, after native Windows refused a package addition in a project folder and then refused to start once the Codex sandbox had granted itself read access to the Spex home.
Amends [DR-178](178-native-windows-private-storage.md) in the storage it admits, the principals its check refuses, and the files its policy covers.

## Context

- DR-178 admitted only verified private storage on Windows: every Spex write first checked its folder's descriptor, and the core refused a home granting any principal beyond the current user, LocalSystem and built-in Administrators.
- The same check ran for `spex.yaml`, `spex.lock` and `.spex/` in a project's working folder, since every write defaulted to the private mode; drive roots' default descriptors grant `Users` and `Authenticated Users`, which folders beneath them inherit.
- The Codex Windows sandbox grants its `CodexSandboxUsers` group read and execute access on every top-level entry of the user profile outside a fixed exclusion list that omits `.spex` [[1]], so any Codex run on the machine, including one Spex starts, made the home fail the check.
- A home refused mid-session failed every later write; with package refreshes retrying a failed install, the app stopped responding.
- macOS and Linux create Spex's storage owner-only and verify an existing entry only where its integrity is relied on; there Codex runs as the user and changes no permission, so the same read exposure passes unseen.

## Decision

- Every host creates its owner-only entries owner-only — `local/`, the files an item names owner-only and, on Windows, the home's root, each under a protected descriptor granting the current user, LocalSystem and built-in Administrators even where the folder holding it was widened; any other entry takes what its folder gives it.
- No host checks an existing entry's permissions before writing to it, at start, or before creating or migrating config or storage; an entry another tool widened is admitted.
- The private-storage check remains only where an entry's integrity is relied on — the root lease's owner record and retirement folder, a clone's lease read before a move, upload staging, and a seat's Codex home.
- On Windows that check admits an entry owned by the current user, LocalSystem or built-in Administrators whose descriptor grants no other principal a right to change the entry, its contents, its descriptor or its owner; read, execute and synchronize grants are admitted, and facts that cannot be read whole refuse.
- POSIX keeps its check: the current user's entry with no group or other permission bit.
- An environment's `spex.yaml`, `spex.lock` and files under `.spex/` are ordinary files of their folder wherever the root stands: a new file takes the folder's inherited permissions and mode `0644`, an existing file keeps its mode, and atomic and versioned writes keep their contracts.

## Consequences

- Native Windows adds packages in any project folder and starts and keeps writing after another tool grants itself access to the home.
- An agent account granted read access, such as the Codex sandbox's, can read the home's tokens on Windows, as an agent running as the user can on macOS; keeping tokens in the operating system's credential store remains a separate decision.
- A project file keeps the permissions its folder grants, so tools that read the folder read the environment too, and POSIX environment files are no longer written `0600`.
- Windows reads a descriptor only at creation and at the remaining checks, not at every write.

## References

[1]: https://github.com/openai/codex/blob/12a30d4e6dbd7e527898142b6f4f65fd8070a3b5/codex-rs/windows-sandbox-rs/src/setup.rs#L59-L72 "Codex Windows sandbox setup: user-profile read roots and exclusions"
