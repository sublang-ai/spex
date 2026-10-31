// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex update` (cli-5, environments-5): pick again the newest versions
// `spex.yaml` allows, install and place the skills, and print each
// package whose version changed, with both versions, or that everything
// is up to date. A `spex.lock` that does not read is written anew.

import { Environment } from "./environment.js";
import { changeLine, leftToAppLines, lockChanges, missingPathLines, settle } from "./settle.js";
import { parsed, Refusal, type Command } from "./run.js";

export const update: Command = async (args) => {
  parsed("update", args, {}, { min: 0, max: 0 });
  const env = new Environment();
  const read = env.readRequests();
  if (read === null) throw new Refusal(`no spex.yaml in ${env.root} — spex add <org>/<pkg>`);
  const settled = await settle(env, "resolve");
  if (settled === null) return;
  // Each version changed, both named; a source changed at one version is
  // no change of version (cli-5).
  const added = new Set(Object.keys(read.requests.packages));
  const lines = lockChanges(env.root, settled.before, settled.lock)
    .filter((change) => change.from !== change.to)
    .map((change) => changeLine({ name: change.name, from: change.from, to: change.to }, settled.lock, added));
  if (settled.before === null && settled.lockWritten) lines.unshift("Wrote spex.lock");
  else if (lines.length === 0) lines.push("Up to date");
  lines.push(...missingPathLines(settled), ...leftToAppLines(env.root, settled));
  console.log(lines.join("\n"));
};
