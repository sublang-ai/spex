// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex publish [<org>/<pkg>] [--dry-run]` (cli-9, environments-10):
// publish a package's folder — the folder of the environment's path
// request for that name, else `spex-packages/<org>/<pkg>/` under the
// root, and with no name the one package under `spex-packages/` — to
// the environment's registry as the account signed in at its instance.
// The destination is printed as the instance's name with
// `<org>/<pkg>@<version>`; a dry run lists the declared files and
// uploads nothing. Every refusal comes before any upload.

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
import { Environment, isDirectory, registryCause } from "./environment.js";
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
  const { values, positionals } = parsed("publish", args, { "dry-run": { type: "boolean" } }, { min: 0, max: 1, usage: "[<org>/<pkg>] [--dry-run]" });
  const dryRun = values["dry-run"] === true;
  const env = new Environment();
  const read = env.readRequests();
  let name = positionals[0];
  if (name === undefined) {
    const found = developed(env.root);
    if (found.length === 0) throw new Refusal(`spex-packages/ in ${env.root} holds no package; spex new <org>/<pkg> makes one`);
    if (found.length > 1) throw new Refusal(`spex-packages/ holds ${found.length} packages: ${found.join(", ")}; name one: spex publish <org>/<pkg>`);
    name = found[0]!;
  }
  if (!isPackageName(name)) throw new Refusal(`"${name}" is not a <org>/<pkg> name`);

  // The folder: the environment's request by path for that name, else
  // spex-packages/<org>/<pkg>/ under the root (environments-10).
  const request = read?.requests.packages[name];
  const path = request !== undefined && isPathRequest(request) ? request.path : `spex-packages/${name}`;
  const folder = resolve(env.root, path);
  const inside = relative(env.root, folder);
  if (inside === "" || isAbsolute(inside) || inside.split(sep).includes("..")) throw new Refusal(`${path} is outside ${env.root}`);
  if (!isDirectory(folder)) throw new Refusal(`no folder holds ${name}: ${path} is not there`);

  // The destination: the registry of the environment's instance, as the
  // account signed in there (environments-10, DR-127).
  const instance = env.instanceOf(read?.requests ?? null);
  const destination = env.nameOf(instance);
  if (!dryRun && (await env.tokenAt(instance).catch(() => "")) === null) {
    const space = instance === env.defaultOrigin() ? "" : ` --space ${instance}`;
    throw new Refusal(`not signed in at ${destination}; spex login${space} signs in to publish there`);
  }
  let manifest: Manifest;
  let files: string[];
  try {
    const release = await readRelease(folder);
    manifest = release.manifest;
    files = release.files.map((file) => file.path).sort();
  } catch (error) {
    if (error instanceof FormatError) throw new Refusal(`${path} is not a spec package release: ${issuesText(error.issues)}`);
    throw new Refusal(error instanceof Error ? error.message : String(error));
  }
  const held = `${manifest.org}/${manifest.name}`;
  if (held !== name) throw new Refusal(`${path} holds ${held}, not ${name}`);
  const missing = publishIssues(manifest);
  if (missing.length > 0) throw new Refusal(`${path} cannot be published: ${issuesText(missing)}`);

  console.log(`Destination: ${destination}, ${held}@${manifest.version}`);
  if (dryRun) {
    console.log(["Files (dry run, nothing uploaded):", ...files.map((file) => `  ${file}`)].join("\n"));
    return;
  }
  const registry = env.registryAt(instance);
  try {
    await publishRelease(registry, folder);
  } catch (error) {
    throw new Refusal(`not published at ${destination}: ${registryCause(error)}`);
  }
  // The package's page at the instance, as the app names it.
  console.log(`Published: ${registry.url}/${held}`);
};

