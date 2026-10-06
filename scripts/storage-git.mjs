#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The storage Git tool (storage-10): the stopped-core path over one
// spex repository's clone, selected by its key.
//
//   node scripts/storage-git.mjs [--home path] --repository <key> plan <ours> <theirs>
//   node scripts/storage-git.mjs [--home path] --repository <key> select [unit=ours|theirs ...]
//   node scripts/storage-git.mjs [--home path] --repository <key> validate
//   node scripts/storage-git.mjs [--home path] --repository <key> rebind <key> <path> [--alias path ...]

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Home, isRepositoryKey } from "../packages/core/dist/home.js";
import { Store } from "../packages/core/dist/store.js";
import { isWorkTreeRoot } from "../packages/core/dist/forge.js";
import { planStorageMerge, reserveStorageHome, selectStorageMerge, validateStorageTree } from "../packages/core/dist/storage-git.js";

const USAGE = "Usage: node scripts/storage-git.mjs [--home path] --repository <key> plan <ours> <theirs> | select [unit=ours|theirs ...] | validate | rebind <key> <path> [--alias recorded-path ...]";

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const [, value] = args.splice(at, 2);
  if (!value) throw new Error(`${name} requires a value`);
  return value;
};
try {
  const home = resolve(option("--home") ?? (process.env.SPEX_HOME?.trim() ? process.env.SPEX_HOME : join(homedir(), ".spex")));
  const repository = option("--repository");
  if (!repository) throw new Error(`--repository requires a spex repository's key\n${USAGE}`);
  const loaded = Home.load(home);
  const dir = loaded.clonePath(repository);
  if (!isRepositoryKey(repository) || !existsSync(dir)) throw new Error(`no spex repository ${repository} in ${home}`);
  const operation = args.shift();
  if (operation === "plan" && args.length === 2) console.log(JSON.stringify(planStorageMerge(dir, args[0], args[1]), null, 2));
  else if (operation === "select") {
    const choices = {};
    for (const item of args) {
      const split = item.lastIndexOf("="); const name = item.slice(0, split); const side = item.slice(split + 1);
      if (split < 1 || !["ours", "theirs"].includes(side) || Object.hasOwn(choices, name)) throw new Error(`invalid choice ${item}; use unit=ours or unit=theirs once per unit`);
      choices[name] = side;
    }
    console.log(JSON.stringify(await selectStorageMerge(home, repository, choices), null, 2));
  } else if (operation === "validate" && args.length === 0) {
    const release = reserveStorageHome(home);
    try {
      console.log(JSON.stringify(await validateStorageTree(dir, { own: repository === loaded.own(), libraryDir: join(home, "playbooks") }), null, 2));
    } finally { release(); }
  } else if (operation === "rebind" && args.length >= 2) {
    const key = args.shift(); const path = resolve(args.shift().replace(/^~(?=\/|$)/, homedir()));
    let aliases;
    while (args.length) {
      const flag = args.shift(); const value = args.shift();
      if (!value || flag !== "--alias") throw new Error("rebind accepts --alias <recorded-path>");
      (aliases ??= []).push(value);
    }
    if (!(await isWorkTreeRoot(path))) throw new Error(`${path} is not the root of a Git work tree`);
    const store = await Store.open({ dir: home });
    try {
      const project = store.rebindProject({ id: key, path, ...(aliases ? { aliases } : {}) });
      await store.initializeSessions();
      console.log(JSON.stringify({ project, diagnostics: [...store.validateStorage(), ...store.sessionDiagnostics()] }, null, 2));
    } finally { store.close(); }
  } else throw new Error(USAGE);
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
