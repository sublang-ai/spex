// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The files Spex owns in a spex repository and in `local/` (storage-3,
// storage-4, storage-5): one closed JSON file per intent, the project
// file naming the code's remote, and the device's preferences; plus the
// readers of the former layout the one-time migration consumes
// (storage-9) and the fold of diagnostics into repairs (space-46).

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  closed, isLocalPath, isObject, isRecordedPath, isText, isTimestamp, isUuid, knownFormat, need,
  readJsonFile, sha256, StorageFormatError, writeApplicationBytes, writeApplicationFile, UUID,
} from "./files.js";
import { i18n } from "./i18n.js";
import { mediaAttachmentsSchema, type DiagnosticRepair, type IntentAuthor, type IntentInfo, type IntentSource, type MediaAsset, type RepairChecked } from "./protocol.js";

export {
  closed, isObject, knownFormat, need, readJsonFile, sha256, StorageFormatError, UUID, writeApplicationBytes, writeApplicationFile,
};
export type { DiagnosticRepair, RepairChecked };

export interface StorageDiagnostic { file: string; reason: string; blocking: boolean; repair?: DiagnosticRepair }

/** A repair's identity is the facts it names (space-49, space-54). */
export function repairKey(repository: string | undefined, directories: string[]): string {
  return `${repository ?? ""}|${[...directories].sort().join(",")}`;
}

/** Repairs before everything else they do not fold: blocking damage
 * first, then repairs by session count, name and path, then the plain
 * diagnostics (space-46). */
export function foldDiagnostics(diagnostics: StorageDiagnostic[]): StorageDiagnostic[] {
  const blocking = diagnostics.filter((d) => d.blocking);
  const plain = diagnostics.filter((d) => !d.blocking && !d.repair);
  const repairs = diagnostics.filter((d) => !d.blocking && d.repair);
  repairs.sort((a, b) =>
    (b.repair!.sessions - a.repair!.sessions) ||
    (a.repair!.name ?? a.repair!.repository ?? "").localeCompare(b.repair!.name ?? b.repair!.repository ?? "") ||
    (a.repair!.directories[0] ?? "").localeCompare(b.repair!.directories[0] ?? "") ||
    a.reason.localeCompare(b.reason));
  return [...blocking, ...repairs, ...plain];
}

// ---------------------------------------------------------------------------
// Intents (storage-4)
// ---------------------------------------------------------------------------

/** `<clone>/intents/<id>.json`, exactly. */
export interface IntentFile {
  format: 1;
  id: string;
  text: string;
  attachments?: MediaAsset[];
  source?: IntentSource;
  author?: IntentAuthor;
  createdAt: number;
  dispatched?: { sessionId: string; turnId: number; at: number };
  closed?: { as: "done" | "dropped"; at: number };
}

const invalidIntent = (): string =>
  i18n._({ id: "invalid queued intent", comment: "Storage diagnostic: a queued intent's own fields are malformed" });
const invalidAttachments = (): string =>
  i18n._({id: "invalid attachment references", comment: "Attachment transfer or storage diagnostic"});
const invalidDispatch = (): string =>
  i18n._({ id: "invalid dispatch", comment: "Storage diagnostic: a dispatch names no valid session and turn" });
const invalidClose = (): string =>
  i18n._({ id: "invalid close", comment: "Storage diagnostic: a verdict is neither done nor dropped" });

function validateSource(value: unknown, file: string): void {
  closed(value, ["kind", "ref"], ["url", "labels"], file);
  need(["issue", "pr", "record", "chat"].includes(String(value.kind)) && isText(value.ref) &&
    (value.url === undefined || typeof value.url === "string") &&
    (value.labels === undefined || Array.isArray(value.labels) && value.labels.every((x) => typeof x === "string")), file,
  i18n._({ id: "invalid source", comment: "Storage diagnostic: the issue or pull request an intent came from is malformed" }));
}

function validateDispatch(value: unknown, file: string): void {
  closed(value, ["sessionId", "turnId", "at"], [], file);
  need(isUuid(value.sessionId) && Number.isSafeInteger(value.turnId) && (value.turnId as number) > 0 && isTimestamp(value.at), file, invalidDispatch());
}

