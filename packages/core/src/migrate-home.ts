// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one-time migration from the former home (storage-9, DR-103): the
// one repository with `projects.json`, act logs and one sessions folder
// becomes a home of spex repositories under `workspace/`, run once under
// the home lease with old writers stopped, leaving a receipt.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync,
} from "node:fs";
import { basename, join } from "node:path";
import { parseDocument } from "yaml";
import {
  foldFormerIntentActs, parseFormerBindings, parseFormerIntentLog, parseFormerPrefs, parseFormerRegistry, parsePrefs,
  parseProjectFile, writeIntentFile, type FormerIntent, type IntentFile,
} from "./app-storage.js";
import { isObject, need, readJsonFile, sha256, StorageFormatError, UUID, writeApplicationBytes, writeApplicationFile } from "./files.js";
import { Home, repositoryNameFor } from "./home.js";
import { i18n } from "./i18n.js";
import { commitClone, gitEnvironment, initializeClone, validateStorageTree } from "./storage-git.js";

export interface GroupsReceipt {
  format: 1;
  id: string;
  kind: "groups";
  inputs: { path: string; sha256: string }[];
  steps: Record<string, unknown>[];
  complete: boolean;
}

/** The former layout's files the migration rewrites, moves away or
 * deletes; their original bytes are kept under the receipt. */
const INPUTS = ["projects.json", "local/project-paths.json", "prefs.json", "forge-cache.json", "config/playbook.config.yaml", ".gitignore", ".gitattributes"];
/** What marks a home written by the former layout. */
const FORMER_MARKERS = ["projects.json", "prefs.json", "intents", "sessions", "config/playbook.config.yaml", "forge-cache.json"];

function migrationsDir(root: string): string { return join(root, "local", "migrations"); }

function findIncompleteReceipt(root: string): { receipt: GroupsReceipt; dir: string } | undefined {
  const migrations = migrationsDir(root);
  if (!existsSync(migrations)) return undefined;
  for (const id of readdirSync(migrations).sort()) {
    const file = join(migrations, id, "receipt.json");
    if (!existsSync(file)) continue;
    let value: unknown;
    try { value = readJsonFile(file); } catch { continue; }
    if (isObject(value) && value.kind === "groups" && value.complete === false) return { receipt: value as unknown as GroupsReceipt, dir: join(migrations, id) };
  }
  return undefined;
}

/** Whether the home must migrate before writers are admitted: an
 * interrupted migration, or the former layout with no `home.yaml`. */
export function needsGroupsMigration(root: string): boolean {
  if (findIncompleteReceipt(root)) return true;
  if (Home.exists(root)) return false;
  return FORMER_MARKERS.some((path) => existsSync(join(root, path)));
}

const divergedDestination = (): string =>
  i18n._({ id: "migration destination diverged; preserved unchanged",
    comment: "Migration diagnostic: the file changed under the migration, which wrote nothing" });

/** Write bytes where nothing stands, or where the same bytes already
 * do; a divergent destination is never overwritten (storage-9). */
function publish(file: string, bytes: Buffer | string): void {
  const expected = Buffer.from(bytes);
  if (existsSync(file)) {
    if (readFileSync(file).equals(expected)) return;
    throw new StorageFormatError(file, divergedDestination());
  }
  mkdirSync(join(file, ".."), { recursive: true });
  writeApplicationBytes(file, expected);
}

/** Move a path into place; one already there from an earlier attempt stands. */
function move(source: string, target: string): void {
  if (!existsSync(source)) return;
  if (existsSync(target)) throw new StorageFormatError(target, divergedDestination());
  mkdirSync(join(target, ".."), { recursive: true, mode: 0o700 });
  renameSync(source, target);
}

/** The code's remote as the folder's `origin` reports it, a credential
 * before the host never written (storage-3, space-5). */
