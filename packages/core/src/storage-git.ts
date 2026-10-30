// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One spex repository's `spex` branch as Git sees it (storage-10..12,
// storage-17): the whole units a merge selects, their plan against a
// common ancestor, the validated application of a selection, the
// managed Git rules, and a clone's first commit.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { resolveMachineIdentity } from "@sublang/playbook/machine-identity";
import { parseIntentFile, parsePrefs, parseProjectFile, type IntentFile, type StorageDiagnostic } from "./app-storage.js";
import { assertPlainDirectory, portable, readJsonFile, StorageFormatError, UUID, writeApplicationFile } from "@sublang/spex/files";
import { Home } from "./home.js";
import { i18n } from "./i18n.js";
import { readPlacementFiles } from "./placements.js";
import { acquireRootLease } from "./root-lease.js";

export type StorageChoice = "ours" | "theirs";
/** One whole-unit selection subject (storage-11). `changed` says which
 * sides differ from the ancestor, so a caller can tell a local change
 * from an incoming one without re-reading the trees. */
export interface StorageMergeUnit { name: string; paths: string[]; choice: StorageChoice | "conflict"; changed: { ours: boolean; theirs: boolean } }
/** `base` is null and `unrelated` true where the revisions share no
 * ancestor and the caller did not join them (storage-11). */
export interface StorageMergePlan { ours: string; theirs: string; base: string | null; unrelated: boolean; units: StorageMergeUnit[] }
/** A tree as path → blob id. */
export type StorageTree = Map<string, string>;
export interface StorageTrees { ours: StorageTree; theirs: StorageTree; base: StorageTree }
/** Git's well-known empty tree: the ancestor of a join (storage-11). */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** The branch every spex repository keeps its records on (DR-103). */
export const SPEX_BRANCH = "spex";
/** The marker an interrupted apply leaves in its clone (space-31). */
export const APPLY_MARKER = ".spex-apply.json";
/** A spex repository's staging owner for media (media-4), ignored. */
export const UPLOAD_STAGING = ".spex-uploads";

const AUTHORING_ID = /^[a-z0-9][a-z0-9_-]*$/;
const SESSION_UNIT = /^sessions\/[0-9a-f-]{36}$/;
const AUTHORING_UNIT = /^authoring\/[a-z0-9][a-z0-9_-]*$/;
const git = (dir: string, args: string[], env?: NodeJS.ProcessEnv, input?: string): Buffer =>
  execFileSync("git", ["-C", dir, ...args], { maxBuffer: 256 * 1024 * 1024, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], ...(env ? { env } : {}), ...(input === undefined ? {} : { input }) });
const revision = (dir: string, ref: string): string => git(dir, ["rev-parse", "--verify", `${ref}^{commit}`]).toString().trim();


/** No spec package folder: what a caller naming none passes. */
const NO_PACKAGES: ReadonlySet<string> = new Set();

/** The record, settings and placement paths, and the folders the
 * catalog ignores, no spec package folder lies in (storage-11). */
export const NOT_PACKAGES = /^(?:config|sessions|intents|authoring|placements|packages|skills|local|\.spex-uploads)\//;

/** The folders below a clone's root, outside its record and settings
 * paths and the folders the catalog ignores, that hold a spec package's
 * `meta.yaml` among `paths` — each one sync unit with every file under
 * it (storage-11, DR-125). */
export function specPackageFolders(paths: Iterable<string>): Set<string> {
  const folders = new Set<string>();
  for (const file of paths) {
    if (!file.endsWith("/meta.yaml") || NOT_PACKAGES.test(file)) continue;
    folders.add(file.slice(0, -"/meta.yaml".length));
  }
  return folders;
}

/** The unit a tracked path of a clone belongs to (storage-11, space-33):
 * a file under one of `packages`, the spec package folders of the trees
 * compared, is the outermost one's, named with a trailing `/`. */
export function storageUnitName(file: string, packages: ReadonlySet<string> = NO_PACKAGES): string {
  const session = /^sessions\/([^/]+?)(?:\.records\.jsonl$|\.replay\.json$|\.json$|\.(?:assets|chunks)\/)/.exec(file);
  if (session && UUID.test(session[1])) return `sessions/${session[1]}`;
  const intent = /^intents\/([^/]+?)(?:\.json$|\.assets\/)/.exec(file);
  if (intent && UUID.test(intent[1])) return `intents/${intent[1]}`;
  const authoring = /^authoring\/([^/]+?)(?:\.records\.jsonl$|\.json$|\.assets\/)/.exec(file);
  if (authoring && AUTHORING_ID.test(authoring[1])) return `authoring/${authoring[1]}`;
  if (file === "spex.yaml" || file === "spex.lock") return "environment";
  if (packages.size > 0) {
    const parts = file.split("/");
    for (let end = 1; end < parts.length; end += 1) {
      const folder = parts.slice(0, end).join("/");
      if (packages.has(folder)) return `${folder}/`;
    }
  }
  return file;
}

/** Whether a unit is a spec package folder with every file under it. */
const isPackageUnit = (name: string): boolean => name.endsWith("/");

