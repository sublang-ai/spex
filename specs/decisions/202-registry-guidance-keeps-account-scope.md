<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-202: Registry Guidance Keeps Account Scope

## Status

Accepted (2026-11-02).
Amends [DR-200](200-publishing-names-need-registry-authority.md).
Amended by [DR-218](218-write-a-playbook-before-publishing.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

The owner asked that package and Space accounts be kept apart and their visitor guidance corrected.
A registry and a Space can share an origin while keeping separate accounts.
The unscoped `/account/orgs` destination can open the Space account or a package-management handoff, even when the author is already signed in to the registry.
That detour obscures which account grants publishing rights.

## Decision

This decision amends [DR-200](200-publishing-names-need-registry-authority.md) in the namespace-management destination used by authoring, export and publication guidance.

Namespace-management guidance from the IDE, core and CLI uses the selected registry's `/account/orgs?scope=registry` URL.
The explicit query selects the registry account page; it does not change registry configuration, credentials, namespace authorization or API requests.

Visitor guides use the same destination and distinguish registry namespaces from Space accounts.
Their command examples and interface labels follow the current CLI and IDE, including installed playbooks.

## Consequences

An author reaches the relevant account directly even when the origin also provides a Space.
Existing integration coverage checks the complete URL in export guidance, publication refusals and the IDE's ordinary external claim link.
