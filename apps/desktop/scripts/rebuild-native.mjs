#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Flip native-module ABI between Electron and system Node
// (app-shell-26). better-sqlite3 is installed once for the workspace,
// so running the app and running core tests need different builds:
//
//   node scripts/rebuild-native.mjs electron   # before electron .
//   node scripts/rebuild-native.mjs node       # before npm test
//
// On macOS gyp links the module's static library by calling a bare
// `libtool -static`, which only Apple's libtool understands, so a GNU
// libtool leading the contributor's PATH (Homebrew's `libtool`
// formula) breaks the build. Each rebuild therefore runs with a shim
// directory first on PATH holding one link to the libtool that
// `xcrun --find libtool` names (app-shell-31).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (target !== "electron" && target !== "node") {
  console.error("usage: rebuild-native.mjs <electron|node>");
  process.exit(2);
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(appDir, "..", "..");
const require = createRequire(import.meta.url);

function appleLibtool() {
  try {
    return execFileSync("xcrun", ["--find", "libtool"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

// The environment a rebuild runs with: on macOS, PATH led by a shim
// directory whose only entry is Apple's libtool, the rest untouched.
// Without a PATH nothing can precede Apple's, and without xcrun there
// is no Apple libtool to name, so both cases leave the environment as
// the contributor set it.
function toolchainEnvironment(env) {
  const untouched = { env, release: () => {} };
  if (process.platform !== "darwin" || !env.PATH) return untouched;
  const libtool = appleLibtool();
  if (!libtool) return untouched;
  const shim = mkdtempSync(join(tmpdir(), "spex-apple-libtool-"));
  try {
    symlinkSync(libtool, join(shim, "libtool"));
  } catch (error) {
    rmSync(shim, { recursive: true, force: true });
    throw error;
  }
  return {
    env: { ...env, PATH: `${shim}${delimiter}${env.PATH}` },
    release: () => rmSync(shim, { recursive: true, force: true }),
  };
}

const toolchain = toolchainEnvironment(process.env);
try {
  if (target === "electron") {
    const electronVersion = require(
      resolve(root, "node_modules", "electron", "package.json"),
    ).version;
    const { rebuild } = await import("@electron/rebuild");
    console.log(`[rebuild-native] rebuilding better-sqlite3 (Electron ABI)`);
    // @electron/rebuild forks node-gyp from this process's environment.
    if (toolchain.env !== process.env) process.env.PATH = toolchain.env.PATH;
    await rebuild({
      buildPath: appDir,
      projectRootPath: root,
      electronVersion,
      extraModules: ["better-sqlite3"],
      onlyModules: ["better-sqlite3"],
      force: true,
      buildFromSource: true,
    });
  } else {
    const env = { ...toolchain.env };
    for (const key of [
      "npm_config_build_from_source",
      "npm_config_runtime",
      "npm_config_target",
      "npm_config_dist_url",
    ]) {
      delete env[key];
    }
    console.log(`[rebuild-native] npm rebuild better-sqlite3 (Node ABI)`);
    execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["rebuild", "better-sqlite3"],
      { cwd: root, stdio: "inherit", env },
    );
  }
} finally {
  toolchain.release();
}
