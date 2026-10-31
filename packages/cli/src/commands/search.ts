// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex search <query>` (cli-7, environments-12): ask this folder's
// registry, presenting its sign-in as resolving does, for the packages
// matching the query, and print each with its description and versions,
// newest first.

import { compareVersions, isVersion } from "../lib/environment/index.js";
import { Environment } from "./environment.js";
import { parsed, type Command } from "./run.js";

export const search: Command = async (args) => {
  const { positionals } = parsed("search", args, {}, { min: 1, max: Infinity });
  const query = positionals.join(" ");
  const env = new Environment();
  const target = env.registryOf(env.readRequests()?.requests ?? null);
  let found;
  try {
    found = await env.registryAt(target.origin, target.scope).search(query);
  } catch (error) {
    throw await env.registryRefusal(error, { origin: target.origin, scope: target.scope });
  }
  if (found.length === 0) {
    console.log(`No package at ${await env.registryName(target.origin)} matches "${query}"`);
    return;
  }
  const lines: string[] = [];
  for (const result of found) {
    const versions = result.versions.filter(isVersion).sort((a, b) => compareVersions(b, a));
    lines.push(result.description ? `${result.name}  ${result.description}` : result.name);
    lines.push(`  ${versions.length > 0 ? versions.join(", ") : "no versions listed"}`);
  }
  console.log(lines.join("\n"));
};
