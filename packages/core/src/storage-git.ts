// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { UUID, parsePrefs, readJsonFile, StorageFormatError, validateApplicationTree, validateIntentDispatches, writeApplicationFile, type StorageDiagnostic } from "./app-storage.js";

export type StorageChoice = "ours" | "theirs";
/** One whole-unit selection subject (storage-11): a session bundle, a
 * `playbooks/<id>/` directory, or one other tracked file. `changed`
 * says which sides differ from the ancestor, so a caller can tell a
 * local change from an incoming one without re-reading the trees. */
export interface StorageMergeUnit { name: string; paths: string[]; choice: StorageChoice | "conflict"; changed: { ours: boolean; theirs: boolean } }
/** `base` is null and `unrelated` true where the revisions share no
 * ancestor and the caller did not join them (storage-19). */
export interface StorageMergePlan { ours: string; theirs: string; base: string | null; unrelated: boolean; units: StorageMergeUnit[] }
/** A tree as path → blob id. */
export type StorageTree = Map<string, string>;
export interface StorageTrees { ours: StorageTree; theirs: StorageTree; base: StorageTree }
/** Git's well-known empty tree: the ancestor of a join (storage-11). */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const git = (home: string, args: string[]): Buffer => execFileSync("git", ["-C", home, ...args], { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const revision = (home: string, ref: string): string => git(home, ["rev-parse", "--verify", `${ref}^{commit}`]).toString().trim();
/** Whether a path may leave the device: not one of the catalog's
 * ignored families (storage-1, storage-17). */
export const portable = (file: string): boolean => !/^(local\/|\.lock|prefs\.json$|meta\.json$|forge-cache\.json$)/.test(file) && !/\.(hints|spex)\.json$|\.lock(?:\.|\/|$)|\.tmp$|\.bak(?:\.|$)|\.backup(?:\.|$)/.test(file);
/** The unit a tracked path belongs to (storage-11, space-33). */
export function storageUnitName(file: string): string {
  const session = /^sessions\/([^/]+?)(?:\.records\.jsonl|\.json)$/.exec(file);
  if (session && UUID.test(session[1])) return `sessions/${session[1]}`;
  const playbook = /^playbooks\/([^/]+)\/./.exec(file);
  return playbook ? `playbooks/${playbook[1]}` : file;
}
/** Every tracked blob of a revision or tree, as path → blob id. */
export function readStorageTree(home: string, ref: string): StorageTree {
  const out = new Map<string, string>();
  for (const line of git(home, ["ls-tree", "-rz", "--full-tree", ref]).toString().split("\0")) {
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
    if (name.startsWith("sessions/") && name !== file) { files.add(`${name}.json`); files.add(`${name}.records.jsonl`); }
    groups.set(name, files);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => {
    const paths = [...group].sort();
    const changed = { ours: !equal(trees.ours, trees.base, paths), theirs: !equal(trees.theirs, trees.base, paths) };
    const choice = equal(trees.ours, trees.theirs, paths) || !changed.theirs ? "ours" : !changed.ours ? "theirs" : "conflict";
    return { name, paths, choice, changed };
  });
}
/** Plan two revisions against their common ancestor; with `join`, two
 * unrelated histories compare against the empty tree (storage-19). */
export function planStorageMerge(home: string, oursRef: string, theirsRef: string, options: { join?: boolean } = {}): StorageMergePlan {
  const ours = revision(home, oursRef); const theirs = revision(home, theirsRef);
  let base: string | null;
  try { base = git(home, ["merge-base", ours, theirs]).toString().trim(); } catch { base = null; }
  const unrelated = base === null;
  if (unrelated && !options.join) return { ours, theirs, base, unrelated, units: [] };
  const ancestor = base ?? EMPTY_TREE;
  const trees = { ours: readStorageTree(home, ours), theirs: readStorageTree(home, theirs), base: readStorageTree(home, ancestor) };
  return { ours, theirs, base: ancestor, unrelated, units: planStorageUnits(trees) };
}
/** Every unit's selected side: unknown units, unresolved conflicts and
 * choices contrary to a decided unit are refused (storage-20). */
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

/** Fail-closed reservation in the core's existing home-lease namespace. */
export function reserveStorageHome(home: string): () => void {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const token = randomUUID(); const stage = join(home, `.lock.stage.${token}`); const lock = join(home, ".lock");
  mkdirSync(stage, { mode: 0o700 });
  writeApplicationFile(join(stage, "owner.json"), { pid: process.pid, hostname: hostname(), acquiredAt: Date.now(), token });
  try { renameSync(stage, lock); } catch { rmSync(stage, { recursive: true, force: true }); throw new Error("stop the Spex core before changing stored data; the home lease is held or cannot be verified"); }
  return () => {
    try { if ((readJsonFile(join(lock, "owner.json")) as { token?: string }).token === token) rmSync(lock, { recursive: true }); } catch { /* Never remove an unproven owner. */ }
  };
}
function copySafe(source: string, target: string): void {
  if (!existsSync(source)) return;
  const stat = lstatSync(source);
  if (stat.isSymbolicLink() || !stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) throw new StorageFormatError(source, "unsafe storage path");
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const file of readdirSync(source)) {
      if (file === ".git" || file.startsWith(".lock") || file.endsWith(".lock") || file.includes(".lock.")) continue;
      copySafe(join(source, file), join(target, file));
    }
  } else { mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); writeFileSync(target, readFileSync(source), { mode: 0o600 }); }
}

