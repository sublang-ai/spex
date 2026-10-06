// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Resolution and selection (environments-5, environments-6, DR-104).
// The graph holds the requested spec packages and everything they
// require at any depth; a solution gives each one version so that every
// requirement and `select` entry holds. A backtracking search assigns
// the requested names first, then the rest, each in name order, trying
// candidates newest first — so the first solution found is the highest
// by the record's comparison. Registry versions are picked from the
// version index alone; a version resource is read only for each version
// picked. Within the solution, artifacts, languages, files and exports
// are selected in the record's four steps.

import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

import {
  ARTIFACT_KINDS,
  artifactLanguages,
  inArtifact,
  readRelease,
  ROOT_FILES,
  type ArtifactKind,
  type Release,
  type ReleaseFile,
} from "./format.js";
import type { GitCredential, GitSource } from "./git-source.js";
import { manifestRequires, type Lock, type LockedArtifact, type LockedFile, type Resolution, type SourceLock } from "./lock.js";
import { RegistryError, type RegistrySource, type VersionIndexEntry, KNOWN_FORMAT } from "./registry.js";
import { isGitRequest, isInsidePath, isPathRequest, isRegistryRequest, requestsDigest, type Request, type Requests, type Selection } from "./requests.js";
import { compareVersions, isVersion, parseRequirement, satisfies, type Requirement } from "./semver.js";

export interface ConflictRequirement {
  /** The spec package stating it, or `spex.yaml` for a request. */
  by: string;
  requirement: string;
}

export interface Conflict {
  name: string;
  requirements: ConflictRequirement[];
}

export type ResolveResult = { ok: true; lock: Lock } | { ok: false; conflicts: Conflict[] };

export interface ResolveInput {
  requests: Requests;
  /** The `spex.yaml` text the requests were read from: the lock's
   * `requests` digest is taken over these bytes. */
  requestsText?: string;
  registry: RegistrySource;
  workingFolder: string | null;
  git: GitSource;
  /** The credential for a Git repository, where one applies. */
  gitCredential?: (repo: string) => Promise<GitCredential | undefined>;
  /** The lock being replaced. A resolve takes the highest solution and
   * reads nothing from it (DR-104). */
  previous?: Lock;
  /** A bound on candidate trials before the search gives up. */
  maxSteps?: number;
}

export type ResolveErrorKind = "no_working_folder" | "path_outside" | "path_missing" | "name_mismatch" | "bound";

export class ResolveError extends Error {
  constructor(readonly kind: ResolveErrorKind, readonly packageName: string | undefined, message: string) {
    super(message);
    this.name = "ResolveError";
  }
}

/** Where the request file names spec packages in a conflict report. */
export const REQUESTS_FILE = "spex.yaml";

interface ArtifactInfo {
  kind: ArtifactKind;
  language?: string;
  languages: string[];
  requires: string[];
}

interface Fixed {
  kind: "path" | "git";
  release: Release;
  /** The request's path, for a path source. */
  path?: string;
  repo?: string;
  commit?: string;
  subpath?: string;
}

interface Candidate {
  version: string;
  dependencies: Record<string, string>;
  /** The artifacts as the index or manifest names them. */
  artifacts: Record<string, { kind: string; languages: string[] }>;
  entry?: VersionIndexEntry;
  fixed?: Fixed;
}

function describeSelection(selection: Selection): string {
  return `select ${selection.artifact}${selection.language ? ` in ${selection.language}` : ""}`;
}

function selectionHolds(selection: readonly Selection[], artifacts: Candidate["artifacts"]): boolean {
  return selection.every((entry) => {
    const artifact = artifacts[entry.artifact];
    return artifact !== undefined && (entry.language === undefined || artifact.languages.includes(entry.language));
  });
}

