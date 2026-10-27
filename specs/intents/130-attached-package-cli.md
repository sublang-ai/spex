<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-130: Attach the Package CLI to the Local Core

## Status

Backend and CLI implemented; focused verification and independent backend review passed; combined pre-push checks passed; CI and installed app smoke pending.

## Intent

Provide essential fresh-user package and sign-in operations through the running local core, with request-specific outcomes.

## Deliverables

- [x] Review the attached CLI and opt-in completion contracts.
- [x] Implement correlated backend completion and matched sign-in cancellation without changing default UI behavior.
- [x] Implement and package the thin CLI and concise UI/CLI guidance.
- [x] Verify changed behaviors through real protocol and packed-CLI integration flows.

## Tasks

1. Align the decision, behavior specs, backend and affected integration cases.
2. Add the CLI client and commands with focused distribution/integration evidence.
3. Align fresh-user documentation and complete independent review and required checks.

## Verification

- Core compilation passed after the implementation and fixture type corrections.
- Six changed core integration cases passed: legacy authoring publication, correlated publication and disconnect, overlapping terminal waits, preflight shutdown admission, owned sign-in cancellation/denial/expiry, and pending-start cancellation with later catalog failure.
- The initial overlapping-wait fixture read the working folder instead of its clone; the original failed run is retained externally and that case passed after the fixture correction.
- Independent backend review found pending-start cancellation and post-preflight shutdown gaps; their minimal repairs and changed-input cases passed, and re-review found no remaining material issue.
- Packed CLI integration passed all eleven cases; its real-core case passed again after the backend repairs without repeating the unchanged protocol cases.
- The CLI migration gate passed once with GPT-6.1 Sol/high, with no retry or waiver and unchanged production inputs.
- Native host and SIGINT checks retain their supported-platform boundaries; Windows still exercises the packed CLI and its transport.
- Spec lint passed with zero errors and the pre-existing core-service-41 sentence advisory; the combined pre-push gate passed, while CI and installed app smoke remain pending.

The final publication-receipt URL uses the actual uploaded package identity; its focused real-RPC receipt check passed after that correction.
