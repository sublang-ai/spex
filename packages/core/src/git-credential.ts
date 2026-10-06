// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Git credential handed to one Git child through Spex's own helper
// (git-host-9, DR-103): never through the remote URL. The username and
// secret the host returned go into a file of mode 0600 inside a fresh
// directory of mode 0700, which the caller disposes of when the child
// ends; Git runs with `-c credential.helper=` resetting the device's own
// helpers and then naming the app's helper script on the app's own
// runtime, so the brokered secret is neither looked up in nor stored to
// any other helper. A transport to any other origin uses none of this.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The environment variable naming the credential file for the helper. */
export const GIT_CREDENTIAL_FILE_ENV = "SPEX_GIT_CREDENTIAL_FILE";

/** The helper script shipped in the package's `assets/` folder, which
 * sits beside both `src/` and `dist/`. */
export function gitCredentialHelperPath(): string {
  return fileURLToPath(new URL("../assets/git-credential-spex.mjs", import.meta.url));
}

/** The runtime this process runs on: Electron's Node or plain Node. */
export function currentRuntime(): { execPath: string; electron: boolean } {
  return { execPath: process.execPath, electron: typeof process.versions.electron === "string" };
}

export interface GitCredentialHandle {
  /** Added to the Git child's environment. */
  env: NodeJS.ProcessEnv;
  /** Placed before the Git subcommand. */
  configArgs: string[];
  /** Removes the credential's directory; call when the Git child ends. */
  dispose(): Promise<void>;
}

/** Characters `sh` still interprets inside double quotes, and those that
 * would end the helper's command line. */
const UNSAFE_FOR_SH = /["`$\\\n\r\0]/;
/** Git's credential protocol is line-based: no newline or NUL inside. */
const UNSAFE_FOR_PROTOCOL = /[\n\r\0]/;

export async function withGitCredential(
  credential: { username: string; secret: string },
  runtime: { execPath: string; electron: boolean },
  options: { helperPath?: string } = {},
): Promise<GitCredentialHandle> {
  const helperPath = options.helperPath ?? gitCredentialHelperPath();
  for (const [what, path] of [["runtime", runtime.execPath], ["helper", helperPath]] as const) {
    if (path.length === 0 || UNSAFE_FOR_SH.test(path)) {
      throw new Error(`The ${what} path cannot be quoted for Git's credential helper: ${JSON.stringify(path)}`);
    }
  }
  if (UNSAFE_FOR_PROTOCOL.test(credential.username) || UNSAFE_FOR_PROTOCOL.test(credential.secret)) {
    throw new Error("The Git host returned a credential Git cannot carry");
  }
  const dir = await mkdtemp(join(tmpdir(), "spex-git-credential-"));
  const file = join(dir, "credential");
  try {
    await writeFile(file, `username=${credential.username}\npassword=${credential.secret}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  let disposed = false;
  return {
    env: {
      [GIT_CREDENTIAL_FILE_ENV]: file,
      ...(runtime.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    configArgs: ["-c", "credential.helper=", "-c", `credential.helper=!"${runtime.execPath}" "${helperPath}"`],
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await rm(dir, { recursive: true, force: true });
    },
  };
}