/** Read one intent file against storage-4 exactly; `id` is its name. */
export function parseIntentFile(value: unknown, file: string, id?: string): IntentFile {
  need(isObject(value), file, invalidIntent());
  knownFormat(value, file);
  closed(value, ["format", "id", "text", "createdAt"], ["attachments", "source", "author", "dispatched", "closed"], file);
  need(isUuid(value.id) && (id === undefined || value.id === id) && typeof value.text === "string" && isTimestamp(value.createdAt), file, invalidIntent());
  if (value.attachments !== undefined) need(mediaAttachmentsSchema.safeParse(value.attachments).success, file, invalidAttachments());
  if (value.source !== undefined) validateSource(value.source, file);
  if (value.author !== undefined) {
    closed(value.author, ["login", "displayName"], [], file);
    need(isText(value.author.login) && (value.author.displayName === null || typeof value.author.displayName === "string"), file, invalidIntent());
  }
  if (value.dispatched !== undefined) validateDispatch(value.dispatched, file);
  if (value.closed !== undefined) {
    closed(value.closed, ["as", "at"], [], file);
    need((value.closed.as === "done" || value.closed.as === "dropped") && isTimestamp(value.closed.at), file, invalidClose());
  }
  return value as unknown as IntentFile;
}

/** The wire shape of a stored intent: its project and its verdict's fields. */
export function intentInfoOf(file: IntentFile, projectId: string): IntentInfo {
  return {
    id: file.id,
    projectId,
    text: file.text,
    ...(file.attachments?.length ? { attachments: structuredClone(file.attachments) } : {}),
    ...(file.source ? { source: structuredClone(file.source) } : {}),
    ...(file.author ? { author: { ...file.author } } : {}),
    createdAt: file.createdAt,
    ...(file.dispatched ? { dispatched: { ...file.dispatched } } : {}),
    ...(file.closed ? { closedAt: file.closed.at, closedAs: file.closed.as } : {}),
  };
}

/** The file a stored intent is written as: nothing beyond storage-4. */
export function intentFileOf(intent: IntentInfo): IntentFile {
  return {
    format: 1,
    id: intent.id,
    text: intent.text,
    ...(intent.attachments?.length ? { attachments: structuredClone([...intent.attachments]) } : {}),
    ...(intent.source ? { source: structuredClone(intent.source) } : {}),
    ...(intent.author ? { author: { login: intent.author.login, displayName: intent.author.displayName } } : {}),
    createdAt: intent.createdAt,
    ...(intent.dispatched ? { dispatched: { sessionId: intent.dispatched.sessionId, turnId: intent.dispatched.turnId, at: intent.dispatched.at } } : {}),
    ...(intent.closedAt !== undefined && intent.closedAs !== undefined ? { closed: { as: intent.closedAs, at: intent.closedAt } } : {}),
  };
}

/** Every intent file of a clone's `intents/`: the readable ones, and a
 * diagnostic per file that will not read — listed nowhere (storage-4). */
export function readIntentFiles(intentsDir: string): { intents: IntentFile[]; problems: StorageDiagnostic[] } {
  const intents: IntentFile[] = []; const problems: StorageDiagnostic[] = [];
  if (!existsSync(intentsDir)) return { intents, problems };
  for (const name of readdirSync(intentsDir).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(intentsDir, name);
    try {
      need(UUID.test(name.slice(0, -5)), file, i18n._({ id: "filename must be an intent UUID",
        comment: "Storage diagnostic: an intent file's name is no intent id" }));
      intents.push(parseIntentFile(readJsonFile(file), file, name.slice(0, -5)));
    } catch (error) {
      if (!(error instanceof StorageFormatError)) throw error;
      problems.push({ file: error.file, reason: error.reason, blocking: false });
    }
  }
  return { intents, problems };
}

/** Write one intent file atomically, validating it first. The folder
 * holding `intents/` must stand: a write never recreates a clone that
 * moved or was removed (DR-111). */
