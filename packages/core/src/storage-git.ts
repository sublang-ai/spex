// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One spex repository's `spex` branch as Git sees it (storage-10..12,
// storage-17): the whole units a merge selects, their plan against a
// common ancestor, the validated application of a selection, the
// managed Git rules, and a clone's first commit.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { resolveMachineIdentity } from "@sublang/playbook/machine-identity";
import { parseIntentFile, parsePrefs, parseProjectFile, type IntentFile, type StorageDiagnostic } from "./app-storage.js";
import { readJsonFile, StorageFormatError, UUID, writeApplicationFile } from "./files.js";
import { Home } from "./home.js";
import { i18n } from "./i18n.js";
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
const git = (dir: string, args: string[], env?: NodeJS.ProcessEnv): Buffer =>
  execFileSync("git", ["-C", dir, ...args], { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...(env ? { env } : {}) });
const revision = (dir: string, ref: string): string => git(dir, ["rev-parse", "--verify", `${ref}^{commit}`]).toString().trim();

/** Whether a path of a clone may leave the device: not one of the
 * catalog's ignored families (storage-1, storage-17). */
export const portable = (file: string): boolean =>
  !/^(packages\/|skills\/|local\/|\.spex-uploads\/|\.spex-apply\.json$|\.lock)/.test(file) &&
  !/\.(hints|spex)\.json$|(?<!^spex)\.lock(?:\.|\/|$)|\.tmp$|\.bak(?:\.|$)|\.backup(?:\.|$)/.test(file);

/** The unit a tracked path of a clone belongs to (storage-11, space-33). */
export function storageUnitName(file: string): string {
  const session = /^sessions\/([^/]+?)(?:\.records\.jsonl$|\.json$|\.assets\/)/.exec(file);
  if (session && UUID.test(session[1])) return `sessions/${session[1]}`;
  const intent = /^intents\/([^/]+?)(?:\.json$|\.assets\/)/.exec(file);
  if (intent && UUID.test(intent[1])) return `intents/${intent[1]}`;
  const authoring = /^authoring\/([^/]+?)(?:\.records\.jsonl$|\.json$|\.assets\/)/.exec(file);
  if (authoring && AUTHORING_ID.test(authoring[1])) return `authoring/${authoring[1]}`;
  if (file === "spex.yaml" || file === "spex.lock") return "environment";
  return file;
}

