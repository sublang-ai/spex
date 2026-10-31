// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex search <query>` (cli-7, environments-12): ask the environment's
// registry, presenting its instance's app token as resolving does, for
// the spec packages matching the query, and print each with its
// description and versions, newest first.

import { compareVersions, isVersion } from "../lib/environment/index.js";
import { Environment, registryCause } from "./environment.js";
import { parsed, Refusal, type Command } from "./run.js";

export const search: Command = async (args) => {
  const { positionals } = parsed("search", args, {}, { min: 1, max: Infinity, usage: "<query>" });
  const query = positionals.join(" ");
  const env = new Environment();
  const target = env.registryOf(env.readRequests()?.requests ?? null);
  const instance = target.origin;
  let found;
  try {
    found = await env.registryAt(instance, target.scope).search(query);
  } catch (error) {
    throw new Refusal(registryCause(error));
  }
  if (found.length === 0) {
    console.log(`Nothing at ${env.nameOf(instance)} matches "${query}".`);
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
