// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex list`, or `spex ls` (cli-6, environments-14): the environment as
// its files stand, asking no registry — its instance; each request with
// its source and requirement; each locked spec package with its
// version, source, who required it and whether its files stand as the
// lock records them; each exported skill with its folders; what the last
// export left out; and that the lock is missing or stale, where it is.

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { BUILTIN_PACKAGE_NAME, installedDir, installedPackages, isGitRequest, isPathRequest, packageRoot, parseManifestText, type Lock, type Request } from "../lib/environment/index.js";
import { Environment } from "./environment.js";
import { exportedIn, exportsOf, gitLocators, gitShown, installedState, projectFolders, sourceLabel, staleReasons, unnamedText, versionOf } from "./settle.js";
import { parsed, type Command } from "./run.js";

function requestLabel(request: Request): string {
  if (isPathRequest(request)) return `path ${request.path}`;
  if (isGitRequest(request)) return `git ${gitShown(request.git)} at ${request.rev}${request.path ? ` (${request.path})` : ""}`;
  return request.version;
}

/** Rows aligned in columns, two spaces apart. */
function table(rows: string[][]): string[] {
  const widths = rows.reduce<number[]>((out, row) => row.map((cell, at) => Math.max(out[at] ?? 0, cell.length)), []);
  return rows.map((row) => `  ${row.map((cell, at) => (at === row.length - 1 ? cell : cell.padEnd(widths[at]!))).join("  ")}`.trimEnd());
}

function standing(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

/** What the last export left out, read from the files: each exported
 * skill a folder of the reader's keeps out of an agent folder, and each
 * spec package whose files are not here (environments-8). */
function leftOut(env: Environment, lock: Lock, installed: Set<string>): string[] {
  const lines: string[] = [];
  const folders = projectFolders().map((entry) => ({ ...entry, skills: new Set(exportedIn(env.root, entry.folder)) }));
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    if (Object.keys(resolution.exports).length === 0) continue;
    const state = installedState(env.root, lock, name, installed);
    const root = packageRoot(name, resolution, installedDir(env.root), env.root);
    if (state === "missing" || state === "not installed" || root === null || !existsSync(join(root, "meta.yaml"))) {
      // The app's built-in is the app's to install (environments-7, cli-4).
      lines.push(name === BUILTIN_PACKAGE_NAME ? `  ${name}: left to the app, which installs its built-in package at its next use` : `  ${name}: its files are not here`);
      continue;
    }
    const manifest = parseManifestText(readFileSync(join(root, "meta.yaml"), "utf8")).manifest;
    for (const skill of Object.keys(resolution.exports).sort()) {
      const playbook = manifest?.artifacts[resolution.exports[skill]!]?.kind === "playbook";
      for (const folder of folders) {
        if (playbook && !folder.playbooks) continue;
        if (!folder.skills.has(skill) && standing(join(env.root, ...folder.folder.split("/"), skill))) {
          lines.push(`  ${skill} from ${folder.folder}: a folder of yours stands there`);
        }
      }
    }
  }
  return lines;
}

export const list: Command = async (args) => {
  parsed("list", args, {}, { min: 0, max: 0, usage: "" });
  const env = new Environment();
  const read = env.readRequests();
  const locked = env.readLock();
  const lines = [`Space: ${env.nameOf(env.instanceOf(read?.requests ?? null))}`, `Root: ${env.root}`];
  if (read === null && locked === null) {
    lines.push("No spex.yaml here; spex add <org>/<pkg> makes one.");
    console.log(lines.join("\n"));
    return;
  }
  const requests = Object.entries(read?.requests.packages ?? {}).sort(([a], [b]) => a.localeCompare(b));
  lines.push("Requests:");
  if (read === null) lines.push("  none: spex.yaml is missing");
  else if (requests.length === 0) lines.push("  none");
  else lines.push(...table(requests.map(([name, request]) => [name, requestLabel(request)])));

  if (locked === null) {
    lines.push("Lock: missing; spex install resolves it");
    console.log(lines.join("\n"));
    return;
  }
  const { lock } = locked;
  const installed = installedPackages(env.root, lock);
  const names = Object.keys(lock.packages).sort();
  lines.push("Locked:");
  if (names.length === 0) lines.push("  none");
  else {
    lines.push(...table(names.map((name) => {
      const resolution = lock.packages[name]!;
      const requested = read !== null && Object.hasOwn(read.requests.packages, name);
      const by = [...(requested ? ["requested"] : []), ...(resolution.requiredBy.length > 0 ? [`required by ${resolution.requiredBy.join(", ")}`] : [])];
      return [name, versionOf(env.root, name, resolution), sourceLabel(resolution), by.join(", ") || "required by nothing", installedState(env.root, lock, name, installed)];
    })));
  }
  const skills: string[][] = [];
  for (const name of names) {
    for (const [skill, folders] of exportsOf(env.root, lock.packages[name]!)) {
      skills.push([skill, folders.length > 0 ? folders.map((folder) => folder.replace(/\/[^/]+\/$/, "")).join(", ") : "not exported"]);
    }
  }
  lines.push("Skills:");
  lines.push(...(skills.length > 0 ? table(skills) : ["  none"]));
  const out = leftOut(env, lock, installed);
  lines.push(out.length > 0 ? "Left out:" : "Left out: nothing", ...out);
  const stale = staleReasons(env.root, lock, read?.text ?? null);
  if (stale !== null) lines.push(unnamedText(`Lock: stale (${stale.join("; ")}); spex install resolves it again`, gitLocators(read?.requests ?? null, lock)));
  console.log(lines.join("\n"));
};
