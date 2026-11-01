// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex add <org>/<pkg>[@<version>]` and `spex add <org>/<pkg> --path
// <folder>` (cli-2, environments-15): write the package into
// `spex.yaml` — made explicitly naming the public registry where the
// root holds none — then resolve, install and export, printing each
// package added or updated and where its skills went for the agents.
// Every refusal comes before any write: a folder given by `--path` holds
// the package named, its `meta.yaml` read, before `spex.yaml` is written.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  compareVersions,
  editRequests,
  isPackageName,
  isVersion,
  KNOWN_FORMAT,
  packageNameRefusal,
  parseManifestText,
  parseVersion,
  requestIssues,
  RequestsError,
  setRequest,
  setRegistryIn,
  PUBLIC_REGISTRY_ORIGIN,
  type Request,
} from "../lib/environment/index.js";
import { VersionConflictError } from "../lib/files.js";
import { actualPath, Environment, shown } from "./environment.js";
import { gainedLines, leftToAppLines, missingPathLines, settle } from "./settle.js";
import { parsed, Refusal, type Command } from "./run.js";

/** A refusal of `spex.yaml`'s edit in the CLI's words. */
function editRefusal(env: Environment, error: unknown): Refusal | null {
  if (error instanceof VersionConflictError) return new Refusal(`${shown(env.root, error.file)} changed meanwhile — retry`);
  if (error instanceof RequestsError) return new Refusal(`${error.message} — fix the file, then retry`);
  return null;
}

/** Write one package into the environment's `spex.yaml`
 * (environments-15): a file made new explicitly names the public
 * registry (environments-2); comments and key order stay; a file changed
 * meanwhile is refused. */
export async function writeRequest(env: Environment, name: string, request: Request, made: boolean): Promise<void> {
  try {
    if (made) {
      await editRequests(env.requestsFile, (doc) => {
        setRegistryIn(doc, PUBLIC_REGISTRY_ORIGIN);
        doc.setIn(["packages", name], doc.createNode(request));
      });
      console.log(`Made spex.yaml in ${env.root}`);
    } else {
      await setRequest(env.requestsFile, name, request);
    }
  } catch (error) {
    throw editRefusal(env, error) ?? error;
  }
}

/** Resolve, install and export, then say what was added, updated or
 * removed, with where each package's skills went. */
export async function settleAndTell(env: Environment, quiet = "Nothing changed."): Promise<void> {
  const settled = await settle(env, "resolve");
  if (settled === null) return;
  const added = new Set(Object.keys(env.readRequests()?.requests.packages ?? {}));
  const lines = [...gainedLines(env.root, settled, added), ...missingPathLines(settled), ...leftToAppLines(env.root, settled)];
  console.log(lines.length > 0 ? lines.join("\n") : quiet);
}

/** Why a folder given by `--path` holds no package of `name`, or
 * nothing: no folder there, no `meta.yaml`, one that cannot be read, or
 * another package's (cli-2). */
function folderRefusal(root: string, path: string, given: string, name: string): void {
  const dir = join(root, ...path.split("/"));
  if (!existsSync(dir)) throw new Refusal(`--path ${given}: no folder there — give the folder holding the package's meta.yaml`);
  const file = join(dir, "meta.yaml");
  if (!existsSync(file)) throw new Refusal(`--path ${given} has no meta.yaml, so it is no package — spex export ${name} --spec <file> | --skill <folder> builds one`);
  const { manifest, issues } = parseManifestText(readFileSync(file, "utf8"));
  if (!manifest) throw new Refusal(`--path ${given}: its meta.yaml cannot be read: ${issues.map((issue) => issue.message).join("; ")} — fix it, then retry`);
  const found = `${manifest.org}/${manifest.name}`;
  if (found !== name) throw new Refusal(`--path ${given} holds ${found}, not ${name} — spex add ${found} --path ${given}`);
}

/** The newest listed version that is no prerelease and is neither yanked
 * nor suppressed. */
function newestRelease(versions: { version: string; format: number; yanked: boolean; suppressed: boolean }[]): string | undefined {
  return versions
    .filter((entry) => entry.format === KNOWN_FORMAT && isVersion(entry.version) && !entry.yanked && !entry.suppressed && parseVersion(entry.version).prerelease.length === 0)
    .map((entry) => entry.version)
    .sort((a, b) => compareVersions(b, a))[0];
}

export const add: Command = async (args) => {
  const { values, positionals } = parsed("add", args, { path: { type: "string" } }, { min: 1, max: 1 });
  const spec = positionals[0]!;
  const at = spec.indexOf("@");
  const name = at < 0 ? spec : spec.slice(0, at);
  const version = at < 0 ? undefined : spec.slice(at + 1);
  if (!isPackageName(name)) throw new Refusal(packageNameRefusal(name));
  if (version !== undefined && values.path !== undefined) throw new Refusal("a version and --path together — give one");

  const env = new Environment();
  const read = env.readRequests();
  let request: Request;
  if (values.path !== undefined) {
    // The folder as given from here, recorded relative to the root.
    // The two compare as text where spelled alike, else as the file
    // system spells them, so a short name and its long one are one.
    const out = (path: string): boolean => path === "" || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`);
    let inside = relative(env.root, resolve(values.path));
    if (out(inside)) inside = relative(actualPath(env.root), actualPath(resolve(values.path)));
    if (out(inside)) throw new Refusal(`--path ${values.path} leads out of this project folder, ${env.root} — use a folder inside it`);
    request = { path: inside.split(sep).join("/") };
    folderRefusal(env.root, request.path, values.path, name);
  } else {
    if (version !== undefined) {
      const malformed = requestIssues(name, { version });
      if (malformed.length > 0) throw new Refusal(malformed.map((issue) => issue.message).join("; "));
    }
    const target = env.registryOf(read?.requests ?? null);
    let versions;
    try {
      versions = (await env.registryAt(target.origin, target.scope).index(name)).versions;
    } catch (error) {
      throw await env.registryRefusal(error, { origin: target.origin, scope: target.scope });
    }
    if (version !== undefined) {
      request = { version };
    } else {
      const newest = newestRelease(versions);
      if (newest === undefined) throw new Refusal(`${name} has no released version at ${await env.registryName(target.origin)} — name one: spex add ${name}@<version>`);
      request = { version: `^${newest}` };
    }
  }
  const issues = requestIssues(name, request);
  if (issues.length > 0) throw new Refusal(issues.map((issue) => issue.message).join("; "));
  await writeRequest(env, name, request, read === null);
  await settleAndTell(env);
};
