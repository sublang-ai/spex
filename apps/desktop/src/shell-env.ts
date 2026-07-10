// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Login-shell environment capture (SHELL-12, DR-004): GUI apps do
// not inherit shell-profile exports, so credentials like
// ANTHROPIC_API_KEY are invisible unless captured explicitly.

import { execFile } from "node:child_process";

const MARKER = "__SPEX_ENV_START__";

/** Parse `env` output into a map; tolerates multi-line values by
 * attaching continuation lines to the previous key. */
export function parseEnvOutput(text: string): Record<string, string> {
  const start = text.indexOf(MARKER);
  const body = start >= 0 ? text.slice(start + MARKER.length) : text;
  const result: Record<string, string> = {};
  let lastKey: string | undefined;
  for (const line of body.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      result[match[1]] = match[2];
      lastKey = match[1];
    } else if (lastKey && line.length > 0) {
      result[lastKey] += `\n${line}`;
    }
  }
  return result;
}

/** Capture the user's login-shell environment with a bounded wait.
 * Returns {} on any failure — the app then runs with its own env. */
export function captureLoginShellEnv(
  shell: string = process.env.SHELL ?? "/bin/zsh",
  timeoutMs = 4000,
): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const child = execFile(
      shell,
      ["-ilc", `echo ${MARKER}; env`],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) {
          resolve({});
          return;
        }
        resolve(parseEnvOutput(String(stdout)));
      },
    );
    child.on("error", () => resolve({}));
  });
}

/** Merge captured env into target without clobbering existing keys. */
export function mergeEnv(
  target: NodeJS.ProcessEnv,
  captured: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(captured)) {
    if (target[key] === undefined) target[key] = value;
  }
}
