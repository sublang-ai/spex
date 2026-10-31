<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-173: Windows Git Source Long Paths

## Status

Accepted, 2026-10-31.

## Context

A native Windows APP could query a public repository but could not install it. Git's actual trace showed a successful HTTPS transfer followed by index-pack refusing its pack keep file with Filename too long. The APP cache includes a source digest and a unique staging suffix; a shorter diagnostic cache succeeded with the same Git, repository and network.

The native regression then exposed Git archive applying the Windows automatic line-ending default: a committed LF file was exported as CRLF. That changes the release and would invalidate the Skill's exact source-byte installation manifest.

## Decision

Select Git for Windows' core.longpaths=true with a command-scoped -c option in the Git source runner. Keep the arguments, credential handling, immutable commit and digest checks, private storage and failed-install preservation unchanged. Do not change the user's Git configuration or the operating system's long-path policy, shorten away the failing case, or substitute a local package for the remote source.

Select core.autocrlf=false on the archive command on every host. Preserve the committed release bytes instead of normalizing them after extraction or accepting different hashes. Test against an actual native Git runner with automatic conversion explicitly enabled before the archive's own option.

## Consequences

The APP's own Git can create pack and reference files below long mirror roots. POSIX command behavior is unchanged. Verification includes a real Windows file-transport fetch into a cache matching the observed 201-character mirror and 265-character keep-file path, commit reuse and unchanged source configuration, followed by the public-repository installation in the installed Windows APP. This does not remove Git's separate native Git-directory length bound: an initial oversized fixture reached that upstream bound even with long paths enabled and is retained as diagnostic evidence.
