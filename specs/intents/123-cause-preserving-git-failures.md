<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-123: Cause-Preserving Git Failures

## Status

Implemented and reviewed; focused verification passed, integration not yet complete (2026-10-25).

## Intent

Keep the actual Git failure and its affected ref or file visible alongside bounded advice, without losing the cause through nested wrappers or changing classification and redaction.

## Deliverables

- [x] A shared summary retains the primary diagnostic and final advice within three nonempty lines.
- [x] Generic Git fallback paths share the summary without changing host-word or URL-redaction behavior.
- [x] Real-core lock, nested-wrapper and redaction regressions pass.

## Tasks

1. Specify, implement and verify cause-preserving Git failure summaries.

## Verification

- One scratch-only local fetch under the installed Apple Git 2.50.1 failed against a tracking-ref lock and retained its full raw stderr: the first line names the lock, ref, file and file-exists cause, while the previous final-three-line summary retains only generic advice.
- The scratch fetch was attempted once against a local bare remote, with no service or network and no retry.
- The existing real-core tracking-lock scenario now checks the ref and file-exists cause before its existing recovery assertions; its extension exercises a real Git failure through the command wrapper and operation fallback with synthetic URL credentials in command context.
- Root review, the revised core build and spec lint passed.
- The strengthened real-core lock, nested-wrapper, redaction and recovery case passed in the revised 175-case integration run.
  That run had 159 passes and 16 settling timeouts; none is waived or claimed repaired by this message fix.
- The earlier coherent-reader run had 169 passes and six failures; this implementation does not waive that run or claim to repair its five timed cases.
- The same frozen revised build subsequently passed all 175 cases, including the strengthened lock, nested-wrapper, redaction and recovery case, in 2219.08 seconds with two test files concurrently.
  This was a direct-Node scheduling diagnostic; the prior failures remain preserved, and the newly capped repository runner and final integration remain unverified.
