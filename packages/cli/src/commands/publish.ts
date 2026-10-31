// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex publish [<org>/<pkg>] [--dry-run]` (cli-9, environments-10):
// publish a package's folder — the folder `spex.yaml` adds that name
// from, else `spex-packages/<org>/<pkg>/` under the root, and with no
// name the one package under `spex-packages/` — to this folder's
// registry as the account signed in there for publishing. The
// destination is printed as the registry's name (cli-22) with
// `<org>/<pkg>@<version>`; a dry run lists the declared files and
// uploads nothing; a publish prints the package's page at the registry.
// Every refusal comes before any upload.

import { readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  FormatError,
  isPackageName,
  isPathRequest,
  publishIssues,
  publishRelease,
  readRelease,
  type Manifest,
} from "../lib/environment/index.js";
import { Environment, isDirectory } from "./environment.js";
import { parsed, Refusal, type Command } from "./run.js";

/** Every package folder under `spex-packages/`: `<org>/<pkg>` names of
 * the folders two levels down holding `meta.yaml`. */
function developed(root: string): string[] {
  const out: string[] = [];
  const base = join(root, "spex-packages");
  const entries = (dir: string): string[] => {
    try { return readdirSync(dir).filter((entry) => !entry.startsWith(".") && isDirectory(join(dir, entry))).sort(); } catch { return []; }
  };
  for (const org of entries(base)) {
    for (const pkg of entries(join(base, org))) {
      if (isPackageName(`${org}/${pkg}`)) out.push(`${org}/${pkg}`);
    }
  }
  return out;
}

const issuesText = (issues: readonly { path?: string; message: string }[]): string =>
  issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)).join("; ");

export const publish: Command = async (args) => {
  const { values, positionals } = parsed("publish", args, { "dry-run": { type: "boolean" } }, { min: 0, max: 1 });
  const dryRun = values["dry-run"] === true;
  const env = new Environment();
  const read = env.readRequests();
  let name = positionals[0];
  if (name === undefined) {
    const found = developed(env.root);
    if (found.length === 0) throw new Refusal(`no package in spex-packages/ here — spex new <org>/<pkg> makes one`);
    if (found.length > 1) throw new Refusal(`spex-packages/ holds ${found.length} packages: ${found.join(", ")} — name one: spex publish <org>/<pkg>`);
    name = found[0]!;
  }
  if (!isPackageName(name)) throw new Refusal(`"${name}" is not a package name — use <org>/<pkg>, like acme/tool`);

  // The folder: the one spex.yaml adds that name from, else
  // spex-packages/<org>/<pkg>/ under the root (environments-10).
  const request = read?.requests.packages[name];
  const path = request !== undefined && isPathRequest(request) ? request.path : `spex-packages/${name}`;
  const folder = resolve(env.root, path);
  const inside = relative(env.root, folder);
  if (inside === "" || isAbsolute(inside) || inside.split(sep).includes("..")) throw new Refusal(`${path} lies outside this project folder, ${env.root} — keep the package inside it`);
  if (!isDirectory(folder)) throw new Refusal(`${name} has no folder here: ${path} is not there — spex new ${name} makes one`);

  // The destination: this folder's registry, as the account signed in
  // there for publishing (environments-10, DR-168), named by its own
  // display name, never a Space entry's (cli-22).
  const target = env.registryOf(read?.requests ?? null);
  const instance = target.origin;
  const destination = await env.registryName(instance);
  if (!dryRun && (await env.tokenAt(instance, "registry").catch(() => "")) === null) {
    // `spex login` from this folder signs in at its registry for
    // publishing (cli-10).
    throw new Refusal(`not signed in at ${destination} to publish — spex login, then retry`);
  }
  let manifest: Manifest;
  let files: string[];
  try {
    const release = await readRelease(folder);
    manifest = release.manifest;
    files = release.files.map((file) => file.path).sort();
  } catch (error) {
    if (error instanceof FormatError) throw new Refusal(`${path} is not a package: ${issuesText(error.issues)} — fix it, then retry`);
    throw new Refusal(error instanceof Error ? error.message : String(error));
  }
  const held = `${manifest.org}/${manifest.name}`;
  if (held !== name) throw new Refusal(`${path} holds ${held}, not ${name} — fix the name in its meta.yaml, or publish ${held}`);
  const missing = publishIssues(manifest);
  if (missing.length > 0) throw new Refusal(`${path} cannot be published: ${issuesText(missing)} — add it to its meta.yaml`);

  console.log(`Destination: ${destination}, ${held}@${manifest.version}`);
  if (dryRun) {
    console.log(["Files (dry run, nothing uploaded):", ...files.map((file) => `  ${file}`)].join("\n"));
    return;
  }
  const registry = env.registryAt(instance, "registry");
  try {
    await publishRelease(registry, folder);
  } catch (error) {
    throw await env.registryRefusal(error, { origin: instance, scope: "registry", operation: "publish", version: manifest.version });
  }
  // The package's page at the registry.
  console.log(`Published: ${registry.url}/${held}`);
};

