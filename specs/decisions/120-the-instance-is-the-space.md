<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-120: The Instance Is the Space

## Status

Accepted (2026-10-12) on the owner's correction.
Amends [DR-064](064-honest-remote-failure.md), [DR-103](103-the-home-and-its-groups.md).
Amended by [DR-127](127-a-home-signed-in-to-several-instances.md), [DR-128](128-a-spex-repository-placed-at-several-instances.md), [DR-129](129-content-size-is-not-permission.md), [DR-150](150-spex-space-product-and-destination.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- A Space deployment, an **instance**, keeps everything its people make inside one group of its own, its container, on the Git system behind it, run by a service identity of its own; that system is its storage [[1]].
- An unreleased first draft of this record modelled the instance's own group in the client — its path in every key, its owner named in guidance — and so built the storage into the person's model.
- The owner's correction: a person sees the instance alone, by its URL; the Git system's top-level group is storage.
- The instance answers every repository path relative to its root, leaves its service identity out of every answer, and answers no page URL [[1]].

## Decision

- The instance is the space: Spex names only the instance — its URL and display name — on every surface, in every protocol reply, key and workspace folder, and in every Git line a report carries; never the Git system behind it, its container, its paths or its pages. The client has no naming exception.
- Keys and workspace folders of placed clones are the paths the instance answers, under the instance's own folder ([DR-127](127-a-home-signed-in-to-several-instances.md)); the personal records folder, holding the global records repository and local-only clones, lies outside every instance's folder and is named after the account login ([DR-127](127-a-home-signed-in-to-several-instances.md), [DR-221](221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md)).
- No door to the host's pages: no "Open at <host>" and no host page link anywhere; no page URL of the instance or its Git system, and no URL under the instance's Git origin, crosses the protocol: a records remote there travels as its path in the instance, and a remote outside every instance's origin crosses only with its embedded user removed.
- Amends [DR-064](064-honest-remote-failure.md) in what a report prints: no URL under the Git host's origin is printed, and any other remote URL only with its embedded user removed.

### Git's lines

- No line a report carries — Git's last lines and the host's `remote:` words alike — holds a URL under the host's Git origin: the clone's own remote, with or without `.git` and a trailing `/`, reads as the repository's path in the instance, and any other URL under that origin as the instance's display name.
- A transport to the host that reaches no classification rule stops as "<display name> answered with an error", with the HTTP status Git printed, and Retry.
- The Space state carries a clone's remote at the host as its path in the instance; the Git origin stays inside the core, for the credential helper and the remote checks.

## Consequences

- `space` (Git's lines and the instance's naming), `git-host` (the read and the stand-in), `storage` (folder names) and `environments` (source labels and failures) follow this boundary; the protocol carries no page URL and no URL under an instance's Git origin.
- The stand-in host keeps no group of its own, answers paths in the instance, and hides a scripted service identity.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/packages/host.md "spex.pub host package"