/** The files a bundle unit always names, present or not. */
function bundleFiles(name: string): string[] {
  if (/^sessions\//.test(name) || /^authoring\//.test(name)) return [`${name}.json`, `${name}.records.jsonl`];
  if (/^intents\//.test(name)) return [`${name}.json`];
  if (name === "environment") return ["spex.yaml", "spex.lock"];
  return [];
}

/** Every tracked blob of a revision or tree, as path → blob id. */
export function readStorageTree(dir: string, ref: string): StorageTree {
  const out = new Map<string, string>();
  for (const line of git(dir, ["ls-tree", "-rz", "--full-tree", ref]).toString().split("\0")) {
    if (!line) continue;
    const tab = line.indexOf("\t"); const file = line.slice(tab + 1); const [mode, type, oid] = line.slice(0, tab).split(" ");
    if (type !== "blob" || !["100644", "100755"].includes(mode)) throw new StorageFormatError(file, "tracked storage entries must be regular files");
    out.set(file, oid);
  }
  return out;
}
function equal(a: StorageTree, b: StorageTree, paths: string[]): boolean { return paths.every((p) => a.get(p) === b.get(p)); }
/** Group every tracked path of three trees into units and classify each
 * by complete bytes and existence under the selection rule (storage-11). */
export function planStorageUnits(trees: StorageTrees): StorageMergeUnit[] {
  const groups = new Map<string, Set<string>>();
  for (const file of new Set([...trees.ours.keys(), ...trees.theirs.keys(), ...trees.base.keys()])) {
    const name = storageUnitName(file);
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
function copySafe(source: string, target: string, top = true): void {
  if (!existsSync(source)) return;
  const stat = lstatSync(source);
  if (stat.isSymbolicLink() || !stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) throw new StorageFormatError(source, "unsafe storage path");
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const file of readdirSync(source)) {
      if (file === ".git" || file.startsWith(".lock") || file.endsWith(".lock") || file.includes(".lock.")) continue;
      // What never leaves the device needs no validation copy.
      if (top && (file === "packages" || file === "skills" || file === UPLOAD_STAGING)) continue;
      copySafe(join(source, file), join(target, file), false);
    }
  } else { mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); writeFileSync(target, readFileSync(source), { mode: 0o600 }); }
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

/** Validate a clone's complete tree without changing it (storage-12).
 * Public Playbook validation is the only authority for session bytes. */
export async function validateStorageTree(dir_: string, options: ValidateStorageOptions = {}): Promise<StorageDiagnostic[]> {
  const dir = resolve(dir_);
  const diagnostics: StorageDiagnostic[] = [];
  const projectFile = join(dir, "project.json");
  if (existsSync(projectFile)) parseProjectFile(readJsonFile(projectFile), projectFile);

  const { createAssetStore } = await import("@sublang/playbook/session-assets");
  const intentsDir = join(dir, "intents");
  const intents: IntentFile[] = [];
  const names = existsSync(intentsDir) ? readdirSync(intentsDir) : [];
  for (const name of names) {
    const file = join(intentsDir, name);
    if (name.endsWith(".json")) {
      if (!UUID.test(name.slice(0, -5))) throw new StorageFormatError(file, i18n._({ id: "filename must be an intent UUID",
        comment: "Storage diagnostic: an intent file's name is no intent id" }));
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
      const assets = createAssetStore({ directory: join(intentsDir, `${intent.id}.assets`) });
      try {
        await assets.prepare();
        for (const ref of intent.attachments) { const reader = await assets.openAsset(ref); await reader.close(); }
      } catch (cause) { throw new StorageFormatError(file, cause instanceof Error ? cause.message : String(cause)); }
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
  if (existsSync(authoringDir)) {
    const { parseStoredDraft } = await import("./drafts.js");
    for (const name of readdirSync(authoringDir)) {
      if (!name.endsWith(".json")) continue;
      const file = join(authoringDir, name);
      parseStoredDraft(readJsonFile(file), file, name.slice(0, -5));
    }
  }

  const config = join(dir, "config", "playbook.config.yaml");
  if (existsSync(config)) {
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
  if (existsSync(sessionsDir)) {
    const store = createSessionStore({ sessionsDir }); await store.prepare();
    for (const file of readdirSync(sessionsDir)) {
      if (!file.endsWith(".json") || !UUID.test(file.slice(0, -5))) continue;
      const id = file.slice(0, -5); const result = await store.validate(id);
      if (result.manifest.schemaVersion !== 7) {
        const tracked = options.selectedSessionIds?.has(id) ?? (existsSync(join(dir, ".git")) && git(dir, ["ls-files", "--", `sessions/${file}`]).length > 0);
        if (tracked) throw new StorageFormatError(file, "unsupported session version cannot be selected as portable data");
        diagnostics.push({ file: `sessions/${file}`, reason: `unsupported session version ${result.manifest.schemaVersion}; retained locally`, blocking: false });
        continue;
      }
      validateSessionManifest(result.manifest);
      if (!result.integrityValid) throw new StorageFormatError(file, result.history.damage?.reason ?? "session replay is missing, damaged or disagrees with its checkpoint");
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

/** The session ids a plan's units name. */
const sessionUnits = (units: StorageMergeUnit[]): string[] => units.filter((u) => /^sessions\/[0-9a-f-]{36}$/.test(u.name)).map((u) => u.name.slice(9));

export interface ApplyStorageOptions {
  /** The caller — the running core — already holds every session's
   * management lease; otherwise they are taken here for the write. */
  holdsSessionLeases?: boolean;
  /** Runs after the complete candidate validated and before the first
   * file is replaced: the core records its repair marker here (space-31). */
  beforeWrite?: () => void;
  /** `local/prefs.json`, whose viewed markers of changed sessions clear. */
  prefsFile?: string;
  validate?: Omit<ValidateStorageOptions, "selectedSessionIds">;
}
export interface AppliedStorageSelection {
  diagnostics: StorageDiagnostic[];
  /** Session units whose bytes changed from `ours`: their hints and
   * viewed markers were cleared (storage-21). */
  changedSessions: string[];
  selected: Map<string, StorageChoice>;
}

/**
 * Apply a resolved selection in a clone by the rules `select` applies
 * (storage-21, space-19): stage the chosen blobs in a scratch copy,
 * validate the complete candidate, then replace files atomically —
 * replay before manifest, deletions last — clear hints and viewed
 * markers of every changed session, and stage every selected path. The
 * caller holds the home lease: the CLI reserves it, the core owns it.
 */
export async function applyStorageSelection(dir_: string, plan: StorageMergePlan, choices: Record<string, StorageChoice>, options: ApplyStorageOptions = {}): Promise<AppliedStorageSelection> {
  const dir = resolve(dir_);
  if (plan.base === null) throw new Error("storage branches have no common ancestor; join them explicitly to compare against the empty tree");
  const selected = resolveStorageChoices(plan.units, choices);
  const leases: { release(): Promise<unknown> }[] = [];
  const stage = mkdtempSync(join(tmpdir(), "spex-storage-selection-"));
  try {
    const priorFiles = readStorageTree(dir, plan.ours);
    const trees = { ours: priorFiles, theirs: readStorageTree(dir, plan.theirs) };
    const changedSessions = new Set<string>();
    copySafe(dir, stage);
    for (const unit of plan.units) {
      const files = trees[selected.get(unit.name) as StorageChoice];
      if (unit.name.startsWith("sessions/") && !equal(priorFiles, files, unit.paths)) changedSessions.add(unit.name);
      const present = (path: string): boolean => files.has(path);
      const assets = unit.paths.some((path) => path.startsWith(`${unit.name}.assets/`) && present(path));
      if (/^sessions\/[0-9a-f-]{36}$/.test(unit.name)) {
        const manifest = present(`${unit.name}.json`);
        const replay = present(`${unit.name}.records.jsonl`);
        if (manifest !== replay || (assets && !manifest)) throw new StorageFormatError(unit.name, "selected session requires its complete manifest, replay and asset bundle");
      } else if (/^(intents|authoring)\//.test(unit.name)) {
        const record = present(`${unit.name}.json`);
        const replay = present(`${unit.name}.records.jsonl`);
        if ((assets || replay) && !record) throw new StorageFormatError(unit.name, "selected unit requires its record with its attachments");
      }
      for (const file of unit.paths) {
        const target = join(stage, file); const oid = files.get(file);
        if (oid === undefined) rmSync(target, { force: true });
        else { mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); writeFileSync(target, git(dir, ["cat-file", "blob", oid]), { mode: 0o600 }); }
      }
    }
    const diagnostics = await validateStorageTree(stage, { ...(options.validate ?? {}), selectedSessionIds: new Set(sessionUnits(plan.units)) });
    if (!options.holdsSessionLeases) {
      const { createSessionStore } = await import("@sublang/playbook/session-store");
      const sessionsDir = join(dir, "sessions"); mkdirSync(sessionsDir, { recursive: true, mode: 0o700 });
      const shared = createSessionStore({ sessionsDir }); await shared.prepare();
      const ids = new Set(sessionUnits(plan.units));
      for (const file of readdirSync(sessionsDir)) if (file.endsWith(".json") && UUID.test(file.slice(0, -5))) ids.add(file.slice(0, -5));
      for (const id of [...ids].sort()) leases.push(await shared.acquireManagement(id));
    }
    for (const file of plan.units.flatMap((unit) => unit.paths)) {
      const target = join(dir, file);
      if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink() || lstatSync(target).nlink !== 1)) throw new StorageFormatError(file, "unsafe destination");
    }
    options.beforeWrite?.();
    const {createAssetStore} = await import("@sublang/playbook/session-assets");
    const assetDirectories = new Set(plan.units.flatMap((unit) => unit.paths)
      .filter((path) => path.includes(".assets/"))
      .map((path) => path.slice(0, path.indexOf(".assets/") + ".assets".length)));
    for (const directory of assetDirectories) await createAssetStore({directory: join(dir, directory)}).prepare();
    for (const unit of plan.units) {
      const publicationOrder = (path: string) => path.includes(".assets/") ? 0 : path.endsWith(".records.jsonl") ? 1 : 2;
      const ordered = [...unit.paths].sort((a, b) => publicationOrder(a) - publicationOrder(b) || a.localeCompare(b));
      for (const file of ordered) {
        const target = join(dir, file); const prepared = join(stage, file);
        if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink() || lstatSync(target).nlink !== 1)) throw new StorageFormatError(file, "unsafe destination");
        if (existsSync(prepared)) {
          mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
          const temporary = `${target}.${randomUUID()}.tmp`; writeFileSync(temporary, readFileSync(prepared), { mode: 0o600 }); renameSync(temporary, target);
        } else rmSync(target, { force: true });
      }
      // A local hint belongs to the previous exact checkpoint, never the selected branch.
      if (changedSessions.has(unit.name)) rmSync(join(dir, `${unit.name}.hints.json`), { force: true });
    }
    if (options.prefsFile && existsSync(options.prefsFile) && changedSessions.size > 0) {
      const prefs = parsePrefs(readJsonFile(options.prefsFile), options.prefsFile);
      for (const session of changedSessions) delete prefs[`viewed:${session.slice(9)}`];
      writeApplicationFile(options.prefsFile, { format: 1, prefs });
    }
    // Stage each selected path present in the work tree or the index; a
    // path absent from both — deleted on the chosen side and never
    // tracked here — has nothing to stage and would fail the pathspec.
    const paths = plan.units.flatMap((unit) => unit.paths);
    const indexed = new Set(paths.length ? git(dir, ["ls-files", "-z", "--", ...paths]).toString().split("\0").filter(Boolean) : []);
    const present = paths.filter((file) => indexed.has(file) || existsSync(join(dir, file)));
    if (present.length) git(dir, ["add", "-A", "--", ...present]);
    return { diagnostics, changedSessions: [...changedSessions], selected };
  } finally {
    try {
      const released = await Promise.allSettled(leases.reverse().map((lease) => lease.release()));
      const failed = released.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
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
      prefsFile: join(home, "local", "prefs.json"),
      validate: { own: key === loaded.own(), libraryDir: join(home, "playbooks") },
    });
    return { plan, diagnostics };
  } finally { releaseHome(); }
}

/** Install a clone's managed Git rules before its first commit and
 * before each sync, keeping authored rules (storage-17). */
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
  const attributes = ["*.json -text", "*.jsonl -text", "/intents/*.assets/** -text", "/sessions/*.assets/** -text", "/authoring/*.assets/** -text"];
  const begin = "# BEGIN Spex managed storage rules";
  const end = "# END Spex managed storage rules";
  mkdirSync(dir, { recursive: true });
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

/** Make a clone a repository on a new `spex` branch with one commit of
 * what it holds (storage-6, space-32); a clone that already is one is
 * left alone. Returns whether a repository was made. */
export function initializeClone(dir: string, options: { env?: NodeJS.ProcessEnv; message?: string; unsupported?: string[] } = {}): boolean {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (existsSync(join(dir, ".git"))) return false;
  const env = gitEnvironment(options.env);
  const previous = process.umask(0o077);
  try {
    try { git(dir, ["init", "-q", "-b", SPEX_BRANCH], env); }
    catch { git(dir, ["init", "-q"], env); git(dir, ["symbolic-ref", "HEAD", `refs/heads/${SPEX_BRANCH}`], env); }
    prepareStorageGitFiles(dir, options.unsupported ?? []);
    git(dir, ["add", "-A", "--", "."], env);
    git(dir, [...committerArgsSync(dir, env), "commit", "-q", "--allow-empty", "-m", options.message ?? `Start the spex branch on ${hostname()}`], env);
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
