// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What the desktop starts its embedded core with (app-shell-15,
// app-shell-29, app-shell-33): the shared state root with the legacy
// userData store beside it for the one-time import, the operating
// system's languages, this Electron run as Node as the runtime of the
// compiler, the scaffold CLI and the Git credential helper, and the
// browser sign-in flow — this device's browser is the reader's.

import { join } from "node:path";
import {
  moduleDirectoriesAbove,
  suppliedScaffold,
  type CoreServiceOptions,
} from "@sublang/spex-core";

export interface DesktopCoreInput {
  /** The shared state root (DR-036), or the smoke's redirected one. */
  dataDir: string;
  /** Electron's userData directory, where an earlier release left its
   * SQLite store. */
  userData: string;
  /** The operating system's preferred languages. */
  systemLanguages: readonly string[];
  /** This Electron binary. */
  execPath: string;
  /** The shell's own module, whose module directories hold the
   * compiler, the scaffold CLI and the agent SDKs it declares. */
  moduleUrl: string;
}

export function desktopCoreOptions(input: DesktopCoreInput): CoreServiceOptions {
  const runtime = {
    execPath: input.execPath,
    electron: true,
    modulePaths: moduleDirectoriesAbove(input.moduleUrl),
  };
  return {
    dataDir: input.dataDir,
    legacyDbPath: join(input.userData, "spex.db"),
    port: 0,
    // The shell's OS is the reader's device, so the core it embeds
    // resolves the reader's system exactly as the shell does
    // (app-shell-29, core-service-111).
    systemLanguages: input.systemLanguages,
    // Compiles run on this Electron as Node, with the compiler and the
    // SDKs this package declares (app-shell-33, DR-081).
    compileRuntime: runtime,
    // The scaffold runs the checkout's own CLI on this Electron as Node
    // too (app-shell-33, projects-31); with none built, the create flow
    // falls back to the registry's and names it.
    ...(suppliedScaffold(runtime) ?? {}),
    // Sign-in opens the host's page in this device's browser, which
    // returns to the core's loopback listener (app-shell-15,
    // git-host-2); Git's credential helper runs on this Electron as
    // Node, so a clone, fetch or push needs no Node beyond the app's
    // (git-host-9).
    signIn: "browser",
    hostRuntime: { execPath: input.execPath, electron: true },
  };
}