/** The files a bundle unit always names, present or not. */
function bundleFiles(name: string): string[] {
  if (/^sessions\//.test(name) || /^authoring\//.test(name)) return [`${name}.json`, `${name}.records.jsonl`];
  if (/^intents\//.test(name)) return [`${name}.json`];
  if (name === "environment") return ["spex.yaml", "spex.lock"];
  if (isPackageUnit(name)) return [`${name}meta.yaml`];
  return [];
}

/** Every tracked blob of a revision or tree with its mode. */
function readTreeEntries(dir: string, ref: string): Map<string, { mode: string; oid: string }> {
  const out = new Map<string, { mode: string; oid: string }>();
  for (const line of git(dir, ["ls-tree", "-rz", "--full-tree", ref]).toString().split("\0")) {
    if (!line) continue;
    const tab = line.indexOf("\t"); const file = line.slice(tab + 1); const [mode, type, oid] = line.slice(0, tab).split(" ");
    if (type !== "blob" || !["100644", "100755"].includes(mode)) throw new StorageFormatError(file, "tracked storage entries must be regular files");
    out.set(file, { mode, oid });
  }
  return out;
}
/** Every tracked blob of a revision or tree, as path → blob id. */
export function readStorageTree(dir: string, ref: string): StorageTree {
  return new Map([...readTreeEntries(dir, ref)].map(([file, entry]) => [file, entry.oid]));
}
function equal(a: StorageTree, b: StorageTree, paths: string[]): boolean { return paths.every((p) => a.get(p) === b.get(p)); }
/** Group every tracked path of three trees into units and classify each
 * by complete bytes and existence under the selection rule (storage-11). */
export function planStorageUnits(trees: StorageTrees): StorageMergeUnit[] {
  const groups = new Map<string, Set<string>>();
  const files = new Set([...trees.ours.keys(), ...trees.theirs.keys(), ...trees.base.keys()]);
  // A folder holding `meta.yaml` on any side is one unit on every side.
  const packages = specPackageFolders(files);
  for (const file of files) {
    const name = storageUnitName(file, packages);
    const files = groups.get(name) ?? new Set<string>(); files.add(file);
    for (const member of bundleFiles(name)) files.add(member);
    groups.set(name, files);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => {
    const paths = [...group].sort();
    const changed = { ours: !equal(trees.ours, trees.base, paths), theirs: !equal(trees.theirs, trees.base, paths) };
    const choice = equal(trees.ours, trees.theirs, paths) || !changed.theirs ? "ours" : !changed.ours ? "theirs" : "conflict";
    return { name, paths, choice, changed };
  });
}
/** Plan two revisions of a clone against their common ancestor; with
 * `join`, two unrelated histories compare against the empty tree. */
export function planStorageMerge(dir: string, oursRef: string, theirsRef: string, options: { join?: boolean } = {}): StorageMergePlan {
  const ours = revision(dir, oursRef); const theirs = revision(dir, theirsRef);
  let base: string | null;
  try { base = git(dir, ["merge-base", ours, theirs]).toString().trim(); } catch { base = null; }
  const unrelated = base === null;
  if (unrelated && !options.join) return { ours, theirs, base, unrelated, units: [] };
  const ancestor = base ?? EMPTY_TREE;
  const trees = { ours: readStorageTree(dir, ours), theirs: readStorageTree(dir, theirs), base: readStorageTree(dir, ancestor) };
  return { ours, theirs, base: ancestor, unrelated, units: planStorageUnits(trees) };
}
/** Every unit's selected side: unknown units, unresolved conflicts and
 * choices contrary to a decided unit are refused (storage-21). */
export function resolveStorageChoices(units: StorageMergeUnit[], choices: Record<string, StorageChoice>): Map<string, StorageChoice> {
  for (const name of Object.keys(choices)) if (!units.some((u) => u.name === name)) throw new Error(`unknown storage unit ${name}`);
  const resolved = new Map<string, StorageChoice>();
  for (const unit of units) {
    if (unit.choice === "conflict" && choices[unit.name] === undefined) throw new Error(`choose ours or theirs for ${unit.name}`);
    if (unit.choice !== "conflict" && choices[unit.name] !== undefined && choices[unit.name] !== unit.choice) throw new Error(`${unit.name} has no divergent change; use its required ${unit.choice} selection`);
    resolved.set(unit.name, choices[unit.name] ?? unit.choice);
  }
  return resolved;
}

/** The home lease (storage-14) by the core's rule (storage-26), taken
 * where no core runs: a dead owner of this machine is reclaimed, and a
 * live, foreign, or unverifiable one refuses with the lease path and the
 * reason. */
export function reserveStorageHome(home: string, machineIdentity: string): () => void {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  let lease;
  try { lease = acquireRootLease(home, { machineIdentity }); }
  catch (error) { throw new Error(`stop the Spex core before changing stored data; ${error instanceof Error ? error.message : String(error)}`); }
  return () => { lease.release(); };
}

/** This machine's identity for a command that takes the root lease
 * (storage-10): resolved before any change, and a refusal names the
 * identity file and the reason. */
export async function storageMachineIdentity(): Promise<string> {
  try { return await resolveMachineIdentity(); }
  catch (error) { throw new Error(`Spex cannot identify this machine: ${error instanceof Error ? error.message : String(error)}`); }
}
export interface ValidateStorageOptions {
  /** Your own group's clone: its config holds the captain and players. */
  own?: boolean;
  /** Retired with the library folder (DR-104); ignored. */
  libraryDir?: string;
  /** The environments' module locations for your own group's config; a
   * playbook none exports is a non-blocking diagnostic (environments-9). */
  modules?: import("./config.js").PlaybookModules;
  selectedSessionIds?: ReadonlySet<string>;
}

/** Check the path at its read/delegation boundary, without following a
 * parent or leaf link. Missing optional paths keep their existing meaning;
 * Playbook still owns the validation of session and attachment contents.
 * This is not a lock against replacements inside an awaited facade call. */
function validationPath(dir: string, file: string, kind: "file" | "directory"): boolean {
  const parts = file.split("/");
  let path = dir;
  for (let index = -1; index < parts.length; index += 1) {
    if (index >= 0) path = join(path, parts[index]);
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (!info) return false;
    const reported = index < 0 ? "." : parts.slice(0, index + 1).join("/");
    if (info.isSymbolicLink()) throw new StorageDestinationRefused(reported, i18n._({
      id: "the path goes through a symbolic link", comment: "Refusal: a storage validation read would follow a link",
    }));
    const directory = index < parts.length - 1 || kind === "directory";
    if (directory ? !info.isDirectory() : !info.isFile()) throw new StorageDestinationRefused(reported, directory
      ? i18n._({ id: "{path} is not a directory", comment: "Refusal: a storage validation parent or family is no directory", values: { path: reported } })
      : i18n._({ id: "{path} is not a file", comment: "Refusal: a storage validation leaf is no regular file", values: { path: reported } }));
  }
  return true;
}

/** Validate a clone's complete tree without changing it (storage-12).
 * Public Playbook validation is the only authority for session bytes. */
export async function validateStorageTree(dir_: string, options: ValidateStorageOptions = {}): Promise<StorageDiagnostic[]> {
  const dir = resolve(dir_);
  const diagnostics: StorageDiagnostic[] = [];
  const projectFile = join(dir, "project.json");
  if (validationPath(dir, "project.json", "file")) parseProjectFile(readJsonFile(projectFile), projectFile);
  // A placement file that will not read names no placement and blocks
  // nothing else (storage-12, storage-41).
  for (const problem of readPlacementFiles(dir).problems) diagnostics.push({ file: problem.file, reason: problem.reason, blocking: false });

  const { createAssetStore } = await import("@sublang/playbook/session-assets");
  const intentsDir = join(dir, "intents");
  const intents: IntentFile[] = [];
  const names = validationPath(dir, "intents", "directory") ? readdirSync(intentsDir) : [];
  for (const name of names) {
    const file = join(intentsDir, name);
    if (name.endsWith(".json")) {
      if (!UUID.test(name.slice(0, -5))) throw new StorageFormatError(file, i18n._({ id: "filename must be an intent UUID",
        comment: "Storage diagnostic: an intent file's name is no intent id" }));
      validationPath(dir, `intents/${name}`, "file");
      intents.push(parseIntentFile(readJsonFile(file), file, name.slice(0, -5)));
    } else if (name.endsWith(".assets") && !names.includes(`${name.slice(0, -7)}.json`)) {
      throw new StorageFormatError(file, i18n._({ id: "attachments without their intent",
        comment: "Storage diagnostic: an intent's attachment folder stands without the intent's file" }));
    }
  }
  const sources = new Map<string, string>();
  for (const intent of intents) {
    const file = join(intentsDir, `${intent.id}.json`);
    if (intent.attachments?.length) {
      const assetPath = `intents/${intent.id}.assets`;
      validationPath(dir, assetPath, "directory");
      const assets = createAssetStore({ directory: join(dir, assetPath) });
      try {
        await assets.prepare();
        for (const ref of intent.attachments) {
          validationPath(dir, `${assetPath}/${ref.assetId.slice(7)}`, "file");
          const reader = await assets.openAsset(ref); await reader.close();
        }
      } catch (cause) {
        if (cause instanceof StorageDestinationRefused) throw cause;
        throw new StorageFormatError(file, cause instanceof Error ? cause.message : String(cause));
      }
    }
    // At most one open intent per source artifact (core-service-42).
    if (!intent.closed && intent.source && intent.source.kind !== "chat") {
      const key = `${intent.source.kind}\0${intent.source.ref}`;
      if (sources.has(key)) throw new StorageFormatError(file, i18n._({ id: "duplicate open source {source}",
        comment: "Storage diagnostic: two open intents hold one issue or pull request", values: { source: intent.source.ref } }));
      sources.set(key, intent.id);
    }
  }

  const authoringDir = join(dir, "authoring");
  if (validationPath(dir, "authoring", "directory")) {
    const { parseStoredDraft } = await import("./drafts.js");
    validationPath(dir, "authoring", "directory");
    for (const name of readdirSync(authoringDir)) {
      if (!name.endsWith(".json")) continue;
      const file = join(authoringDir, name);
      validationPath(dir, `authoring/${name}`, "file");
      parseStoredDraft(readJsonFile(file), file, name.slice(0, -5));
    }
  }

  const config = join(dir, "config", "playbook.config.yaml");
  if (validationPath(dir, "config/playbook.config.yaml", "file")) {
    const document = parseDocument(readFileSync(config, "utf8"));
    if (document.errors.length) throw new StorageFormatError(config, document.errors[0].message);
    const { composeConfig, validateProjectConfig, RegistryError } = await import("./config.js");
    if (!options.own) {
      try { validateProjectConfig(document.toJS(), config); }
      catch (error) { throw new StorageFormatError(config, (error as Error).message); }
    } else {
      try { await composeConfig(document.toJS(), undefined, config, { ...(options.modules ? { modules: options.modules } : {}) }); }
      catch (error) {
        const reason = (error as Error).message;
        if (error instanceof RegistryError) diagnostics.push({ file: config, reason, blocking: false });
        else throw new StorageFormatError(config, reason);
      }
    }
  }

  const { createSessionStore, validateSessionManifest } = await import("@sublang/playbook/session-store");
  const sessionsDir = join(dir, "sessions");
  const sessions = new Map<string, Set<number>>();
  if (validationPath(dir, "sessions", "directory")) {
    const store = createSessionStore({ sessionsDir }); await store.prepare();
    validationPath(dir, "sessions", "directory");
    const names = readdirSync(sessionsDir);
    const bounded = names.flatMap((name) => {
      const match = /^([0-9a-f-]{36})\.(?:replay\.json|chunks)$/.exec(name);
      return match && UUID.test(match[1]) ? [match[1]] : [];
    });
    for (const id of new Set([...bounded, ...(options.selectedSessionIds ?? [])])) {
      if (!names.includes(`${id}.json`) && names.some((name) => storageUnitName(`sessions/${name}/`) === `sessions/${id}` || storageUnitName(`sessions/${name}`) === `sessions/${id}`)) {
        throw new StorageFormatError(`sessions/${id}.json`, "selected session bundle root is missing");
      }
    }
    for (const file of names) {
      if (!file.endsWith(".json") || !UUID.test(file.slice(0, -5))) continue;
      const id = file.slice(0, -5);
      const checkBundle = () => {
        validationPath(dir, `sessions/${id}.json`, "file");
        validationPath(dir, `sessions/${id}.records.jsonl`, "file");
        validationPath(dir, `sessions/${id}.replay.json`, "file");
        validationPath(dir, `sessions/${id}.chunks`, "directory");
        validationPath(dir, `sessions/${id}.assets`, "directory");
      };
      checkBundle();
      const result = await store.validate(id);
      if (result.manifest.schemaVersion !== 7) {
        const tracked = options.selectedSessionIds?.has(id) ?? (existsSync(join(dir, ".git")) && git(dir, ["ls-files", "--", `sessions/${file}`]).length > 0);
        if (tracked) throw new StorageFormatError(file, "unsupported session version cannot be selected as portable data");
        diagnostics.push({ file: `sessions/${file}`, reason: `unsupported session version ${result.manifest.schemaVersion}; retained locally`, blocking: false });
        continue;
      }
      validateSessionManifest(result.manifest);
      if (!result.integrityValid) throw new StorageFormatError(file, result.history.damage?.reason ?? "session replay is missing, damaged or disagrees with its checkpoint");
      checkBundle();
      await store.exportBundle(id);
      const turns = new Set<number>();
      for (const entry of result.history.entries) if (entry.record.type === "turn_started" && Number.isSafeInteger(entry.record.turnId)) turns.add(entry.record.turnId as number);
      sessions.set(id, turns);
    }
  }
  // A dispatch target still present belongs to this repository and
  // names a turn it ran; a deleted one retains derivation (storage-12).
  for (const intent of intents) {
    if (!intent.dispatched) continue;
    const turns = sessions.get(intent.dispatched.sessionId);
    if (turns && !turns.has(intent.dispatched.turnId)) {
      throw new StorageFormatError(join(intentsDir, `${intent.id}.json`), i18n._({ id: "invalid dispatch for {intentId}",
        comment: "Storage diagnostic: an intent names a turn its session never ran", values: { intentId: intent.id } }));
    }
  }
  return diagnostics;
}

/** A unit's write refused at its instant (storage-14, space-19): a file
 * of it holds neither the bytes the apply read nor the selected ones, its
 * session's lease is held, or the clone no longer stands where the apply
 * began. `written` names the units written before it. */
export class StorageWriteRefused extends Error {
  constructor(readonly unit: string, readonly reason: "changed" | "lease" | "moved", readonly written: string[], detail: string) {
    super(`${unit}: ${detail}`);
    this.name = "StorageWriteRefused";
  }
}

/** An unsafe live destination, with the units already published before
 * that boundary refused. The caller retains its repair selection. */
export class StorageDestinationRefused extends StorageFormatError {
  constructor(file: string, reason: string, readonly written: string[] = []) {
    super(file, reason);
    this.name = "StorageDestinationRefused";
  }
}

/** Metadata-only admission to a partial refresh. Do not enter the live
 * validator or reload readers while one of their families is unsafe.
 * This is a boundary check, not a lock against independent writers. */
export function assertStorageRefreshSafe(dir: string): void {
  try { assertPlainDirectory(dir); }
  catch (error) {
    if (error instanceof StorageFormatError) throw new StorageDestinationRefused(".", error.reason);
    throw error;
  }
  const walk = (rel: string): void => {
    const file = join(dir, rel);
    const info = lstatSync(file, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
      throw new StorageDestinationRefused(rel, "unsafe destination parent");
    }
    if (info.isDirectory()) for (const name of readdirSync(file)) {
      if (!name.startsWith(".")) walk(`${rel}/${name}`);
    }
  };
  for (const family of ["sessions", "intents", "authoring", "config"]) {
    try { assertPlainDirectory(join(dir, family)); }
    catch (error) {
      if (error instanceof StorageFormatError) throw new StorageDestinationRefused(family, error.reason);
      throw error;
    }
    walk(family);
  }
  walk("project.json");
}

/** Playbook's shared store over a clone's `sessions/`, as far as a
 * session's write needs it: its lease (storage-14). */
interface SessionLeases {
  acquireManagement(id: string): Promise<{ release(): Promise<unknown> }>;
}

export interface ApplyStorageOptions {
  /** The version each unit is written under: the plan's `ours` commit — a
   * sync's Save (space-19) — or, during `select`, the unit as Git's merge
   * left it when the apply began (storage-21). */
  workingTree?: "ours" | "merge";
  /** The clone's shared session store, whose lease each session's write
   * takes for that write alone; one is opened here otherwise. */
  sessions?: SessionLeases;
  /** Runs after the complete candidate validated and before the first
   * file is replaced: the core records its repair marker here (space-31). */
  beforeWrite?: () => void;
  /** Runs at an authoring unit's write, after the clone and the unit's
   * version are checked and before its first file is replaced, with
   * nothing awaited between; a throw refuses the write as `lease`, naming
   * the session (space-19). The core refuses an authoring session whose
   * turn runs; the storage Git tool passes none. */
  beforeAuthoringWrite?: (unit: string) => void;
  /** `local/prefs.json`, whose viewed markers of written sessions clear. */
  prefsFile?: string;
  validate?: Omit<ValidateStorageOptions, "selectedSessionIds">;
}
export interface AppliedStorageSelection {
  diagnostics: StorageDiagnostic[];
  /** Session units whose selected bytes differ from `ours`. */
  changedSessions: string[];
  selected: Map<string, StorageChoice>;
  /** The validated candidate's tree, now the clone's index (space-19). */
  tree: string;
  /** The units written; the others already held their selection. */
  written: string[];
}

type TreeEntries = Map<string, { mode: string; oid: string }>;
const publicationOrder = (path: string, retained: boolean, replacingRoot: boolean): number => {
  // Keep an old root's dependencies until the new root stands. A
  // deletion keeps the shared lifecycle's manifest-last order.
  if (replacingRoot && !retained && (/\.(assets|chunks)\//.test(path) || /\.(records\.jsonl|replay\.json)$/.test(path))) return 4;
  return /\.(assets|chunks)\//.test(path) ? 0 : path.endsWith(".records.jsonl") ? 1 : path.endsWith(".replay.json") ? 2 : 3;
};

/** Inspect each existing parent without following it, including when the
 * leaf or a later directory is missing. These synchronous boundary checks
 * do not lock out independent filesystem writers (storage-14, storage-21). */
function assertDestinationParents(dir: string, file: string): void {
  const parts = file.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new StorageDestinationRefused(file, "unsafe destination");
  let parent = dir;
  for (const part of ["", ...parts.slice(0, -1)]) {
    if (part) parent = join(parent, part);
    let info;
    try { info = lstatSync(parent); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && parent !== dir) return;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new StorageDestinationRefused(file, "unsafe destination parent");
  }
}

/** A unit's files on disk now, as path → the blob id Git would give
 * them, its filters applied as for that path: its planned paths, and with
 * `members` every portable file under its attachment folder, one added
 * since the plan's trees among them (space-19). */
function unitOnDisk(dir: string, unit: StorageMergeUnit, members: boolean): Map<string, string> {
  const paths = new Set([...unit.paths, ...bundleFiles(unit.name)]);
  if (SESSION_UNIT.test(unit.name)) paths.add(`${unit.name}.replay.json`);
  const walk = (rel: string): void => {
    assertDestinationParents(dir, `${rel}/.member`);
    const full = join(dir, rel);
    let stat;
    try { stat = lstatSync(full); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new StorageDestinationRefused(rel, "unsafe destination");
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (portable(child) && storageUnitName(child) === unit.name) paths.add(child);
    }
  };
  if (members && /^(sessions|intents|authoring)\//.test(unit.name)) walk(`${unit.name}.assets`);
  // Even select's merge-output version must include chunks published
  // while acquisition waits; a session's immutable namespace is owned.
  if (SESSION_UNIT.test(unit.name)) walk(`${unit.name}.chunks`);
  // A spec package folder's members are every file under it Git would
  // carry, one added since the plan's trees among them.
  if (members && isPackageUnit(unit.name)) {
    assertDestinationParents(dir, `${unit.name}.member`);
    for (const file of git(dir, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", unit.name]).toString().split("\0")) {
      if (file && portable(file)) paths.add(file);
    }
  }
  const present = [...paths].filter((file) => {
    assertDestinationParents(dir, file);
    let stat;
    try { stat = lstatSync(join(dir, file)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new StorageDestinationRefused(file, "unsafe destination");
    return true;
  });
  if (!present.length) return new Map();
  // One synchronous child: no await enters the instant it serves.
  const oids = git(dir, ["hash-object", "--stdin-paths"], undefined, `${present.join("\n")}\n`).toString().trim().split("\n");
  return new Map(present.map((file, index) => [file, oids[index]]));
}

/** Validate a tree of a clone as Git holds it, in a private copy: what is
 * staged or selected, never the live files beside it (storage-12). */
export async function validateStorageSnapshot(dir: string, tree: string, options: Omit<ValidateStorageOptions, "selectedSessionIds"> = {}): Promise<StorageDiagnostic[]> {
  const stage = mkdtempSync(join(tmpdir(), "spex-storage-snapshot-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(stage, "index") };
    git(dir, ["read-tree", tree], env);
    git(dir, ["checkout-index", "-a", "-f", `--prefix=${join(stage, "tree")}/`], env);
    // Every session in the tree is tracked, so its version must be one Spex shares.
    const sessions = new Set([...readStorageTree(dir, tree).keys()].map((file) => storageUnitName(file)).filter((unit) => SESSION_UNIT.test(unit)).map((unit) => unit.slice(9)));
    return await validateStorageTree(join(stage, "tree"), { ...options, selectedSessionIds: sessions });
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

/**
 * Apply a resolved selection in a clone (storage-21, space-19): build the
 * candidate — `ours` with each unit taken whole from its selected side —
 * under a temporary index, validate it complete in a private copy, then
 * write each unit that differs, one at a time: a session's under its
 * lease for that write alone, its files compared with the version read
 * and replaced — replay before manifest — with no await between the two.
 * The index is set to the candidate's tree; nothing is committed. The
 * caller holds the home lease: the CLI reserves it, the core owns it.
 */
export async function applyStorageSelection(dir_: string, plan: StorageMergePlan, choices: Record<string, StorageChoice>, options: ApplyStorageOptions = {}): Promise<AppliedStorageSelection> {
  const dir = resolve(dir_);
  if (plan.base === null) throw new Error("storage branches have no common ancestor; join them explicitly to compare against the empty tree");
  const selected = resolveStorageChoices(plan.units, choices);
  const sides: { ours: TreeEntries; theirs: TreeEntries } = { ours: readTreeEntries(dir, plan.ours), theirs: readTreeEntries(dir, plan.theirs) };
  const sideOf = (unit: StorageMergeUnit) => sides[selected.get(unit.name) as StorageChoice];
  const differs = (unit: StorageMergeUnit): boolean => unit.paths.some((path) => sideOf(unit).get(path)?.oid !== sides.ours.get(path)?.oid);
  const changedSessions = plan.units.filter((unit) => SESSION_UNIT.test(unit.name) && differs(unit)).map((unit) => unit.name);
  for (const unit of plan.units) {
    const present = (path: string): boolean => sideOf(unit).has(path);
    const assets = unit.paths.some((path) => path.startsWith(`${unit.name}.assets/`) && present(path));
    if (SESSION_UNIT.test(unit.name)) {
      const manifest = present(`${unit.name}.json`);
      const replay = present(`${unit.name}.records.jsonl`) || present(`${unit.name}.replay.json`);
      const chunks = unit.paths.some((path) => path.startsWith(`${unit.name}.chunks/`) && present(path));
      if (manifest !== replay || ((assets || chunks) && !manifest)) throw new StorageFormatError(unit.name, "selected session requires its complete root, replay, chunks and asset bundle");
    } else if (/^(intents|authoring)\//.test(unit.name)) {
      const record = present(`${unit.name}.json`);
      const replay = present(`${unit.name}.records.jsonl`);
      if ((assets || replay) && !record) throw new StorageFormatError(unit.name, "selected unit requires its record with its attachments");
    }
  }
  const versioned = (options.workingTree ?? "ours") === "ours";
  const unitTree = (side: TreeEntries, unit: StorageMergeUnit): Map<string, string> =>
    new Map(unit.paths.flatMap((path) => { const entry = side.get(path); return entry ? [[path, entry.oid] as const] : []; }));
  // The version each unit is written under, read before the first await:
  // the Save commit's, or the merge's output as it stands at entry — its
  // planned paths alone, so a file in neither tree is left as Git leaves it.
  const read = new Map(plan.units.map((unit) => [unit.name, versioned ? unitTree(sides.ours, unit) : unitOnDisk(dir, unit, false)]));
  // The clone the apply began in: a write never lands in a folder made
  // anew where it was moved from or removed.
  const identity = (): string => { const root = lstatSync(dir); const data = lstatSync(join(dir, ".git")); return `${root.dev}:${root.ino}:${data.dev}:${data.ino}`; };
  const began = identity();
  const stands = (): boolean => { try { return identity() === began; } catch { return false; } };
  const stage = mkdtempSync(join(tmpdir(), "spex-storage-selection-"));
  try {
    // The candidate is built from Git's objects alone, so what another
    // process writes beside the apply never enters it.
    const env = { ...process.env, GIT_INDEX_FILE: join(stage, "index") };
    git(dir, ["read-tree", plan.ours], env);
    const absent = `0 ${"0".repeat(plan.ours.length)}`;
    const entries = plan.units.filter((unit) => selected.get(unit.name) === "theirs" && differs(unit)).flatMap((unit) => unit.paths.map((path) => {
      const entry = sides.theirs.get(path);
      return entry ? `${entry.mode} blob ${entry.oid}\t${path}` : `${absent}\t${path}`;
    }));
    if (entries.length) git(dir, ["update-index", "-z", "--index-info"], env, `${entries.join("\0")}\0`);
    const tree = git(dir, ["write-tree"], env).toString().trim();
    const diagnostics = await validateStorageSnapshot(dir, tree, options.validate ?? {});
    if (!stands()) throw new StorageWriteRefused(plan.units[0]?.name ?? "", "moved", [], "the clone moved or was removed");

    // A unit the selection leaves as `ours` is the working tree's own
    // business; under `select` every unit Git's merge touched is set. A
    // unit already holding its selection needs no write, and an unsafe
    // destination refuses before the first.
    const want = (unit: StorageMergeUnit): Map<string, string> => unitTree(sideOf(unit), unit);
    const holds = (disk: Map<string, string>, wanted: Map<string, string>): boolean =>
      disk.size === wanted.size && [...wanted].every(([path, oid]) => disk.get(path) === oid);
    // Sessions go first: an intent may name a session's newer turn, and a
    // session refused at its write then leaves no intent naming it.
    const pending = plan.units.filter((unit) => (!versioned || differs(unit)) && !holds(unitOnDisk(dir, unit, versioned), want(unit)))
      .sort((a, b) => Number(!SESSION_UNIT.test(a.name)) - Number(!SESSION_UNIT.test(b.name)));
    options.beforeWrite?.();

    const written: string[] = [];
    let complete = false;
    let sessions: SessionLeases | undefined;
    try {
      for (const unit of pending) {
        const wanted = want(unit);
        const version = read.get(unit.name) as Map<string, string>;
        const modes = new Map(unit.paths.flatMap((path) => { const entry = sideOf(unit).get(path); return entry ? [[path, entry.mode] as const] : []; }));
        const bytes = new Map([...wanted].map(([path, oid]) => [path, git(dir, ["cat-file", "blob", oid])]));
        const moved = (): StorageWriteRefused => new StorageWriteRefused(unit.name, "moved", [...written], "the clone moved or was removed");
        let lease: { release(): Promise<unknown> } | undefined;
        if (SESSION_UNIT.test(unit.name)) {
          // The store opens before the clone is checked, so no import
          // stands between that check and the acquisition, which never
          // makes the sessions folder or an ancestor: one missing is made
          // here alone, on its own, while the clone stands.
          if (!stands()) throw moved();
          assertDestinationParents(dir, "sessions/.lease");
          sessions ??= options.sessions;
          if (!sessions) {
            const { createSessionStore } = await import("@sublang/playbook/session-store");
            if (!stands()) throw moved();
            assertDestinationParents(dir, "sessions/.lease");
            sessions = createSessionStore({ sessionsDir: join(dir, "sessions"), createSessionsDir: false });
          }
          try { mkdirSync(join(dir, "sessions"), { mode: 0o700 }); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
          assertDestinationParents(dir, "sessions/.lease");
          try { lease = await sessions.acquireManagement(unit.name.slice(9)); }
          catch (error) {
            // A clone gone during the acquisition is moved, never a lease
            // another writer holds.
            if (!stands()) throw moved();
            assertDestinationParents(dir, "sessions/.lease");
            throw new StorageWriteRefused(unit.name, "lease", [...written], error instanceof Error ? error.message : String(error));
          }
        }
        let refused = false;
        try {
          // The instant of the write: the clone, the unit's version and its
          // authoring check, then its files, with nothing awaited between.
          if (!stands()) throw moved();
          const disk = unitOnDisk(dir, unit, versioned);
          const replacingRoot = wanted.has(`${unit.name}.json`);
          const paths = [...new Set([...disk.keys(), ...wanted.keys(), ...version.keys()])].sort((a, b) => publicationOrder(a, wanted.has(a), replacingRoot) - publicationOrder(b, wanted.has(b), replacingRoot) || a.localeCompare(b));
          const changed = paths.find((path) => disk.get(path) !== version.get(path) && disk.get(path) !== wanted.get(path));
          if (changed) throw new StorageWriteRefused(unit.name, "changed", [...written], `${changed} changed since it was read`);
          if (AUTHORING_UNIT.test(unit.name)) {
            try { options.beforeAuthoringWrite?.(unit.name); }
            catch (error) { throw new StorageWriteRefused(unit.name, "lease", [...written], error instanceof Error ? error.message : String(error)); }
          }
          for (const file of paths) {
            // A chunk already untracked when select read Git's merge
            // output stays local, as any path in neither side's tree.
            if (!versioned && !unit.paths.includes(file) && version.has(file)) continue;
            assertDestinationParents(dir, file);
            const target = join(dir, file); const oid = wanted.get(file);
            if (oid) {
              if (disk.get(file) === oid) continue;
              mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
              assertDestinationParents(dir, file);
              const temporary = `${target}.${randomUUID()}.tmp`;
              writeFileSync(temporary, bytes.get(file) as Buffer, { mode: modes.get(file) === "100755" ? 0o700 : 0o600 });
              assertDestinationParents(dir, file);
              renameSync(temporary, target);
            } else if (disk.has(file)) rmSync(target, { force: true });
          }
          // Attachments stay owner-only whoever made their folder — Git's
          // merge makes it under the process umask; only a differing mode
          // changes, since a mode change moves the ctime readers pin.
          for (const [file, mode] of [[`${unit.name}.assets`, 0o700], ...(SESSION_UNIT.test(unit.name) ? [[`${unit.name}.chunks`, 0o700] as const] : []), ...[...wanted.keys()].filter((path) => /\.(assets|chunks)\//.test(path)).map((path) => [path, 0o600] as const)] as const) {
            assertDestinationParents(dir, file);
            const stat = lstatSync(join(dir, file), { throwIfNoEntry: false });
            if (stat && !stat.isSymbolicLink() && (stat.mode & 0o777) !== mode) chmodSync(join(dir, file), mode);
          }
          // A local hint belongs to the previous exact checkpoint, never the selected branch.
          if (SESSION_UNIT.test(unit.name)) {
            assertDestinationParents(dir, `${unit.name}.hints.json`);
            rmSync(join(dir, `${unit.name}.hints.json`), { force: true });
          }
          written.push(unit.name);
        } catch (error) {
          refused = true;
          throw error;
        } finally {
          // A refusal stands as the answer: a release failing beside it —
          // a lease gone with a moved clone — never replaces it.
          if (refused) await lease?.release().catch(() => undefined);
          else await lease?.release();
        }
      }
      // Complete, every changed session holds its selection — one an
      // interrupted apply wrote before a crash among them — and loses its
      // hint, with no write of its files.
      if (stands()) for (const unit of changedSessions) {
        assertDestinationParents(dir, `${unit}.hints.json`);
        rmSync(join(dir, `${unit}.hints.json`), { force: true });
      }
      complete = true;
    } catch (error) {
      if (error instanceof StorageDestinationRefused) throw new StorageDestinationRefused(error.file, error.reason, [...written]);
      throw error;
    } finally {
      const viewed = complete ? changedSessions : written.filter((unit) => changedSessions.includes(unit));
      if (options.prefsFile && existsSync(options.prefsFile) && viewed.length > 0) {
        const prefs = parsePrefs(readJsonFile(options.prefsFile), options.prefsFile);
        for (const session of viewed) delete prefs[`viewed:${session.slice(9)}`];
        writeApplicationFile(options.prefsFile, { format: 1, prefs });
      }
    }
    // The index takes the candidate's tree, never the working tree's bytes.
    git(dir, ["read-tree", tree]);
    try { git(dir, ["update-index", "-q", "--refresh"]); } catch { /* a path differing on disk is a local change */ }
    return { diagnostics, changedSessions, selected, tree, written };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

/** Select into an in-progress ordinary Git merge of one clone; leave
 * committing to Git (storage-21). */
export async function selectStorageMerge(home_: string, key: string, choices: Record<string, StorageChoice> = {}, options: { join?: boolean; machineIdentity?: string } = {}): Promise<{ plan: StorageMergePlan; diagnostics: StorageDiagnostic[] }> {
  const home = resolve(home_); const releaseHome = reserveStorageHome(home, options.machineIdentity ?? await storageMachineIdentity());
  try {
    const loaded = Home.load(home);
    const dir = loaded.clonePath(key);
    const plan = planStorageMerge(dir, "HEAD", "MERGE_HEAD", options);
    const { diagnostics } = await applyStorageSelection(dir, plan, choices, {
      workingTree: "merge",
      prefsFile: join(home, "local", "prefs.json"),
      validate: { own: key === loaded.own(), libraryDir: join(home, "playbooks") },
    });
    return { plan, diagnostics };
  } finally { releaseHome(); }
}

/** Install a clone's managed Git rules before its first commit and
 * before each sync, keeping authored rules (storage-17). The clone must
 * stand: a folder moved or removed meanwhile is never made again. */
export function prepareStorageGitFiles(dir: string, unsupportedPaths: string[] = []): void {
  const ignores = [
    // `local/` holds what Playbook's guarded migration keeps of a legacy
    // session's original bytes beside the store it migrates into: never
    // portable, since a legacy manifest may hold a provider token
    // (storage-9, storage-17, storage-18).
    "/packages/", "/skills/", "/local/", `/${UPLOAD_STAGING}/`, `/${APPLY_MARKER}`, "/.lock*",
    "*.hints.json", "*.spex.json", "*.lock", "*.lock.*", "*.tmp", "*.bak", "*.bak.*", "*.backup", "*.backup.*",
    "!/spex.lock",
  ];
  const unsupported = [...new Set(unsupportedPaths)].sort().map((file) => {
    if (file.startsWith("/") || file.split("/").includes("..") || /[\r\n\0*?\[\]\\]/.test(file)) throw new Error(`unsafe ignore path ${file}`);
    return `/${file}`;
  });
  const attributes = ["*.json -text", "*.jsonl -text", "/intents/*.assets/** -text", "/sessions/*.assets/** -text", "/sessions/*.chunks/** -text", "/authoring/*.assets/** -text"];
  const begin = "# BEGIN Spex managed storage rules";
  const end = "# END Spex managed storage rules";
  for (const [name, generated] of [[".gitignore", ignores], [".gitattributes", attributes]] as const) {
    const file = join(dir, name); const prior = existsSync(file) ? readFileSync(file, "utf8") : "";
    const lines = prior.split("\n"); if (lines.at(-1) === "") lines.pop();
    const authored: string[] = [];
    for (let i = 0; i < lines.length;) {
      if (lines[i] === begin) {
        const last = lines.indexOf(end, i + 1);
        if (last < 0) throw new StorageFormatError(file, "unterminated managed Git rules");
        i = last + 1;
      } else { authored.push(lines[i++]); }
    }
    const managed = [...generated, ...(name === ".gitignore" ? unsupported : [])];
    // Last matching Git rule wins, so move the single owned block last.
    const next = [...authored, begin, ...managed, end, ""].join("\n");
    if (next === prior) continue;
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, next, { mode: 0o600 }); renameSync(temporary, file);
  }
}

/** The environment Git runs with (space-32). */
export function gitEnvironment(captured: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...captured,
    GIT_TERMINAL_PROMPT: "0",
    LC_ALL: "C",
    LANG: "C",
    ...(captured.GIT_SSH_COMMAND ? {} : { GIT_SSH_COMMAND: "ssh -oBatchMode=yes" }),
  };
}

/** The `-c` prefix every commit-writing command carries (space-32). */
export function committerArgsSync(dir: string, env: NodeJS.ProcessEnv): string[] {
  const args = ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"];
  let identity = true;
  try { git(dir, ["var", "GIT_COMMITTER_IDENT"], env); } catch { identity = false; }
  if (!identity) args.push("-c", "user.name=Spex", "-c", `user.email=spex@${hostname()}`);
  return args;
}

/** The subject that begins a clone's `spex` branch at set-up (storage-6).
 * It says nothing about authorship of the files it records (space-59). */
export const SET_UP_SUBJECT = "Start the spex branch on ";

/** Make a clone a repository on a new `spex` branch with one commit of
 * what it holds (storage-6, space-32); a clone that already is one is
 * left alone. Returns whether a repository was made. */
export function initializeClone(dir: string, options: { env?: NodeJS.ProcessEnv; message?: string; unsupported?: string[]; generatedBootstrap?: boolean } = {}): boolean {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (existsSync(join(dir, ".git"))) return false;
  const env = gitEnvironment(options.env);
  const previous = process.umask(0o077);
  try {
    try { git(dir, ["init", "-q", "-b", SPEX_BRANCH], env); }
    catch { git(dir, ["init", "-q"], env); git(dir, ["symbolic-ref", "HEAD", `refs/heads/${SPEX_BRANCH}`], env); }
    prepareStorageGitFiles(dir, options.unsupported ?? []);
    git(dir, ["add", "-A", "--", "."], env);
    git(dir, [...committerArgsSync(dir, env), "commit", "-q", "--allow-empty", "-m", options.message ?? `${SET_UP_SUBJECT}${hostname()}`], env);
    if (options.generatedBootstrap) git(dir, ["config", "--local", "spex.bootstrap", git(dir, ["rev-parse", "HEAD"], env).toString("utf8").trim()], env);
  } catch (error) {
    rmSync(join(dir, ".git"), { recursive: true, force: true });
    throw error;
  } finally { process.umask(previous); }
  return true;
}

/** Commit what a clone holds now, where anything changed (storage-9). */
export function commitClone(dir: string, message: string, options: { env?: NodeJS.ProcessEnv; unsupported?: string[] } = {}): void {
  const env = gitEnvironment(options.env);
  const previous = process.umask(0o077);
  try {
    prepareStorageGitFiles(dir, options.unsupported ?? []);
    git(dir, ["add", "-A", "--", "."], env);
    try { git(dir, ["diff", "--cached", "--quiet"], env); return; } catch { /* something is staged */ }
    git(dir, [...committerArgsSync(dir, env), "commit", "-q", "-m", message], env);
  } finally { process.umask(previous); }
}
