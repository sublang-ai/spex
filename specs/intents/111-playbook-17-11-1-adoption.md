<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-111: Adopt Playbook 17.11.1

## Status

Implemented candidate (2026-10-21); upstream publication, dependency lock, fresh installation and the scoped consumer integration checks are verified. App release gates remain separate.
No beta.15 app release or update of existing user installations or environment selections is claimed.

## Intent

Deliver the classified-entry lifecycle correction through the app's actual Playbook dependency and staged built-in spec package.

## Deliverables

- [x] Accept the scoped adoption decision and raise the core's Playbook floor to `^17.11.1`.
- [x] Resolve the verified public Playbook 17.11.1 artifact without changing the existing Cligent, slc, xstate or SDK identities.
- [x] Verify the installed consumer's session continuation and built-in environment paths.
- [x] Prepare matching `0.9.0-beta.15` shell and release metadata for the source-app candidate.

## Tasks

1. Adopt the verified Playbook 17.11.1 dependency and built-in package, add and verify the consumer integration coverage, and prepare matching `0.9.0-beta.15` shell and release metadata in one candidate commit.

## Verification

The public [Playbook 17.11.1 release](https://github.com/sublang-ai/playbook/releases/tag/v17.11.1) is bound to signed tag `v17.11.1` at `970cec04d2567cd53c95e1ed33c113b26e3b7508`; its upstream gates and publication are independently accepted.
The downloaded registry artifact matches its published integrity, and its decompressed tar, including all 150 file contents and modes, matches the tested upstream candidate; compressed archive byte identity is not claimed.
Fresh `npm ci` installed Playbook 17.11.1 in the consumer worktree while preserving Cligent 0.36.0, slc 0.19.0, xstate 5.33.3 and all existing SDK resolutions, with no links or overrides for these dependencies.
Against the candidate's base, the lock changes only Playbook's version, resolved URL and integrity, the core's Playbook floor and the two shell workspace version rows.
Both shell manifests and their lock workspace version rows name the selected `0.9.0-beta.15` candidate.
The core build and three scoped integration cases passed: real CLI continuation, fresh-home built-in seeding with existing selections preserved, and public-core custom-playbook continuation.
The custom case asks and answers a real workflow question, completes a run, reopens the released runtime in the same logical session and completes another run with exact current text and the earlier record stream intact. Only external providers are scripted. Captain starts a fresh engagement; same-instance terminal reconstruction is verified upstream, not claimed by this consumer case.
The app's source release separately requires exact candidate/main CI success and the fresh installed smoke with its live stage; upstream library or earlier app receipts do not satisfy those gates.
No app release gate is marked complete by this dependency installation.