async function loadFixed(name: string, request: Request, input: ResolveInput): Promise<Fixed | undefined> {
  if (isPathRequest(request)) {
    if (input.workingFolder === null) throw new ResolveError("no_working_folder", name, `${name} is requested by path, and this spex repository has no working folder on this device`);
    if (!isInsidePath(request.path)) throw new ResolveError("path_outside", name, `${name}: ${request.path} is outside the working folder`);
    const dir = resolvePath(input.workingFolder, request.path);
    const inside = relative(resolvePath(input.workingFolder), dir);
    if (inside.startsWith("..") || inside.startsWith(sep)) throw new ResolveError("path_outside", name, `${name}: ${request.path} is outside the working folder`);
    if (!existsSync(join(dir, "meta.yaml"))) throw new ResolveError("path_missing", name, `${name}: ${request.path} is missing in ${input.workingFolder}`);
    // A link may not lead the path out of the working folder either.
    const real = relative(realpathSync(input.workingFolder), realpathSync(dir));
    if (real.startsWith("..") || isAbsolute(real)) throw new ResolveError("path_outside", name, `${name}: ${request.path} leads outside the working folder`);
    const release = await readRelease(dir);
    const found = `${release.manifest.org}/${release.manifest.name}`;
    if (found !== name) throw new ResolveError("name_mismatch", name, `${name}: the folder ${request.path} holds ${found}`);
    return { kind: "path", release, path: request.path };
  }
  if (isGitRequest(request)) {
    const credential = input.gitCredential ? await input.gitCredential(request.git) : undefined;
    const { commit, dir } = await input.git.fetch(request.git, request.rev, credential);
    const releaseDir = request.path ? join(dir, ...request.path.split("/")) : dir;
    if (!existsSync(join(releaseDir, "meta.yaml"))) {
      throw new ResolveError("path_missing", name, `${name}: ${request.git} at ${request.rev} has no release${request.path ? ` at ${request.path}` : ""}`);
    }
    const release = await readRelease(releaseDir);
    const found = `${release.manifest.org}/${release.manifest.name}`;
    if (found !== name) throw new ResolveError("name_mismatch", name, `${name}: ${request.git} at ${request.rev} holds ${found}`);
    return { kind: "git", release, repo: request.git, commit, ...(request.path ? { subpath: request.path } : {}) };
  }
  return undefined;
}

function candidateOfFixed(fixed: Fixed): Candidate {
  const { manifest, files } = fixed.release;
  const languages = artifactLanguages(manifest, files);
  const artifacts: Candidate["artifacts"] = {};
  for (const [id, artifact] of Object.entries(manifest.artifacts)) artifacts[id] = { kind: artifact.kind, languages: languages[id] ?? [] };
  return { version: manifest.version, dependencies: { ...manifest.dependencies }, artifacts, fixed };
}

function usableEntry(entry: VersionIndexEntry): boolean {
  if (entry.format !== KNOWN_FORMAT || !isVersion(entry.version)) return false;
  return Object.values(entry.dependencies).every((requirement) => {
    try { parseRequirement(requirement); return true; } catch { return false; }
  });
}

