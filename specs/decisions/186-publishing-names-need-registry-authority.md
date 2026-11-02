<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-186: Publishing Names Need Registry Authority

## Status

Accepted (2026-11-02) for the publishing-name gap reported in issue #328.
Amends [DR-168](168-independent-package-registry.md) in authoring guidance and publish preflight, [DR-174](174-what-a-package-provides-is-placed.md) in export guidance, and [DR-151](151-publish-local-spec-packages.md) in publication previews.

## Context

A local group's name may come from the operating-system username, which says nothing about the account's authority at the package registry.
The authoring default could put that name into a manifest, folder and Git release before the author learned that the registry would refuse it.
Publication previews validated release files without checking the selected registry account's namespaces.

## Decision

- Local authoring and export remain available without registry sign-in or connectivity.
  A group-derived suggestion grants no publishing authority: the Org field explains unchecked rights and links the selected registry's `/account/orgs` page whenever the typed name has no successful authorization result.
  Export always explains that it has not checked publishing rights and names that page.
- Successful registry namespace answers alone establish suggested publishing destinations; personal and organization namespaces use the same client contract.
  A change of selected registry or account refreshes suggestions and untouched defaults, preserving manual names and ignoring former-account replies.
- A signed-in preview and each actual publication check the package's org against a fresh authorized-namespace answer from the selected registry before uploading.
  An absent org is a denial with the claim page; an unavailable or malformed answer is an inability to check, never an empty authorization result.
  The registry remains the final authority at upload time.
- An unsigned dry run remains useful for local release validation, explicitly reporting unchecked publishing rights.
  The IDE offers no confirmation of publication from an unchecked preview.
- Existing package names, manifests, folders and released identities are not renamed automatically.
  Registry-side personal claims do not grant a local username that belongs to someone else.

## Consequences

The standalone CLI and IDE share the authorization check, while the registry owns how it proves and binds personal or organization names.
Authors can work offline and see the publishing constraint before their first release.
Integration coverage distinguishes authorized, denied, unavailable and unsigned previews and proves refused operations upload nothing.