export function folderRemote(folder: string, env?: NodeJS.ProcessEnv): string | null {
  try {
    const url = execFileSync("git", ["-C", folder, "remote", "get-url", "origin"], { env: gitEnvironment(env), stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).toString().trim();
    if (!url || /\s/.test(url)) return null;
    return url.replace(/^(https?:\/\/)[^/@]*@/i, "$1");
  } catch { return null; }
}

/** Whether a turn the intent attributes ended finished (DR-038), read
 * from the session's replay stream wherever it now lies. */
function worked(intent: FormerIntent, dispatches: Map<string, { intentId: string; turnId: number }[]>, streams: (sessionId: string) => string | undefined): boolean {
  const bound = intent.dispatched;
  if (!bound) return false;
  const next = (dispatches.get(bound.sessionId) ?? []).find((entry) => entry.turnId > bound.turnId && entry.intentId !== intent.id)?.turnId ?? Number.POSITIVE_INFINITY;
  const stream = streams(bound.sessionId);
  if (!stream) return false;
  for (const line of stream.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = (JSON.parse(line) as { record?: { type?: unknown; turnId?: unknown } }).record;
      if (record?.type === "turn_finished" && typeof record.turnId === "number" && record.turnId >= bound.turnId && record.turnId < next) return true;
    } catch { break; }
  }
  return false;
}

/** Sessions Playbook has yet to convert stay out of the first history:
 * a manifest of another schema, or a replay with no manifest. */
export function unsupportedSessionPaths(dir: string): string[] {
  const sessions = join(dir, "sessions");
  if (!existsSync(sessions)) return [];
  const names = readdirSync(sessions);
  const out: string[] = [];
  for (const name of names) {
    const match = /^([0-9a-f-]{36})\.records\.jsonl$/.exec(name);
    if (!match) continue;
    let supported = false;
    try { supported = (readJsonFile(join(sessions, `${match[1]}.json`)) as { schemaVersion?: unknown }).schemaVersion === 7; } catch { supported = false; }
    if (!supported) out.push(`sessions/${match[1]}.json`, `sessions/${match[1]}.records.jsonl`);
  }
  return out;
}

function copyAssets(fromDir: string, toDir: string, assetIds: string[]): void {
  if (assetIds.length === 0) return;
  mkdirSync(toDir, { recursive: true, mode: 0o700 });
  chmodSync(toDir, 0o700);
  for (const assetId of assetIds) {
    const hex = assetId.replace(/^sha256:/, "");
    for (const name of [hex, `${hex}.json`]) {
      const target = join(toDir, name);
      if (existsSync(target)) continue;
      const source = join(fromDir, name);
      if (!existsSync(source)) throw new StorageFormatError(source, i18n._({ id: "an attachment the intent names is missing",
        comment: "Migration diagnostic: a stored intent references an attachment whose bytes are gone" }));
      copyFileSync(source, target);
      chmodSync(target, 0o600);
    }
  }
}

/**
 * Migrate the former home in place (storage-9). Restart-safe: an
 * interrupted run resumes from its receipt, verifying what it already
 * wrote and never overwriting a destination that diverged.
 */
