// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex list`, or `spex ls` (cli-6, environments-14): the packages of
// this folder as its files stand, in a project's Packages tab's words
// (DR-172) — the folder and its registry by name; each package added,
// with its version or folder; each package installed, with its version,
// where it comes from, the packages it came for and whether its files
// stand, beneath one providing a spec where that spec stands in
// `specs/` and the packages its links wait for, read from the install
// record and the files with no placement run (environments-41); each
// skill with the agent folders it is placed in; and, where `spex.lock`
// is missing or stale, or a package is not installed, the command to
// run: `spex update` for a stale lock, as the Packages tab's chip offers
// Update, else `spex install`.

import { BUILTIN_PACKAGE_NAME, isGitRequest, isPathRequest, isPathSource, readSpecPlacements, type Request } from "../lib/environment/index.js";
import { Environment } from "./environment.js";
import { gitLabel, gitLocators, packageStates, placeText, skillPlaces, sourceLabel, specLines, staleReasons, table, unnamedText, versionOf } from "./settle.js";
import { parsed, type Command } from "./run.js";

/** A package as `spex.yaml` adds it: its version, its folder, or its Git
 * repository at a branch, tag or commit. */
function addedLabel(request: Request): string {
  if (isPathRequest(request)) return `folder ${request.path}`;
  if (isGitRequest(request)) return `${gitLabel(request.git)} at ${request.rev}${request.path ? `, folder ${request.path}` : ""}`;
  return request.version;
}

/** The last line of a stale lock: what changed, and what to do — a
 * folder package's `meta.yaml` that cannot be read fixed first. */
function staleLine(reasons: string[]): string {
  if (reasons.includes("spex.yaml is missing")) return "spex.yaml is missing — spex add <org>/<pkg>";
  const unreadable = reasons.map((reason) => / changed in (.+): its meta\.yaml cannot be read: /.exec(reason)?.[1]).filter((path) => path !== undefined);
  if (unreadable.length > 0) return `${reasons.join("; ")} — fix ${unreadable.map((path) => `${path}/meta.yaml`).join(", ")}, then spex update`;
  return `${reasons.join("; ")} — spex update`;
}

export const list: Command = async (args) => {
  parsed("list", args, {}, { min: 0, max: 0 });
  const env = new Environment();
  const read = env.readRequests();
  const locked = env.readLock();
  if (read === null && locked === null) {
    console.log(`No packages in ${env.root} yet — spex add <org>/<pkg>`);
    return;
  }
  const registry = await env.registryName(env.registryOf(read?.requests ?? null).origin);
  const lines = [`Folder    ${env.root}`, `Registry  ${registry}`];
  const locators = gitLocators(read?.requests ?? null, locked?.lock ?? null);

  const added = Object.entries(read?.requests.packages ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (added.length > 0) lines.push("Added", ...table(added.map(([name, request]) => [name, addedLabel(request)])));
  else if (read !== null) lines.push("Nothing added yet — spex add <org>/<pkg>");

  if (locked === null) {
    if (added.length > 0) lines.push("Not installed yet — spex install");
    console.log(lines.join("\n"));
    return;
  }
  const { lock } = locked;
  const names = Object.keys(lock.packages).sort();
  const states = packageStates(env.root, lock);
  if (names.length > 0) {
    const rows = table(names.map((name) => {
      const resolution = lock.packages[name]!;
      const requiredBy = resolution.requiredBy.length > 0 ? `for ${resolution.requiredBy.join(", ")}` : "";
      return [name, versionOf(env.root, name, resolution), sourceLabel(name, resolution), requiredBy, states.get(name)!];
    }));
    const specs = readSpecPlacements(env.root, lock);
    lines.push("Installed", ...names.flatMap((name, at) => [rows[at]!, ...specLines(specs, name, "    ")]));
  }
  const skills = names.flatMap((name) => skillPlaces(env.root, lock, name, states.get(name)!).map((place) => [place.skill, placeText(place)]));
  if (skills.length > 0) lines.push("Skills for agents", ...table(skills));
  const stale = staleReasons(env.root, lock, read?.text ?? null);
  if (stale !== null) lines.push(staleLine(stale));
  // A lock that stands with files an install places not in place, as
  // after a clone; the built-in waits for the Spex app (cli-4), and a
  // folder package's files are its folder's.
  else if (names.some((name) => name !== BUILTIN_PACKAGE_NAME && !isPathSource(lock.packages[name]!.source) && states.get(name) !== "installed")) lines.push("Not installed yet — spex install");
  console.log(unnamedText(lines.join("\n"), locators));
};
