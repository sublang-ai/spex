// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex update` (cli-5, environments-5): resolve again from `spex.yaml`,
// install and export, and print each spec package whose version moved,
// with both versions, or that nothing moved.

import { Environment } from "./environment.js";
import { changeLine, leftOutLines, leftToAppLines, lockChanges, settle } from "./settle.js";
import { parsed, Refusal, type Command } from "./run.js";

export const update: Command = async (args) => {
  parsed("update", args, {}, { min: 0, max: 0, usage: "" });
  const env = new Environment();
  if (env.readRequests() === null) throw new Refusal(`${env.root} holds no spex.yaml; spex add <org>/<pkg> makes one`);
  const settled = await settle(env, "resolve");
  if (settled === null) return;
  // Each version moved, both named; a source changed at one version is
  // no move of version (cli-5).
  const lines = lockChanges(env.root, settled.before, settled.lock)
    .filter((change) => change.from !== change.to)
    .map((change) => changeLine({ name: change.name, from: change.from, to: change.to }));
  if (lines.length === 0) lines.push("Nothing moved.");
  lines.push(...leftToAppLines(env.root, settled), ...leftOutLines(settled.exported));
  console.log(lines.join("\n"));
};