export function writeIntentFile(intentsDir: string, intent: IntentFile): void {
  try { mkdirSync(intentsDir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const file = join(intentsDir, `${intent.id}.json`);
  writeApplicationFile(file, parseIntentFile(intent, file, intent.id));
}

// ---------------------------------------------------------------------------
// The project file (storage-3) and preferences (storage-5)
// ---------------------------------------------------------------------------

export interface ProjectFile { format: 1; name: string; remote: string | null }

export function parseProjectFile(value: unknown, file: string): ProjectFile {
  need(isObject(value), file, i18n._({ id: "expected an object", comment: "Storage diagnostic: a record in the file is not an object" }));
  knownFormat(value, file);
  closed(value, ["format", "name", "remote"], [], file);
  need(isText(value.name) && (value.remote === null || isText(value.remote)), file,
    i18n._({ id: "invalid project file", comment: "Storage diagnostic: project.json's name or remote is malformed" }));
  return value as unknown as ProjectFile;
}

/** `local/prefs.json` as `{format: 1, prefs}` (storage-5). */
export function parsePrefs(value: unknown, file = "local/prefs.json"): Record<string, unknown> {
  need(isObject(value), file, i18n._({ id: "unsupported preference version or prefs object",
    comment: "Storage diagnostic: the preferences file is not one this Spex reads" }));
  knownFormat(value, file);
  closed(value, ["format", "prefs"], [], file);
  need(isObject(value.prefs), file, i18n._({ id: "unsupported preference version or prefs object",
    comment: "Storage diagnostic: the preferences file is not one this Spex reads" }));
  for (const [key, value_] of Object.entries(value.prefs)) {
    if (key.startsWith("viewed:")) need(isTimestamp(value_), file, i18n._({ id: "invalid viewed marker {key}",
      comment: "Storage diagnostic: a read marker's value is no turn number; the key stays as it is",
      values: { key } }));
  }
  return value.prefs;
}

// ---------------------------------------------------------------------------
// The former layout, read once by the migration (storage-9)
// ---------------------------------------------------------------------------

export interface FormerProject { id: string; name: string; registeredAt: number; path?: string }
export interface FormerBinding { id: string; path: string; aliases: string[] }
/** A former queued intent, with the rank and link the migration drops. */
export interface FormerIntent {
  id: string; projectId: string; text: string; attachments?: MediaAsset[]; source?: IntentSource;
  rank: string; afterId?: string; createdAt: number;
  dispatched?: { sessionId: string; turnId: number; at: number };
  closedAt?: number; closedAs?: "done" | "dropped";
}
export type FormerIntentAct =
  | { act: "queue"; intent: FormerIntent }
  | { act: "edit"; id: string; text: string; attachments?: MediaAsset[] }
  | { act: "move"; id: string; rank: string }
  | { act: "link"; id: string; afterId: string | null }
  | { act: "dispatch"; id: string; sessionId: string; turnId: number; at: number }
  | { act: "close"; id: string; as: "done" | "dropped"; at: number }
  | { act: "remove"; id: string; at: number };

/** The former registry: `{v: 2, projects}`, or `{v: 1}` with paths inline. */
export function parseFormerRegistry(value: unknown, file = "projects.json"): FormerProject[] {
  need(isObject(value) && (value.v === 1 || value.v === 2) && Array.isArray(value.projects), file,
    i18n._({ id: "unsupported registry version or projects array",
      comment: "Storage diagnostic: the project registry's version or shape is not one this Spex reads" }));
  const ids = new Set<string>(); const out: FormerProject[] = [];
  for (const p of value.projects as unknown[]) {
    closed(p, value.v === 1 ? ["id", "path", "name", "registeredAt"] : ["id", "name", "registeredAt"], [], file);
    need(isUuid(p.id) && isText(p.name) && isTimestamp(p.registeredAt) && (value.v === 2 || isLocalPath(p.path)), file,
      i18n._({ id: "invalid project identity", comment: "Storage diagnostic: a project's id, name or registration time is malformed" }));
    need(!ids.has(p.id), file, i18n._({ id: "duplicate project {projectId}", comment: "Storage diagnostic: the registry lists one project twice",
      values: { projectId: p.id } })); ids.add(p.id);
    out.push({ id: p.id, name: p.name, registeredAt: p.registeredAt as number, ...(value.v === 1 ? { path: p.path as string } : {}) });
  }
  return out;
}

export function parseFormerBindings(value: unknown, file = "local/project-paths.json"): FormerBinding[] {
  closed(value, ["v", "bindings"], [], file);
  need(value.v === 1 && Array.isArray(value.bindings), file, i18n._({ id: "unsupported path-map version or bindings array",
    comment: "Storage diagnostic: this device's project-to-folder map is not one this Spex reads" }));
  const ids = new Set<string>();
  for (const b of value.bindings) {
    closed(b, ["id", "path", "aliases"], [], file);
    need(isUuid(b.id) && isLocalPath(b.path) && Array.isArray(b.aliases) && b.aliases.every(isRecordedPath) && new Set(b.aliases).size === b.aliases.length, file,
      i18n._({ id: "invalid project binding", comment: "Storage diagnostic: a project's folder or its recorded aliases are malformed" }));
    need(!ids.has(b.id), file, i18n._({ id: "duplicate binding {projectId}", comment: "Storage diagnostic: one project is bound twice",
      values: { projectId: b.id } })); ids.add(b.id);
  }
  return value.bindings as unknown as FormerBinding[];
}

/** The former preference file, `{v: 1, prefs}`. */
export function parseFormerPrefs(value: unknown, file = "prefs.json"): Record<string, unknown> {
  closed(value, ["v", "prefs"], [], file);
  need(value.v === 1 && isObject(value.prefs), file, i18n._({ id: "unsupported preference version or prefs object",
    comment: "Storage diagnostic: the preferences file is not one this Spex reads" }));
  return value.prefs;
}

function validateFormerIntent(value: unknown, projectId: string, file: string): asserts value is FormerIntent {
  closed(value, ["id", "projectId", "text", "rank", "createdAt"], ["source", "afterId", "dispatched", "closedAt", "closedAs", "attachments"], file);
  need(isUuid(value.id) && value.projectId === projectId && typeof value.text === "string" && isText(value.rank) && isTimestamp(value.createdAt), file, invalidIntent());
  if (value.attachments !== undefined) need(mediaAttachmentsSchema.safeParse(value.attachments).success, file, invalidAttachments());
  if (value.source !== undefined) validateSource(value.source, file);
  if (value.dispatched !== undefined) validateDispatch(value.dispatched, file);
  need((value.closedAt === undefined) === (value.closedAs === undefined), file, invalidClose());
  if (value.closedAt !== undefined) need(isTimestamp(value.closedAt) && ["done", "dropped"].includes(String(value.closedAs)), file, invalidClose());
}

/** A former act log `intents/<projectId>.jsonl`: only newline-terminated acts. */
export function parseFormerIntentLog(contents: string, projectId: string, file = `intents/${projectId}.jsonl`): FormerIntentAct[] {
  const lines = contents.split("\n"); lines.pop();
  const acts: FormerIntentAct[] = [];
  const fields: Record<string, string[]> = { queue: ["intent"], edit: ["id", "text"], move: ["id", "rank"], link: ["id", "afterId"], dispatch: ["id", "sessionId", "turnId", "at"], close: ["id", "as", "at"], remove: ["id", "at"] };
  for (let i = 0; i < lines.length; i++) {
    const location = `${file}:${i + 1}`;
    let value: unknown;
    try { value = JSON.parse(lines[i]); } catch { throw new StorageFormatError(location, i18n._({ id: "invalid completed JSON line",
      comment: "Storage diagnostic: one line of an act log is not readable JSON" })); }
    need(isObject(value) && value.v === 1 && typeof value.act === "string" && Object.hasOwn(fields, value.act), location, i18n._({ id: "unsupported act/version",
      comment: "Storage diagnostic: an act's kind or version is not one this Spex reads" }));
    closed(value, ["v", "act", ...fields[value.act]], value.act === "edit" ? ["attachments"] : [], location);
    if (value.act === "queue") validateFormerIntent(value.intent, projectId, location);
    else need(isUuid(value.id), location, i18n._({ id: "invalid intent ID", comment: "Storage diagnostic: an act names no valid intent id" }));
    const { v: _v, ...act } = value; acts.push(act as FormerIntentAct);
  }
  return acts;
}

/** Replay a former act log once: the intents it leaves, and those removed. */
export function foldFormerIntentActs(acts: FormerIntentAct[], file: string): { intents: Map<string, FormerIntent>; removed: Set<string> } {
  const intents = new Map<string, FormerIntent>(); const removed = new Set<string>();
  for (const act of acts) {
    if (act.act === "queue") {
      need(!intents.has(act.intent.id), file, i18n._({ id: "duplicate queue {intentId}", comment: "Storage diagnostic: two acts queue the same intent",
        values: { intentId: act.intent.id } }));
      intents.set(act.intent.id, structuredClone(act.intent)); continue;
    }
    const intent = intents.get(act.id);
    need(intent, file, i18n._({ id: "act targets unknown intent {intentId}",
      comment: "Storage diagnostic: an act names an intent no queue act created", values: { intentId: act.id } }));
    switch (act.act) {
      case "edit":
        intent.text = act.text;
        if (act.attachments !== undefined) intent.attachments = structuredClone(act.attachments);
        break;
      case "move": intent.rank = act.rank; break;
      case "link": if (act.afterId === null) delete intent.afterId; else intent.afterId = act.afterId; break;
      case "dispatch": intent.dispatched = { sessionId: act.sessionId, turnId: act.turnId, at: act.at }; break;
      case "close": intent.closedAt = act.at; intent.closedAs = act.as; break;
      case "remove": removed.add(act.id); break;
    }
  }
  return { intents, removed };
}

// ---------------------------------------------------------------------------
// Single-file migrations (config profiles, DR-019)
// ---------------------------------------------------------------------------

interface FileMigrationReceipt { v: 1; id: string; inputs: { path: string; sha256: string }[]; complete: boolean }

const divergedDestination = (): string =>
  i18n._({ id: "migration destination diverged; preserved unchanged",
    comment: "Migration diagnostic: the file changed under the migration, which wrote nothing" });

/** A deterministic single-file conversion with restart-safe retained inputs. */
export function migrateApplicationFile(home: string, source: string, convert: (original: string) => string): void {
  if (!existsSync(source)) return;
  const migrations = join(home, "local", "migrations"); mkdirSync(migrations, { recursive: true, mode: 0o700 });
  let receipt: FileMigrationReceipt | undefined; let directory: string | undefined;
  for (const id of readdirSync(migrations)) {
    const file = join(migrations, id, "receipt.json"); if (!existsSync(file)) continue;
    const found = readJsonFile(file) as FileMigrationReceipt;
    if (!found.complete && found.inputs?.[0]?.path === source) { receipt = found; directory = join(migrations, id); break; }
  }
  const original = receipt ? readFileSync(join(directory!, "inputs", "0")) : readFileSync(source);
  const expected = Buffer.from(convert(original.toString("utf8")));
  if (!receipt && expected.equals(original)) return;
  if (!receipt) {
    const id = randomUUID(); directory = join(migrations, id); mkdirSync(join(directory, "inputs"), { recursive: true, mode: 0o700 });
    writeApplicationBytes(join(directory, "inputs", "0"), original);
    receipt = { v: 1, id, inputs: [{ path: source, sha256: sha256(original) }], complete: false };
    writeApplicationFile(join(directory, "receipt.json"), receipt);
  }
  need(receipt.v === 1 && receipt.inputs[0].sha256 === sha256(original), source, i18n._({ id: "invalid migration receipt or input",
    comment: "Migration diagnostic: the kept original no longer matches its receipt" }));
  const current = readFileSync(source);
  need(current.equals(original) || current.equals(expected), source, divergedDestination());
  if (!current.equals(expected)) writeApplicationBytes(source, expected);
  need(readFileSync(source).equals(expected), source, i18n._({ id: "migration output verification failed",
    comment: "Migration diagnostic: the file read back differs from what was written" }));
  receipt.complete = true; writeApplicationFile(join(directory!, "receipt.json"), receipt);
}
