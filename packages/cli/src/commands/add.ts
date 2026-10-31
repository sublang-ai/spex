// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex add <org>/<pkg>[@<requirement>]` and `spex add <org>/<pkg>
// --path <folder>` (cli-2, environments-15): write the request into
// `spex.yaml` — made explicitly naming the public registry where
// the root holds none — then resolve, install and export, printing each
// spec package the lock gained or moved and where its exports went.
// Every refusal comes before any write.

import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  compareVersions,
  editRequests,
  isPackageName,
  isVersion,
  KNOWN_FORMAT,
  parseVersion,
  RegistryError,
  requestIssues,
  RequestsError,
  setRequest,
  setRegistryIn,
  PUBLIC_REGISTRY_ORIGIN,
  type Request,
} from "../lib/environment/index.js";
import { VersionConflictError } from "../lib/files.js";
import { actualPath, Environment, registryCause, shown } from "./environment.js";
import { gainedLines, leftOutLines, leftToAppLines, settle } from "./settle.js";
import { parsed, Refusal, type Command } from "./run.js";

/** Write one request into the environment's `spex.yaml` (environments-15):
 * a file made new explicitly names the public registry
 * (environments-2); comments and key order stay; a file changed
 * meanwhile is refused in the library's words. */
export async function writeRequest(env: Environment, name: string, request: Request, made: boolean): Promise<void> {
  try {
    if (made) {
      await editRequests(env.requestsFile, (doc) => {
        setRegistryIn(doc, PUBLIC_REGISTRY_ORIGIN);
        doc.setIn(["packages", name], doc.createNode(request));
      });
      console.log(`Made ${shown(env.root, env.requestsFile)} at ${env.root}, its registry ${PUBLIC_REGISTRY_ORIGIN}.`);
    } else {
      await setRequest(env.requestsFile, name, request);
    }
  } catch (error) {
    if (error instanceof RequestsError || error instanceof VersionConflictError) throw new Refusal(error.message);
    throw error;
  }
}

/** Resolve, install and export, then say what the lock gained or moved
 * and what the export left out. */
export async function settleAndTell(env: Environment): Promise<void> {
  const settled = await settle(env, "resolve");
  if (settled === null) return;
  const lines = gainedLines(env.root, settled);
  for (const name of settled.install.missingPaths) lines.push(`Missing ${name}: its folder is not at its path here`);
  lines.push(...leftToAppLines(env.root, settled), ...leftOutLines(settled.exported));
  console.log(lines.length > 0 ? lines.join("\n") : "Nothing moved.");
}

export const add: Command = async (args) => {
  const { values, positionals } = parsed("add", args, { path: { type: "string" } }, { min: 1, max: 1, usage: "<org>/<pkg>[@<requirement>] | <org>/<pkg> --path <folder>" });
  const spec = positionals[0]!;
  const at = spec.indexOf("@");
  const name = at < 0 ? spec : spec.slice(0, at);
  const requirement = at < 0 ? undefined : spec.slice(at + 1);
  if (!isPackageName(name)) throw new Refusal(`"${name}" is not a <org>/<pkg> name: lowercase letters, digits and single hyphens, at most 64 characters each`);
  if (requirement !== undefined && values.path !== undefined) throw new Refusal("a requirement and --path together: give one");

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
    if (out(inside)) throw new Refusal(`--path ${values.path} leads out of ${env.root}`);
    const path = inside.split(sep).join("/");
    request = { path };
  } else {
    if (requirement !== undefined) {
      const malformed = requestIssues(name, { version: requirement });
      if (malformed.length > 0) throw new Refusal(malformed.map((issue) => issue.message).join("; "));
    }
    const target = env.registryOf(read?.requests ?? null);
  const instance = target.origin;
    const registry = env.registryAt(instance, target.scope);
    let versions;
    try {
      versions = (await registry.index(name)).versions;
    } catch (error) {
      if (error instanceof RegistryError && error.kind === "not_found") throw new Refusal(`${env.nameOf(instance)} lists no spec package ${name}`);
      throw new Refusal(registryCause(error));
    }
    if (requirement !== undefined) {
      request = { version: requirement };
    } else {
      // A caret at the newest listed version that is no prerelease and is
      // neither yanked nor suppressed.
      const newest = versions
        .filter((entry) => entry.format === KNOWN_FORMAT && isVersion(entry.version) && !entry.yanked && !entry.suppressed && parseVersion(entry.version).prerelease.length === 0)
        .map((entry) => entry.version)
        .sort((a, b) => compareVersions(b, a))[0];
      if (newest === undefined) throw new Refusal(`${env.nameOf(instance)} lists no released version of ${name}; name one as ${name}@<requirement>`);
      request = { version: `^${newest}` };
    }
  }
  const issues = requestIssues(name, request);
  if (issues.length > 0) throw new Refusal(issues.map((issue) => issue.message).join("; "));
  await writeRequest(env, name, request, read === null);
  await settleAndTell(env);
};
