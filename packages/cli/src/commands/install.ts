// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex install`, or `spex i` (cli-4, environments-7): install what
// `spex.lock` records and place the skills for the agents and the specs
// in `specs/`, writing the lock first where it is missing or `spex.yaml`
// changed, and print each package installed with its version, where its
// spec stands — an edited copy left as the reader's — and where each of
// its skills went. A lock installing as it stands rewrites no file. The
// app's built-in package that no seed and no registry serves is named as
// the Spex app's to install.

import { isPathSource } from "../lib/environment/index.js";
import { Environment } from "./environment.js";
import { leftToAppLine, packageStates, settle, skillLines, specLines, versionOf } from "./settle.js";
import { parsed, Refusal, type Command } from "./run.js";

export const install: Command = async (args) => {
  parsed("install", args, {}, { min: 0, max: 0 });
  const env = new Environment();
  if (env.readRequests() === null) throw new Refusal(`no spex.yaml in ${env.root} — spex add <org>/<pkg>`);
  const settled = await settle(env, "install");
  if (settled === null) return;
  const { lock, install: report } = settled;
  const lines: string[] = [];
  if (settled.lockWritten) lines.push(settled.staleBefore === null ? "Wrote spex.lock" : `Updated spex.lock: ${settled.staleBefore.join("; ")}`);
  const names = Object.keys(lock.packages).sort();
  const states = packageStates(env.root, lock);
  for (const name of names) {
    const resolution = lock.packages[name]!;
    const version = versionOf(env.root, name, resolution);
    if (isPathSource(resolution.source)) {
      lines.push(report.missingPaths.includes(name) ? `Files missing for ${name} ${version}: no folder at ${resolution.source.path}` : `Using ${name} ${version} from folder ${resolution.source.path}`);
    } else if (report.left?.includes(name)) {
      lines.push(leftToAppLine(name, version));
      continue;
    } else {
      lines.push(report.installed.includes(name) ? `Installed ${name} ${version}` : `Already installed ${name} ${version}`);
    }
    lines.push(...specLines(settled.exported.specs, name), ...skillLines(env.root, lock, name, states.get(name)!));
  }
  if (names.length === 0) lines.push("Nothing added yet — spex add <org>/<pkg>");
  console.log(lines.join("\n"));
};
