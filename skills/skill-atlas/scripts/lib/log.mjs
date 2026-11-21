// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Diagnostics go to stderr so stdout stays machine-readable.

export function warn(message) {
  process.stderr.write(`skill-atlas: warning: ${message}\n`);
}

/** An error whose message is already one line telling the user what to do. */
export class UsageError extends Error {}
