<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-213: Public GitHub Code Opens over HTTPS

## Status

Accepted (2026-11-03) on the owner's direction to make public repositories open on a server without setup, with no new credential or private-repository flow.
Amends [DR-103](103-the-home-and-its-groups.md) in the code remote recorded with a project and its matching across devices, and [DR-132](132-team-servers.md) in cloning public GitHub code and explaining a failed code clone.

## Context

- A public project recorded its local SSH remote, so opening it on a server required an SSH key despite its code being publicly readable over HTTPS.
- Changing only the clone URL would let a later sync alternate the shared remote between the local SSH URL and the server's HTTPS URL.

## Decision

- A recognized GitHub code URL has one HTTPS identity in shared project records, used for matching and new code clones, including clones from older records naming SSH.
  Recognition covers the ordinary `github.com` SSH and HTTPS forms at their default ports; aliases, custom ports and other hosts keep their given URLs.
  Identity normalization is syntactic and probes no repository's visibility.
- Existing working folders keep their Git remotes; a public GitHub project opens on a server through HTTPS with no credential setup.
  Existing credential behavior remains; no private-access, push or submodule flow is added.
- A failed code clone requests a missing credential only where Git reports that authentication is required; other failures keep their actual cause.

## Consequences

- Local SSH and server HTTPS folders share stable project metadata and match the same project.
- New clones use the canonical URL while existing working folders stay as they are.
- Storage, code-clone and Space contracts cover normalization, compatibility and the public opening path through real-core integration tests.