/** Public Playbook validation is the only authority for session bytes. */
export async function validateStorageTree(home: string, selectedSessionIds?: ReadonlySet<string>): Promise<StorageDiagnostic[]> {
  const app = validateApplicationTree(home); const diagnostics = [...app.diagnostics];
  const config = join(home, "playbook", "playbook.config.yaml");
  if (existsSync(config)) {
    const document = parseDocument(readFileSync(config, "utf8"));
    if (document.errors.length) throw new StorageFormatError(config, document.errors[0].message);
    const { composeConfig } = await import("./config.js");
    try { await composeConfig(document.toJS(), undefined, config); }
    catch (error) {
      const reason = (error as Error).message;
      if (reason.includes("failed to import") || reason.includes("recompile")) diagnostics.push({ file: config, reason, blocking: false });
      else throw new StorageFormatError(config, reason);
    }
  }
  const { createSessionStore, validateSessionManifest } = await import("@sublang/playbook/session-store");
  const sessionsDir = join(home, "sessions"); if (!existsSync(sessionsDir)) return diagnostics;
  const store = createSessionStore({ sessionsDir }); await store.prepare();
  const sessions = new Map<string, { projectId?: string; turns: Set<number> }>();
  for (const file of readdirSync(sessionsDir)) {
    if (!file.endsWith(".json") || !UUID.test(file.slice(0, -5))) continue;
    const id = file.slice(0, -5); const result = await store.validate(id);
    if (result.manifest.schemaVersion !== 7) {
      const tracked = selectedSessionIds?.has(id) ?? (existsSync(join(home, ".git")) && git(home, ["ls-files", "--", `sessions/${file}`]).length > 0);
      if (tracked) throw new StorageFormatError(file, "unsupported session version cannot be selected as portable data");
      diagnostics.push({ file: `sessions/${file}`, reason: `unsupported session version ${result.manifest.schemaVersion}; retained locally`, blocking: false });
      continue;
    }
    const manifest = validateSessionManifest(result.manifest);
    if (!result.integrityValid) throw new StorageFormatError(file, result.history.damage?.reason ?? "session replay is missing, damaged or disagrees with its checkpoint");
    const bindings = app.bindings.filter((b) => b.path === manifest.cwd || b.aliases.includes(manifest.cwd));
    const bound = bindings.length === 1 && app.projects.some((p) => p.id === bindings[0].id) ? bindings[0].id : undefined;
    if (!bound) diagnostics.push({ file: `sessions/${file}`, reason: `unresolved project working directory ${manifest.cwd}`, blocking: false });
    const turns = new Set<number>();
    for (const entry of result.history.entries) if (entry.record.type === "turn_started" && Number.isSafeInteger(entry.record.turnId)) turns.add(entry.record.turnId as number);
    sessions.set(id, { projectId: bound, turns });
  }
  validateIntentDispatches(app.intents, sessions);
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
}
export interface AppliedStorageSelection {
  diagnostics: StorageDiagnostic[];
  /** Session units whose bytes changed from `ours`: their hints and
   * viewed markers were cleared (storage-20). */
  changedSessions: string[];
  selected: Map<string, StorageChoice>;
}

