// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex install`, or `spex i` (cli-4, environments-7): install the lock
// and export, resolving first where the lock is missing or stale, and
// print each spec package installed with its version, each export
// written and what the export left out. A lock installing as it stands
// resolves nothing and rewrites no file.

import { isPathSource } from "../lib/environment/index.js";
import { Environment } from "./environment.js";
import { exportsOf, leftOutLines, settle, versionOf } from "./settle.js";
import { parsed, Refusal, type Command } from "./run.js";

export const install: Command = async (args) => {
  parsed("install", args, {}, { min: 0, max: 0, usage: "" });
  const env = new Environment();
  if (env.readRequests() === null) throw new Refusal(`${env.root} holds no spex.yaml; spex add <org>/<pkg> makes one`);
  const settled = await settle(env, "install");
  if (settled === null) return;
  const { lock, install: report } = settled;
  const lines: string[] = [];
  if (settled.lockWritten) lines.push(settled.before === null ? "Resolved spex.lock." : "Resolved spex.lock again: it was stale.");
  const names = Object.keys(lock.packages).sort();
  for (const name of names) {
    const resolution = lock.packages[name]!;
    const version = versionOf(env.root, name, resolution);
    if (isPathSource(resolution.source)) {
      lines.push(report.missingPaths.includes(name) ? `Missing ${name} ${version}: no folder at ${resolution.source.path}` : `In place ${name} ${version} at ${resolution.source.path}`);
    } else {
      lines.push(report.installed.includes(name) ? `Installed ${name} ${version}` : `Up to date ${name} ${version}`);
    }
  }
  if (names.length === 0) lines.push("Nothing requested.");
  for (const name of names) {
    for (const [skill, folders] of exportsOf(env.root, lock.packages[name]!)) {
      if (folders.length > 0) lines.push(`Exported ${skill} to ${folders.join(", ")}`);
    }
  }
  lines.push(...leftOutLines(settled.exported));
  console.log(lines.join("\n"));
};