export async function migrateFormerHome(root: string, options: { env?: NodeJS.ProcessEnv; own?: string; libraryDir?: string } = {}): Promise<GroupsReceipt> {
  const migrations = migrationsDir(root);
  mkdirSync(migrations, { recursive: true, mode: 0o700 });

  // 1 — the receipt, with every input's original bytes kept.
  let found = findIncompleteReceipt(root);
  if (!found) {
    const id = randomUUID(); const dir = join(migrations, id);
    mkdirSync(join(dir, "inputs"), { recursive: true, mode: 0o700 });
    const inputs: GroupsReceipt["inputs"] = [];
    const candidates = [...INPUTS];
    const intentsDir = join(root, "intents");
    if (existsSync(intentsDir)) for (const name of readdirSync(intentsDir).sort()) if (/^[0-9a-f-]{36}\.jsonl$/.test(name)) candidates.push(`intents/${name}`);
    for (const path of candidates) {
      const file = join(root, path);
      if (!existsSync(file) || !statSync(file).isFile()) continue;
      const bytes = readFileSync(file);
      writeApplicationBytes(join(dir, "inputs", String(inputs.length)), bytes);
      inputs.push({ path, sha256: sha256(bytes) });
    }
    const receipt: GroupsReceipt = { format: 1, id, kind: "groups", inputs, steps: [], complete: false };
    writeApplicationFile(join(dir, "receipt.json"), receipt);
    found = { receipt, dir };
  }
  const { receipt, dir: receiptDir } = found;
  const save = (): void => writeApplicationFile(join(receiptDir, "receipt.json"), receipt);
  const step = (name: string): Record<string, unknown> | undefined => receipt.steps.find((entry) => entry.step === name);
  const record = (entry: Record<string, unknown>): void => {
    receipt.steps = [...receipt.steps.filter((prior) => !(prior.step === entry.step && prior.repository === entry.repository)), entry];
    save();
  };
  const input = (path: string): Buffer | undefined => {
    const index = receipt.inputs.findIndex((entry) => entry.path === path);
    if (index < 0) return undefined;
    const file = join(receiptDir, "inputs", String(index));
    const bytes = readFileSync(file);
    need(sha256(bytes) === receipt.inputs[index].sha256, file, i18n._({ id: "invalid migration receipt or retained input",
      comment: "Migration diagnostic: the kept original no longer matches its receipt" }));
    return bytes;
  };
  const json = (path: string): unknown => {
    const bytes = input(path);
    if (!bytes) return undefined;
    try { return JSON.parse(bytes.toString("utf8")); }
    catch { throw new StorageFormatError(join(root, path), i18n._({ id: "invalid JSON", comment: "Migration diagnostic: the file to migrate is not readable JSON" })); }
  };

  // The former facts, read from the kept inputs alone.
  const registry = json("projects.json");
  const projects = registry === undefined ? [] : parseFormerRegistry(registry, join(root, "projects.json"));
  const bindingsValue = json("local/project-paths.json");
  const bindings = new Map((bindingsValue === undefined ? [] : parseFormerBindings(bindingsValue, join(root, "local/project-paths.json"))).map((b) => [b.id, b]));
  for (const project of projects) if (project.path && !bindings.has(project.id)) bindings.set(project.id, { id: project.id, path: project.path, aliases: [] });
  const prefsValue = json("prefs.json");
  const prefs = prefsValue === undefined ? {} : parseFormerPrefs(prefsValue, join(root, "prefs.json"));
  const folded = new Map<string, ReturnType<typeof foldFormerIntentActs>>();
  for (const entry of receipt.inputs) {
    const match = /^intents\/([0-9a-f-]{36})\.jsonl$/.exec(entry.path);
    if (!match) continue;
    const file = join(root, entry.path);
    folded.set(match[1], foldFormerIntentActs(parseFormerIntentLog(input(entry.path)!.toString("utf8"), match[1], file), file));
  }

  // 2 — home.yaml: your own group under this device's user name, one
  // working folder per project whose path this device recorded.
  // A home already in the groups layout — a legacy store imported late
  // (core-service-64) — keeps its file: a project whose folder it pairs
  // merges into that clone, what is already there winning.
  let plan = step("home")?.projects as Record<string, string> | undefined;
  const merging = step("home")?.merged === true || (Home.exists(root) && !plan);
  let home: Home = Home.exists(root)
    ? Home.load(root)
    : Home.create(root, { ...(options.own ? { own: options.own } : {}), ...(options.env ? { env: options.env } : {}) });
  if (!plan) {
    const taken = new Set([home.own(), ...home.folders().map((folder) => folder.repository)]);
    plan = {};
    for (const project of projects) {
      const binding = bindings.get(project.id);
      const paired = binding ? home.keyForFolder(binding.path) : undefined;
      if (paired) { plan[project.id] = paired; continue; }
      const base = repositoryNameFor(binding ? basename(binding.path) : project.name).slice(0, -"-spex".length);
      let key = `${home.ownName}/${base}-spex`;
      for (let n = 2; taken.has(key) || existsSync(home.clonePath(key)); n += 1) key = `${home.ownName}/${base}-${n}-spex`;
      taken.add(key);
      plan[project.id] = key;
      if (binding) home.pair(binding.path, key, binding.aliases);
    }
    record({ step: "home", own: home.ownName, projects: plan, merged: merging });
    home.save();
  }
  home = Home.load(root);
  const keyOf = (projectId: string): string | undefined => plan![projectId];

  // Where every former session goes: the project whose working folder
  // its directory resolves to, else your own group (storage-9).
  const formerSessions = join(root, "sessions");
  const owner = (sessionId: string): string => {
    let cwd: unknown; let projectId: unknown;
    try { cwd = (readJsonFile(join(formerSessions, `${sessionId}.json`)) as { cwd?: unknown }).cwd; } catch { cwd = undefined; }
    try { projectId = (readJsonFile(join(formerSessions, `${sessionId}.spex.json`)) as { projectId?: unknown }).projectId; } catch { projectId = undefined; }
    if (typeof cwd === "string") {
      const matches = [...bindings.values()].filter((b) => b.path === cwd || b.aliases.includes(cwd as string));
      if (matches.length === 1 && keyOf(matches[0].id)) return keyOf(matches[0].id)!;
    }
    if (typeof projectId === "string" && keyOf(projectId) && bindings.has(projectId)) return keyOf(projectId)!;
    return home.own();
  };
  const sessionIds = existsSync(formerSessions)
    ? [...new Set(readdirSync(formerSessions).flatMap((name) => {
        const match = /^([0-9a-f-]{36})(?:\.json|\.records\.jsonl|\.spex\.json)$/.exec(name);
        return match && UUID.test(match[1]) ? [match[1]] : [];
      }))].sort()
    : [];
  const placement = new Map(sessionIds.map((id) => [id, owner(id)]));
  const streamOf = (sessionId: string): string | undefined => {
    for (const candidate of [join(formerSessions, `${sessionId}.records.jsonl`), ...Object.values(plan!).concat(home.own()).map((key) => join(home.clonePath(key), "sessions", `${sessionId}.records.jsonl`))]) {
      if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    }
    return undefined;
  };
  const dispatches = new Map<string, { intentId: string; turnId: number }[]>();
  for (const { intents } of folded.values()) for (const intent of intents.values()) {
    if (!intent.dispatched) continue;
    const list = dispatches.get(intent.dispatched.sessionId) ?? [];
    list.push({ intentId: intent.id, turnId: intent.dispatched.turnId });
    dispatches.set(intent.dispatched.sessionId, list.sort((a, b) => a.turnId - b.turnId));
  }
  const moveSessions = (key: string): number => {
    const target = join(home.clonePath(key), "sessions");
    mkdirSync(target, { recursive: true, mode: 0o700 });
    let moved = 0;
    for (const [id, destination] of placement) {
      if (destination !== key) continue;
      for (const suffix of [".records.jsonl", ".assets", ".hints.json", ".spex.json", ".json"]) {
        const source = join(formerSessions, `${id}${suffix}`);
        if (!existsSync(source)) continue;
        // A session the clone already holds wins over a late legacy copy.
        if (merging && existsSync(join(target, `${id}${suffix}`))) continue;
        move(source, join(target, `${id}${suffix}`));
        if (suffix === ".records.jsonl") moved += 1;
      }
    }
    return moved;
  };

  // 3 — one spex repository per project.
  for (const project of projects) {
    const key = keyOf(project.id)!;
    const dir = home.clonePath(key);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const replay = folded.get(project.id);
    let written = 0;
    for (const intent of replay?.intents.values() ?? []) {
      if (replay!.removed.has(intent.id)) continue;
      if (intent.closedAs === "dropped" && !worked(intent, dispatches, streamOf)) continue;
      const file: IntentFile = {
        format: 1, id: intent.id, text: intent.text,
        ...(intent.attachments?.length ? { attachments: intent.attachments } : {}),
        ...(intent.source ? { source: intent.source } : {}),
        createdAt: intent.createdAt,
        ...(intent.dispatched ? { dispatched: intent.dispatched } : {}),
        ...(intent.closedAt !== undefined && intent.closedAs ? { closed: { as: intent.closedAs, at: intent.closedAt } } : {}),
      };
      // An intent the clone already holds wins (a late legacy import).
      if (merging && existsSync(join(dir, "intents", `${intent.id}.json`))) continue;
      copyAssets(join(root, "intents", `${project.id}.assets`), join(dir, "intents", `${intent.id}.assets`), (intent.attachments ?? []).map((asset) => asset.assetId));
      writeIntentFile(join(dir, "intents"), file);
      written += 1;
    }
    const sessions = moveSessions(key);
    const binding = bindings.get(project.id);
    const projectFile = join(dir, "project.json");
    if (!existsSync(projectFile)) {
      writeApplicationFile(projectFile, { format: 1, name: project.name, remote: binding ? folderRemote(binding.path, options.env) : null });
    }
    parseProjectFile(readJsonFile(projectFile), projectFile);
    record({ step: "project", repository: key, project: project.id, intents: written, sessions });
  }

  // 4 — your own group's spex repository: the configuration with every
  // `from` dropped, and the sessions that resolve to no project.
  const ownDir = home.clonePath(home.own());
  mkdirSync(ownDir, { recursive: true, mode: 0o700 });
  const config = input("config/playbook.config.yaml");
  if (config) {
    const document = parseDocument(config.toString("utf8"));
    const dropped: { id: string; from: unknown }[] = [];
    const playbooks = document.get("playbooks");
    if (playbooks && typeof (playbooks as { items?: unknown }).items === "object") {
      for (const pair of (playbooks as { items: { key: { value?: unknown } | unknown; value: unknown }[] }).items) {
        const id = String((pair.key as { value?: unknown })?.value ?? pair.key);
        const from = document.getIn(["playbooks", id, "from"]);
        if (from === undefined) continue;
        dropped.push({ id, from });
        document.deleteIn(["playbooks", id, "from"]);
      }
    }
    publish(join(ownDir, "config", "playbook.config.yaml"), document.errors.length ? config : document.toString());
    record({ step: "config", dropped });
    const formerConfig = join(root, "config");
    rmSync(join(formerConfig, "playbook.config.yaml"), { force: true });
    if (existsSync(formerConfig)) {
      for (const name of readdirSync(formerConfig)) {
        const target = join(ownDir, "config", name);
        if (!existsSync(target)) move(join(formerConfig, name), target);
      }
      try { rmdirSync(formerConfig); } catch { /* something of the reader's stays */ }
    }
  }
  const ownSessions = moveSessions(home.own());
  record({ step: "own", repository: home.own(), sessions: ownSessions });

  // 5 — preferences under local/, the former Git history kept aside,
  // the library and drafts left in place as retired.
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (key === "space:lastSync") continue;
    const draft = /^draft:(.+):player$/.exec(key);
    converted[draft ? `authoring:${draft[1]}:player` : key] = value;
  }
  mkdirSync(join(root, "local"), { recursive: true, mode: 0o700 });
  const prefsFile = join(root, "local", "prefs.json");
  if (merging && existsSync(prefsFile)) {
    // What the home holds is newer than a late legacy import.
    writeApplicationFile(prefsFile, { format: 1, prefs: { ...converted, ...parsePrefs(readJsonFile(prefsFile), prefsFile) } });
  } else publish(prefsFile, JSON.stringify({ format: 1, prefs: converted }));
  const formerGit = join(root, ".git");
  if (existsSync(formerGit)) move(formerGit, join(root, "local", "former-home.git"));
  for (const path of ["prefs.json", "forge-cache.json", "projects.json", "local/project-paths.json", ".gitignore", ".gitattributes"]) {
    rmSync(join(root, path), { force: true });
  }
  rmSync(join(root, "intents"), { recursive: true, force: true });
  if (existsSync(formerSessions)) {
    // Only leases of stopped writers may remain; nothing else is lost.
    for (const name of readdirSync(formerSessions)) if (/^\.[0-9a-f-]{36}\.lock/.test(name)) rmSync(join(formerSessions, name), { recursive: true, force: true });
    try { rmdirSync(formerSessions); } catch { /* left for the reader */ }
  }
  const library = join(root, "playbooks");
  const retired = [
    ...(existsSync(library) ? readdirSync(library).filter((name) => !name.startsWith(".")).map((name) => `playbooks/${name}`) : []),
    ...(existsSync(join(root, "local", "drafts")) ? ["local/drafts"] : []),
  ];
  record({ step: "local", prefs: "local/prefs.json", formerGit: existsSync(join(root, "local", "former-home.git")) ? "local/former-home.git" : null, retired });

  // 6 — validate every output, then write each clone's first history:
  // nothing is committed before its sessions validated (storage-9).
  Home.load(root);
  parsePrefs(readJsonFile(join(root, "local", "prefs.json")), join(root, "local", "prefs.json"));
  const keys = [...new Set([...Object.values(plan!), home.own()])];
  for (const key of keys) {
    await validateStorageTree(home.clonePath(key), { own: key === home.own(), ...(options.libraryDir ? { libraryDir: options.libraryDir } : {}) });
  }
  for (const key of keys) {
    const dir = home.clonePath(key);
    const git = { ...(options.env ? { env: options.env } : {}), unsupported: unsupportedSessionPaths(dir) };
    if (!initializeClone(dir, { ...git, message: "Migrate from the former home" })) commitClone(dir, "Migrate from the former home", git);
  }
  record({ step: "validate", repositories: keys });
  receipt.complete = true;
  save();
  return receipt;
}