/**
 * Apply a resolved selection by the rules `select` applies (storage-20,
 * space-19): stage the chosen blobs in a scratch copy, validate the
 * complete candidate, then replace files atomically — replay before
 * manifest, deletions last — clear hints and viewed markers of every
 * changed session, and stage every selected path. The caller holds the
 * home lease: the CLI reserves it, the running core already owns it.
 */
export async function applyStorageSelection(home_: string, plan: StorageMergePlan, choices: Record<string, StorageChoice>, options: ApplyStorageOptions = {}): Promise<AppliedStorageSelection> {
  const home = resolve(home_);
  if (plan.base === null) throw new Error("storage branches have no common ancestor; join them explicitly to compare against the empty tree");
  const selected = resolveStorageChoices(plan.units, choices);
  const leases: { release(): Promise<unknown> }[] = [];
  const stage = mkdtempSync(join(tmpdir(), "spex-storage-selection-"));
  try {
    const priorFiles = readStorageTree(home, plan.ours);
    const trees = { ours: priorFiles, theirs: readStorageTree(home, plan.theirs) };
    const changedSessions = new Set<string>();
    copySafe(home, stage);
    for (const unit of plan.units) {
      const files = trees[selected.get(unit.name) as StorageChoice];
      if (unit.name.startsWith("sessions/") && !equal(priorFiles, files, unit.paths)) changedSessions.add(unit.name);
      if (unit.name.startsWith("sessions/") && unit.paths.length === 2 && unit.paths.filter((p) => files.has(p)).length === 1) throw new StorageFormatError(unit.name, "selected session requires both manifest and replay from one revision");
      for (const file of unit.paths) {
        const target = join(stage, file); const oid = files.get(file);
        if (oid === undefined) rmSync(target, { force: true });
        else { mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); writeFileSync(target, git(home, ["cat-file", "blob", oid]), { mode: 0o600 }); }
      }
    }
    const diagnostics = await validateStorageTree(stage, new Set(sessionUnits(plan.units)));
    if (!options.holdsSessionLeases) {
      const { createSessionStore } = await import("@sublang/playbook/session-store");
      const sessionsDir = join(home, "sessions"); mkdirSync(sessionsDir, { recursive: true, mode: 0o700 });
      const shared = createSessionStore({ sessionsDir }); await shared.prepare();
      const ids = new Set(sessionUnits(plan.units));
      for (const file of readdirSync(sessionsDir)) if (file.endsWith(".json") && UUID.test(file.slice(0, -5))) ids.add(file.slice(0, -5));
      for (const id of [...ids].sort()) leases.push(await shared.acquireManagement(id));
    }
    for (const file of plan.units.flatMap((unit) => unit.paths)) {
      const target = join(home, file);
      if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink() || lstatSync(target).nlink !== 1)) throw new StorageFormatError(file, "unsafe destination");
    }
    options.beforeWrite?.();
    for (const unit of plan.units) {
      const ordered = [...unit.paths].sort((a, b) => Number(a.endsWith(".records.jsonl")) === Number(b.endsWith(".records.jsonl")) ? a.localeCompare(b) : a.endsWith(".records.jsonl") ? -1 : 1);
      for (const file of ordered) {
        const target = join(home, file); const prepared = join(stage, file);
        if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink() || lstatSync(target).nlink !== 1)) throw new StorageFormatError(file, "unsafe destination");
        if (existsSync(prepared)) {
          mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
          const temporary = `${target}.${randomUUID()}.tmp`; writeFileSync(temporary, readFileSync(prepared), { mode: 0o600 }); renameSync(temporary, target);
        } else rmSync(target, { force: true });
      }
      // A local hint belongs to the previous exact checkpoint, never the selected branch.
      if (changedSessions.has(unit.name)) rmSync(join(home, `${unit.name}.hints.json`), { force: true });
    }
    const prefsFile = join(home, "prefs.json");
    if (existsSync(prefsFile)) {
      const prefs = parsePrefs(readJsonFile(prefsFile));
      for (const session of changedSessions) delete prefs[`viewed:${session.slice(9)}`];
      writeApplicationFile(prefsFile, { v: 1, prefs });
    }
    // Stage each selected path present in the work tree or the index; a
    // path absent from both — deleted on the chosen side and never
    // tracked here — has nothing to stage and would fail the pathspec.
    const paths = plan.units.flatMap((unit) => unit.paths);
    const indexed = new Set(paths.length ? git(home, ["ls-files", "-z", "--", ...paths]).toString().split("\0").filter(Boolean) : []);
    const present = paths.filter((file) => indexed.has(file) || existsSync(join(home, file)));
    if (present.length) git(home, ["add", "-A", "--", ...present]);
    return { diagnostics, changedSessions: [...changedSessions], selected };
  } finally {
    try {
      const released = await Promise.allSettled(leases.reverse().map((lease) => lease.release()));
      const failed = released.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
}

/** Select into an in-progress ordinary Git merge; leave committing to Git. */
export async function selectStorageMerge(home_: string, choices: Record<string, StorageChoice> = {}, options: { join?: boolean } = {}): Promise<{ plan: StorageMergePlan; diagnostics: StorageDiagnostic[] }> {
  const home = resolve(home_); const releaseHome = reserveStorageHome(home);
  try {
    const plan = planStorageMerge(home, "HEAD", "MERGE_HEAD", options);
    const { diagnostics } = await applyStorageSelection(home, plan, choices);
    return { plan, diagnostics };
  } finally { releaseHome(); }
}

/** Install tracked Git rules after validated migration, before first tracking. */
export function prepareStorageGitFiles(home: string, unsupportedPaths: string[] = []): void {
  const ignores = ["/local/", "/prefs.json", "/meta.json", "/forge-cache.json", "/.lock*", "*.hints.json", "*.spex.json", "*.lock", "*.lock.*", "*.tmp", "*.bak", "*.bak.*", "*.backup", "*.backup.*"];
  const unsupported = [...new Set(unsupportedPaths)].sort().map((file) => {
    if (file.startsWith("/") || file.split("/").includes("..") || /[\r\n\0*?\[\]\\]/.test(file)) throw new Error(`unsafe ignore path ${file}`);
    return `/${file}`;
  });
  const attributes = ["*.json -text", "*.jsonl -text"];
  const begin = "# BEGIN Spex managed storage rules";
  const end = "# END Spex managed storage rules";
  for (const [name, generated] of [[".gitignore", ignores], [".gitattributes", attributes]] as const) {
    const file = join(home, name); const prior = existsSync(file) ? readFileSync(file, "utf8") : "";
    const lines = prior.split("\n"); if (lines.at(-1) === "") lines.pop();
    const authored: string[] = [];
    for (let i = 0; i < lines.length;) {
      if (lines[i] === begin) {
        const last = lines.indexOf(end, i + 1);
        if (last < 0) throw new StorageFormatError(file, "unterminated managed Git rules");
        i = last + 1;
      } else if (generated.every((line, offset) => lines[i + offset] === line)) {
        // Upgrade only the old generator's exact contiguous block and
        // immediately following session-bundle pairs. Keep authored rules.
        i += generated.length;
        if (name === ".gitignore") while (/^\/(?:[^/]+\/)+[0-9a-f-]{36}\.json$/.test(lines[i] ?? "") && lines[i + 1] === lines[i].replace(/\.json$/, ".records.jsonl")) i += 2;
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