/** Resolve requests into a lock (environments-5, environments-6). */
export async function resolve(input: ResolveInput): Promise<ResolveResult> {
  const { requests, registry } = input;
  const requested = Object.keys(requests.packages).sort();
  const fixed = new Map<string, Fixed>();
  for (const name of requested) {
    const loaded = await loadFixed(name, requests.packages[name]!, input);
    if (loaded) fixed.set(name, loaded);
  }

  const indexes = new Map<string, VersionIndexEntry[]>();
  async function indexOf(name: string): Promise<VersionIndexEntry[]> {
    const cached = indexes.get(name);
    if (cached) return cached;
    let entries: VersionIndexEntry[];
    try {
      entries = (await registry.index(name)).versions;
    } catch (error) {
      if (error instanceof RegistryError && error.kind === "not_found") entries = [];
      else throw error;
    }
    indexes.set(name, entries);
    return entries;
  }

  const assigned = new Map<string, Candidate>();
  const failures: Conflict[] = [];

  function requirementsOn(name: string): ConflictRequirement[] {
    const out: ConflictRequirement[] = [];
    const request = requests.packages[name];
    if (request && isRegistryRequest(request)) out.push({ by: REQUESTS_FILE, requirement: request.version });
    for (const [by, candidate] of assigned) {
      const requirement = candidate.dependencies[name];
      if (requirement !== undefined) out.push({ by, requirement });
    }
    return out;
  }

  function pickNext(): string | undefined {
    for (const name of requested) if (!assigned.has(name)) return name;
    let next: string | undefined;
    for (const candidate of assigned.values()) {
      for (const dependency of Object.keys(candidate.dependencies)) {
        if (!assigned.has(dependency) && (next === undefined || dependency < next)) next = dependency;
      }
    }
    return next;
  }

  function fail(name: string, requirements: ConflictRequirement[]): void {
    const request = requests.packages[name];
    const extra: ConflictRequirement[] = [];
    if (request && isPathRequest(request)) extra.push({ by: REQUESTS_FILE, requirement: `path ${request.path} at ${fixed.get(name)?.release.manifest.version}` });
    if (request && isGitRequest(request)) extra.push({ by: REQUESTS_FILE, requirement: `git ${request.git} at ${request.rev} (${fixed.get(name)?.release.manifest.version})` });
    for (const selection of request?.select ?? []) extra.push({ by: REQUESTS_FILE, requirement: describeSelection(selection) });
    failures.push({ name, requirements: [...extra, ...requirements] });
  }

  async function candidates(name: string, requirements: ConflictRequirement[]): Promise<Candidate[]> {
    const parsed: Requirement[] = requirements.map((entry) => parseRequirement(entry.requirement));
    const selection = requests.packages[name]?.select ?? [];
    const own = fixed.get(name);
    if (own) {
      const candidate = candidateOfFixed(own);
      return parsed.every((requirement) => satisfies(candidate.version, requirement)) && selectionHolds(selection, candidate.artifacts) ? [candidate] : [];
    }
    const entries = await indexOf(name);
    return entries
      .filter((entry) => {
        if (!usableEntry(entry) || entry.suppressed) return false;
        if (entry.yanked && !parsed.some((requirement) => requirement.op === "exact" && compareVersions(requirement.version, entry.version) === 0)) return false;
        if (!parsed.every((requirement) => satisfies(entry.version, requirement))) return false;
        return selectionHolds(selection, entry.artifacts);
      })
      .sort((a, b) => compareVersions(b.version, a.version))
      .map((entry) => ({ version: entry.version, dependencies: { ...entry.dependencies }, artifacts: entry.artifacts, entry }));
  }

  const maxSteps = input.maxSteps ?? 20000;
  let steps = 0;
  async function solve(): Promise<boolean> {
    const name = pickNext();
    if (name === undefined) return true;
    const requirements = requirementsOn(name);
    const found = await candidates(name, requirements);
    if (found.length === 0) {
      fail(name, requirements);
      return false;
    }
    for (const candidate of found) {
      steps += 1;
      if (steps > maxSteps) throw new ResolveError("bound", name, `resolution gave up after ${maxSteps} trials`);
      const broken = Object.entries(candidate.dependencies)
        .find(([dependency, requirement]) => assigned.has(dependency) && !satisfies(assigned.get(dependency)!.version, requirement));
      if (broken) {
        failures.push({ name: broken[0], requirements: [...requirementsOn(broken[0]), { by: name, requirement: broken[1] }] });
        continue;
      }
      assigned.set(name, candidate);
      if (await solve()) return true;
      assigned.delete(name);
    }
    return false;
  }

  if (!(await solve())) {
    const seen = new Set<string>();
    const conflicts: Conflict[] = [];
    for (const failure of failures) {
      const key = `${failure.name}\u0000${failure.requirements.map((entry) => `${entry.by}:${entry.requirement}`).sort().join("\u0000")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push(failure);
    }
    return { ok: false, conflicts };
  }

  // The solution stands: read each picked registry version's resource.
  const names = [...assigned.keys()].sort();
  const requiredBy = new Map<string, string[]>();
  for (const name of names) requiredBy.set(name, []);
  for (const [by, candidate] of assigned) {
    for (const dependency of Object.keys(candidate.dependencies)) requiredBy.get(dependency)?.push(by);
  }

  interface Picked {
    name: string;
    version: string;
    artifacts: Record<string, ArtifactInfo>;
    files: ReleaseFile[];
    source: SourceLock;
    lockFiles: boolean;
  }
  const picked: Picked[] = [];
  for (const name of names) {
    const candidate = assigned.get(name)!;
    if (candidate.fixed) {
      const { release } = candidate.fixed;
      const languages = artifactLanguages(release.manifest, release.files);
      const artifacts: Record<string, ArtifactInfo> = {};
      for (const [id, artifact] of Object.entries(release.manifest.artifacts)) {
        artifacts[id] = { kind: artifact.kind, ...(artifact.language !== undefined ? { language: artifact.language } : {}), languages: languages[id] ?? [], requires: artifact.requires };
      }
      const source: SourceLock = candidate.fixed.kind === "path"
        ? { path: candidate.fixed.path!, version: release.manifest.version, dependencies: { ...release.manifest.dependencies }, requires: manifestRequires(release.manifest) }
        : { git: candidate.fixed.repo!, commit: candidate.fixed.commit!, ...(candidate.fixed.subpath ? { path: candidate.fixed.subpath } : {}) };
      picked.push({ name, version: candidate.version, artifacts, files: release.files, source, lockFiles: candidate.fixed.kind === "git" });
      continue;
    }
    const resource = await registry.version(name, candidate.version);
    if (!resource.files) throw new RegistryError("not_found", name, `${name} ${candidate.version} lists no files: the registry withholds it`);
    const artifacts: Record<string, ArtifactInfo> = {};
    for (const [id, artifact] of Object.entries(resource.artifacts)) {
      if (!(ARTIFACT_KINDS as readonly string[]).includes(artifact.kind)) continue;
      artifacts[id] = {
        kind: artifact.kind as ArtifactKind,
        ...(artifact.language !== undefined ? { language: artifact.language } : {}),
        languages: artifact.languages.length > 0 ? artifact.languages : artifact.language ? [artifact.language] : [],
        requires: Array.isArray(artifact.requires) ? artifact.requires : [],
      };
    }
    picked.push({
      name,
      version: candidate.version,
      artifacts,
      files: resource.files,
      source: { registry: registry.url, version: candidate.version, checksum: resource.checksum },
      lockFiles: true,
    });
  }

  // Selection, in the record's four steps.
  const packages: Record<string, Resolution> = {};
  const exported = new Map<string, { by: string; kind: ArtifactKind; id: string }[]>();
  for (const entry of picked) {
    const request = requests.packages[entry.name];
    const required = (requiredBy.get(entry.name) ?? []).length > 0;
    // 1. Artifacts: the selected ones and what they require, or all.
    let selected: string[];
    if (!request?.select || request.select.length === 0 || required) {
      selected = Object.keys(entry.artifacts);
    } else {
      const chosen = new Set<string>();
      const queue = request.select.map((selection) => selection.artifact);
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (chosen.has(id) || !entry.artifacts[id]) continue;
        chosen.add(id);
        queue.push(...entry.artifacts[id]!.requires);
      }
      selected = [...chosen];
    }
    selected.sort();
    // 2. Languages.
    const artifacts: Record<string, LockedArtifact> = {};
    for (const id of selected) {
      const artifact = entry.artifacts[id]!;
      if (artifact.kind === "applet") { artifacts[id] = { language: null, fallback: false }; continue; }
      const named = request?.select?.find((selection) => selection.artifact === id && selection.language !== undefined)?.language;
      if (named !== undefined && artifact.languages.includes(named)) artifacts[id] = { language: named, fallback: false };
      else if (requests.language !== undefined && artifact.languages.includes(requests.language)) artifacts[id] = { language: requests.language, fallback: false };
      else {
        const wanted = named ?? requests.language;
        artifacts[id] = { language: artifact.language ?? null, fallback: wanted !== undefined && wanted !== artifact.language };
      }
    }
    // 3. Files: the root files and each selected artifact's in its language.
    const pkg = entry.name.split("/")[1]!;
    const files: LockedFile[] = entry.lockFiles
      ? entry.files
        .filter((file) => (ROOT_FILES as readonly string[]).includes(file.path)
          || selected.some((id) => inArtifact(file.path, entry.artifacts[id]!.kind, id, artifacts[id]!.language, pkg)))
        .map((file) => ({ path: file.path, sha256: file.sha256, executable: file.executable }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      : [];
    // 4. Exports: one skill per selected skill and playbook.
    const exports: Record<string, string> = {};
    for (const id of selected) {
      const kind = entry.artifacts[id]!.kind;
      if (kind !== "skill" && kind !== "playbook") continue;
      const name = request?.alias?.[id] ?? id;
      exports[name] = id;
      const list = exported.get(name) ?? [];
      list.push({ by: entry.name, kind, id });
      exported.set(name, list);
    }
    packages[entry.name] = { source: entry.source, requiredBy: [...(requiredBy.get(entry.name) ?? [])].sort(), artifacts, files, exports };
  }

  const clashes: Conflict[] = [];
  for (const name of [...exported.keys()].sort()) {
    const list = exported.get(name)!;
    if (list.length < 2) continue;
    clashes.push({ name, requirements: list.map((item) => ({ by: item.by, requirement: `${item.kind} ${item.id}` })) });
  }
  if (clashes.length > 0) return { ok: false, conflicts: clashes };

  const digest = requestsDigest(input.requestsText ?? JSON.stringify(requests));
  return { ok: true, lock: { format: 1, requests: digest, packages } };
}
