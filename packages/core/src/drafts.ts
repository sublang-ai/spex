// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring store (DR-058, playbook-library-70, storage-23): an
// authoring session lives in the spex repository of the project it
// belongs to — `authoring/<id>.json`, replaced atomically, beside
// `authoring/<id>.records.jsonl`, appended, and `authoring/<id>.assets/`
// — written under the Spex home lease the store holds; its spec package
// under development stands in the project's working folder at
// `spex-packages/<id>/`, the source at `playbooks/en/<id>/<id>.md`
// (environments-10). No provider token enters any file.

import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { knownFormat, StorageFormatError, writeApplicationFile, type StorageDiagnostic } from "./app-storage.js";
import { mediaAttachmentsSchema, type MessageContent } from "./protocol.js";
import { i18n } from "./i18n.js";
import { sanitizeRecord } from "./stream-fold.js";
import type {
  ClarificationQuestion,
  DraftCompileOutcome,
  DraftCompileRelay,
  DraftProposal,
  DraftRecord,
  DraftSource,
  TmuxPlayRecord,
} from "./protocol.js";

/** The last compile, as `draft.json` keeps it (storage-23). */
export interface StoredDraftCompile {
  at: number;
  by: "boss" | "agent";
  outcome: DraftCompileOutcome;
  phase?: string;
  output?: string;
  questions?: ClarificationQuestion[];
  /** On a failed compile, what became of it (playbook-library-58). */
  relay?: DraftCompileRelay;
  roles?: string[];
  /** The source's digest at a successful compile, from which the
   * "Changed" state derives. */
  sourceSha256?: string;
}

/** `<clone>/authoring/<id>.json`, exactly (storage-23). */
export interface StoredDraft {
  format: 1;
  id: string;
  createdAt: number;
  touchedAt: number;
  /** The spec package under development, relative to the working folder. */
  package: string;
  queued: MessageContent[];
  failures: number;
  compile?: StoredDraftCompile;
  proposal?: DraftProposal;
}

/** Where an authoring session's spec package sits in its working
 * folder (environments-10, playbook-library-70). */
export const draftPackagePath = (id: string): string => `spex-packages/${id}`;

/** A session file's `package`, read without validating the rest: a
 * damaged file still names where its package is, else the default. */
function readPackagePath(file: string, id: string): string {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as { package?: unknown };
    const path = value.package;
    if (typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.split("/").includes("..")) return path;
  } catch { /* the default below */ }
  return draftPackagePath(id);
}

const OUTCOMES: readonly string[] = ["running", "ok", "failed", "canceled", "interrupted"];
const RELAYS: readonly string[] = ["sent", "stopped", "queued"];
const DRAFT_ID = /^[a-z][a-z0-9_-]*$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isTimestamp = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isText = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);

function need(condition: unknown, file: string, reason: string): asserts condition {
  if (!condition) throw new StorageFormatError(file, reason);
}

function closedKeys(value: Record<string, unknown>, required: string[], optional: string[], file: string): void {
  // The field names are the file format's own and stay as they are;
  // one message per case, so neither reads as a fragment.
  const reason = optional.length
    ? i18n._({
        id: "expected fields {required}; optional {optional}",
        values: { required: required.join(", "), optional: optional.join(", ") },
        comment: "Diagnostic for a damaged draft file: the fields it must and may carry, named as the file names them",
      })
    : i18n._({
        id: "expected fields {required}",
        values: { required: required.join(", ") },
        comment: "Diagnostic for a damaged draft file: the fields it must carry, named as the file names them",
      });
  need(
    required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every((key) => required.includes(key) || optional.includes(key)),
    file,
    reason,
  );
}

function validateQuestion(value: unknown, file: string): asserts value is ClarificationQuestion {
  const invalid = (): string =>
    i18n._({
      id: "invalid clarification question",
      comment: "Diagnostic for a damaged draft file: one of the compiler's recorded questions will not read",
    });
  need(isObject(value), file, invalid());
  closedKeys(value, ["id", "question", "reason", "evidence"], ["choices"], file);
  need(isText(value.id) && isText(value.question) && isText(value.reason) && isText(value.evidence), file, invalid());
  if (value.choices !== undefined) {
    need(
      isStringArray(value.choices),
      file,
      i18n._({
        id: "invalid clarification choices",
        comment: "Diagnostic for a damaged draft file: a recorded question's answer choices will not read",
      }),
    );
  }
}

/** Validate one `draft.json` document against storage-23 exactly. */
export function parseStoredDraft(value: unknown, file: string, id?: string): StoredDraft {
  // Each reason is the reader's: it stands in the draft's row as the
  // diagnostic that blocks it (playbook-library-70, DR-079).
  const invalidCompile = (): string =>
    i18n._({
      id: "invalid compile",
      comment: "Diagnostic for a damaged draft file: the recorded compile will not read",
    });
  const invalidProposal = (): string =>
    i18n._({
      id: "invalid proposal",
      comment: "Diagnostic for a damaged draft file: the agent's recorded registration proposal will not read",
    });
  need(
    isObject(value),
    file,
    i18n._({ id: "expected an object", comment: "Diagnostic for a damaged file: its top level is not an object" }),
  );
  knownFormat(value, file);
  closedKeys(value, ["format", "id", "createdAt", "touchedAt", "package", "queued", "failures"], ["compile", "proposal"], file);
  need(
    typeof value.package === "string" && value.package.length > 0 && !value.package.startsWith("/") && !value.package.split("/").includes(".."),
    file,
    i18n._({ id: "invalid spec package path", comment: "Diagnostic for a damaged authoring file: the path of its spec package will not read" }),
  );
  need(
    isText(value.id) && DRAFT_ID.test(value.id) && (id === undefined || value.id === id),
    file,
    i18n._({
      id: "draft id disagrees with its file name",
      comment: "Diagnostic for a damaged draft file: the id it names is not the one its folder does",
    }),
  );
  need(
    isTimestamp(value.createdAt) && isTimestamp(value.touchedAt),
    file,
    i18n._({ id: "invalid timestamps", comment: "Diagnostic for a damaged draft file: its recorded times will not read" }),
  );
  need(
    Array.isArray(value.queued) && value.queued.every((entry) =>
      isObject(entry) && isText(entry.text) &&
        Object.keys(entry).every((key) => key === "text" || key === "attachments") &&
        (entry.attachments === undefined || mediaAttachmentsSchema.safeParse(entry.attachments).success) &&
        (entry.text.length > 0 || (Array.isArray(entry.attachments) && entry.attachments.length > 0))),
    file,
    i18n._({ id: "invalid queue", comment: "Diagnostic for a damaged draft file: its queued messages will not read" }),
  );
  need(
    Number.isSafeInteger(value.failures) && (value.failures as number) >= 0,
    file,
    i18n._({
      id: "invalid failure count",
      comment: "Diagnostic for a damaged draft file: its count of consecutive failed compiles will not read",
    }),
  );
  if (value.compile !== undefined) {
    const compile = value.compile;
    need(isObject(compile), file, invalidCompile());
    closedKeys(compile, ["at", "by", "outcome"], ["phase", "output", "questions", "relay", "roles", "sourceSha256"], file);
    need(isTimestamp(compile.at) && (compile.by === "boss" || compile.by === "agent") && OUTCOMES.includes(String(compile.outcome)), file, invalidCompile());
    need(compile.relay === undefined || RELAYS.includes(String(compile.relay)), file, invalidCompile());
    need(
      compile.phase === undefined || isText(compile.phase),
      file,
      i18n._({
        id: "invalid compile phase",
        comment: "Diagnostic for a damaged draft file: the pipeline stage the compile reached will not read",
      }),
    );
    need(
      compile.output === undefined || isText(compile.output),
      file,
      i18n._({
        id: "invalid compile output",
        comment: "Diagnostic for a damaged draft file: the compiler's kept output will not read",
      }),
    );
    need(
      compile.roles === undefined || isStringArray(compile.roles),
      file,
      i18n._({
        id: "invalid compile roles",
        comment: "Diagnostic for a damaged draft file: the roles the compile derived will not read",
      }),
    );
    need(
      compile.sourceSha256 === undefined || isText(compile.sourceSha256),
      file,
      i18n._({
        id: "invalid source digest",
        comment: "Diagnostic for a damaged draft file: the digest of the compiled source will not read",
      }),
    );
    if (compile.questions !== undefined) {
      need(
        Array.isArray(compile.questions),
        file,
        i18n._({
          id: "invalid clarification questions",
          comment: "Diagnostic for a damaged draft file: the compiler's recorded questions will not read",
        }),
      );
      for (const question of compile.questions) validateQuestion(question, file);
    }
  }
  if (value.proposal !== undefined) {
    const proposal = value.proposal;
    need(isObject(proposal), file, invalidProposal());
    closedKeys(proposal, ["command", "intent", "players"], [], file);
    need(isText(proposal.command) && isText(proposal.intent) && isObject(proposal.players) && Object.values(proposal.players).every(isText), file, invalidProposal());
  }
  return value as unknown as StoredDraft;
}

/** The version token of a source's bytes: a digest prefix, as the
 * spec editor's tokens are. */
export function sourceVersion(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export function sourceDigest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ReadDraftRecords {
  records: DraftRecord[];
  /** Set when the file holds a damaged line: the readable prefix is
   * served and the damage reported, never repaired (storage-23). */
  incompleteAfterSeq?: number;
}

/** Where an authoring session is kept: its project's spex repository,
 * and the working folder on this device holding its spec package. */
export interface AuthoringLocation { key: string; authoringDir: string; workingFolder: string | null }

/** The language a new playbook artifact is authored in (playbook-library-70). */
export const AUTHORING_LANGUAGE = "en";

/** The `meta.yaml` of a new spec package under development
 * (playbook-library-70): one playbook artifact, version 0.1.0. */
export function authoringManifest(id: string, org: string): string {
  return [
    "format: 2",
    `org: ${org}`,
    `name: ${id}`,
    "version: 0.1.0",
    `description: The ${id} playbook`,
    "artifacts:",
    `  ${id}:`,
    "    kind: playbook",
    `    language: ${AUTHORING_LANGUAGE}`,
    "",
  ].join("\n");
}

/** A session file of an id another spex repository already holds:
 * the spex repository kept, the one shadowed, and its file. */
interface ShadowedDraft { id: string; kept: string; other: string; file: string }

export class DraftStore {
  /** Which spex repository holds each authoring session. */
  private locations = new Map<string, AuthoringLocation>();
  /** Each session's spec package path inside its working folder. */
  private packages = new Map<string, string>();
  /** The session files the last rescan found shadowed by another spex
   * repository's of the same id: the id is the home's, the one kept
   * staying kept while its file stands (storage-12). */
  private duplicates: ShadowedDraft[] = [];
  /** Told of each id a rescan gave another session, or none, so state
   * read from the one kept before is dropped (storage-12). */
  onKeptChanged: (id: string) => void = () => {};

  constructor(
    /** Every clone's `authoring/` directory, read on each rescan. */
    private readonly repositories: () => AuthoringLocation[],
  ) {
    this.refresh();
  }

  /** Re-read which clone holds which session (space-20): the one kept
   * stays kept while its file stands; else the first by key order
   * (storage-12). */
  refresh(): void {
    const holders = new Map<string, AuthoringLocation[]>();
    for (const location of this.repositories()) {
      if (!existsSync(location.authoringDir)) continue;
      for (const name of readdirSync(location.authoringDir)) {
        if (!name.endsWith(".json")) continue;
        const id = name.slice(0, -5);
        if (!DRAFT_ID.test(id)) continue;
        holders.set(id, [...(holders.get(id) ?? []), location]);
      }
    }
    const next = new Map<string, AuthoringLocation>();
    const packages = new Map<string, string>();
    const duplicates: ShadowedDraft[] = [];
    for (const [id, found] of holders) {
      const previous = this.locations.get(id)?.key;
      const kept = found.find((location) => location.key === previous) ?? found[0];
      next.set(id, kept);
      packages.set(id, readPackagePath(join(kept.authoringDir, `${id}.json`), id));
      for (const location of found) {
        if (location !== kept) duplicates.push({ id, kept: kept.key, other: location.key, file: join(location.authoringDir, `${id}.json`) });
      }
    }
    const changed = [...this.locations].filter(([id, location]) => next.get(id)?.key !== location.key).map(([id]) => id);
    this.locations = next;
    this.packages = packages;
    this.duplicates = duplicates;
    for (const id of changed) this.onKeptChanged(id);
  }

  /** Clones moved under `workspace/` (space-59, space-60): a kept
   * session follows its clone, still the one kept. */
  moved(moves: readonly { from: string; to: string }[]): void {
    const to = new Map(moves.map((move) => [move.from, move.to]));
    for (const [id, location] of [...this.locations]) {
      const key = to.get(location.key);
      if (key !== undefined) this.locations.set(id, { ...location, key });
    }
    this.refresh();
  }

  /** One nonblocking diagnostic per session file the last rescan found
   * shadowed, phrased when asked so it follows the home's language
   * (storage-12, DR-079). */
  diagnostics(): StorageDiagnostic[] {
    return this.duplicates.map(({ id, kept, other, file }) => ({
      file,
      reason: i18n._({
        id: "{draftId} is authored in both {kept} and {other}; the one in {kept} opens",
        values: { draftId: id, kept, other },
        comment: "Diagnostic: two spex repositories each hold an authoring session of one id; the one kept is the one that opens",
      }),
      blocking: false,
    }));
  }

  private location(id: string): AuthoringLocation {
    const location = this.locations.get(id);
    if (!location) throw new StorageFormatError(join("authoring", `${id}.json`), i18n._({
      id: "no draft {draftId}", comment: "Refusal: no playbook draft of this id is open", values: { draftId: id } }));
    return location;
  }

  /** The project whose spex repository holds the session. */
  projectOf(id: string): string | undefined {
    return this.locations.get(id)?.key;
  }

  /** Every id whose kept session one spex repository holds. */
  idsIn(key: string): string[] {
    return [...this.locations].filter(([, location]) => location.key === key).map(([id]) => id);
  }

  recordFile(id: string): string {
    return join(this.location(id).authoringDir, `${id}.json`);
  }

  recordsFile(id: string): string {
    return join(this.location(id).authoringDir, `${id}.records.jsonl`);
  }

  /** The session's own attachments beside its file (media-4). */
  assetsDir(id: string): string {
    return join(this.location(id).authoringDir, `${id}.assets`);
  }

  /** The working folder holding the session's spec package, on this
   * device; null where the project has none here. */
  workingFolder(id: string): string | null {
    return this.locations.get(id)?.workingFolder ?? null;
  }

  /** The spec package path inside the working folder (storage-23). */
  packagePath(id: string): string {
    return this.packages.get(id) ?? draftPackagePath(id);
  }

  /** The spec package under development: `<working folder>/<package>`
   * (environments-10); null without a working folder here. */
  draftDir(id: string): string | null {
    const workingFolder = this.workingFolder(id);
    return workingFolder === null ? null : join(workingFolder, ...this.packagePath(id).split("/"));
  }

  /** The playbook artifact's folder, `playbooks/en/<id>/` of the
   * package, where the compiler runs (playbook-library-12). */
  artifactDir(id: string): string | null {
    const dir = this.draftDir(id);
    return dir === null ? null : join(dir, "playbooks", AUTHORING_LANGUAGE, id);
  }

  /** The playbook's text the compiler reads: `<artifact>/<id>.md`. */
  sourcePath(id: string): string | null {
    const dir = this.artifactDir(id);
    return dir === null ? null : join(dir, `${id}.md`);
  }

  /** Every id holding an authoring file, sorted. */
  ids(): string[] {
    return [...this.locations.keys()].filter((id) => existsSync(this.recordFile(id))).sort();
  }

  exists(id: string): boolean {
    return this.locations.has(id) && existsSync(this.recordFile(id));
  }

  /** Read one record; a damaged file throws a StorageFormatError. */
  read(id: string): StoredDraft {
    const file = this.recordFile(id);
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new StorageFormatError(file, (error as Error).message);
    }
    return parseStoredDraft(value, file, id);
  }

  /** Replace the authoring file atomically. */
  write(draft: StoredDraft): void {
    mkdirSync(this.location(draft.id).authoringDir, { recursive: true, mode: 0o700 });
    writeApplicationFile(this.recordFile(draft.id), parseStoredDraft(draft, this.recordFile(draft.id), draft.id));
  }

  /** Make the spec package under development in the working folder —
   * its `meta.yaml` unless a folder brought in already holds one — and
   * the record in the project's spex repository (playbook-library-70,
   * playbook-library-51, storage-23). */
  create(id: string, now: number, location: AuthoringLocation, org: string): StoredDraft {
    if (location.workingFolder === null) {
      throw new StorageFormatError(join("authoring", `${id}.json`), i18n._({
        id: "{projectId} has no working folder on this device",
        comment: "Refusal: an authoring session belongs to a project whose working folder is on this device",
        values: { projectId: location.key },
      }));
    }
    // The id is the home's: another project's session keeps it
    // (playbook-library-70).
    const holder = this.projectOf(id);
    if (holder !== undefined && holder !== location.key && this.exists(id)) {
      throw new StorageFormatError(join("authoring", `${id}.json`), i18n._({
        id: "{draftId} is being authored in {projectId}",
        comment: "Refusal: the id offered for a new playbook is another project's authoring session",
        values: { draftId: id, projectId: holder },
      }));
    }
    // A session already standing there is never replaced, nor its
    // transcript removed (playbook-library-51).
    if (existsSync(join(location.authoringDir, `${id}.json`))) {
      throw new StorageFormatError(join("authoring", `${id}.json`), i18n._({
        id: "draft {id} already exists; open it",
        comment: "Refusal: a draft with that id is already on this device",
        values: { id },
      }));
    }
    const packagePath = draftPackagePath(id);
    const dir = join(location.workingFolder, ...packagePath.split("/"));
    mkdirSync(join(dir, "playbooks", AUTHORING_LANGUAGE, id), { recursive: true });
    if (!existsSync(join(dir, "meta.yaml"))) writeFileSync(join(dir, "meta.yaml"), authoringManifest(id, org));
    this.locations.set(id, location);
    this.packages.set(id, packagePath);
    // A transcript left behind without its record would put the new
    // draft's first records after a stranger's; it goes first.
    rmSync(this.recordsFile(id), { force: true });
    const draft: StoredDraft = { format: 1, id, createdAt: now, touchedAt: now, package: packagePath, queued: [], failures: 0 };
    this.write(draft);
    return draft;
  }

  /** Remove the record, transcript and attachments, leaving the spec
   * package folder in the working folder (playbook-library-63); a
   * session of the id another spex repository holds takes its place
   * (storage-12). */
  retire(id: string): void {
    if (!this.locations.has(id)) return;
    rmSync(this.assetsDir(id), { recursive: true, force: true });
    rmSync(this.recordsFile(id), { force: true });
    rmSync(this.recordFile(id), { force: true });
    this.refresh();
  }

  /** Delete the session: its record, transcript and attachments; the
   * spec package folder stays (playbook-library-63, playbook-library-70). */
  delete(id: string): void {
    this.retire(id);
  }
  /** The transcript's readable prefix: newline-terminated `{seq,record}`
   * lines in sequence order; an incomplete final line is not a record. */
  records(id: string): ReadDraftRecords {
    const file = this.recordsFile(id);
    if (!existsSync(file)) return { records: [] };
    const lines = readFileSync(file, "utf8").split("\n");
    const unterminated = lines.pop() !== "";
    const records: DraftRecord[] = [];
    let lastSeq = 0;
    let incompleteAfterSeq: number | undefined;
    for (const line of lines) {
      if (!line.trim()) continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        incompleteAfterSeq = lastSeq;
        break;
      }
      if (
        !isObject(value) || Object.keys(value).some((key) => key !== "seq" && key !== "record") ||
        !Number.isSafeInteger(value.seq) || (value.seq as number) !== lastSeq + 1 || !isObject(value.record)
      ) {
        incompleteAfterSeq = lastSeq;
        break;
      }
      records.push({ seq: value.seq as number, record: value.record as unknown as TmuxPlayRecord });
      lastSeq = value.seq as number;
    }
    if (unterminated && incompleteAfterSeq === undefined) incompleteAfterSeq = lastSeq;
    return { records, ...(incompleteAfterSeq !== undefined ? { incompleteAfterSeq } : {}) };
  }

  /** Append one record; tokens never reach the file. */
  append(id: string, seq: number, record: TmuxPlayRecord): DraftRecord {
    mkdirSync(this.location(id).authoringDir, { recursive: true, mode: 0o700 });
    const stored: DraftRecord = { seq, record: sanitizeRecord(record) };
    appendFileSync(this.recordsFile(id), `${JSON.stringify(stored)}\n`);
    return stored;
  }

  /** The source as it stands on disk, with its version token. */
  readSource(id: string): (DraftSource & { sha256: string }) | undefined {
    const path = this.sourcePath(id);
    if (path === null || !existsSync(path)) return undefined;
    const bytes = readFileSync(path);
    return {
      markdown: bytes.toString("utf8"),
      version: sourceVersion(bytes),
      sha256: sourceDigest(bytes),
      mtime: Math.round(statSync(path).mtimeMs),
    };
  }

  /** Replace `<id>.md` atomically under the version token: a
   * `baseVersion` that no longer matches is a conflict, none writes
   * unconditionally. */
  writeSource(
    id: string,
    content: string,
    baseVersion?: string,
  ): { ok: true; version: string; mtime: number } | { ok: false; code: "conflict"; message: string } {
    const path = this.sourcePath(id);
    if (path === null) {
      throw new StorageFormatError(join("authoring", `${id}.json`), i18n._({
        id: "{projectId} has no working folder on this device",
        comment: "Refusal: an authoring session belongs to a project whose working folder is on this device",
        values: { projectId: this.projectOf(id) ?? id },
      }));
    }
    mkdirSync(dirname(path), { recursive: true });
    const current = existsSync(path) ? readFileSync(path) : undefined;
    const currentVersion = current ? sourceVersion(current) : undefined;
    if (baseVersion !== undefined && baseVersion !== currentVersion) {
      return {
        ok: false,
        code: "conflict",
        message: i18n._({
          id: "{file} changed on disk since it was read",
          values: { file: `${id}.md` },
          comment: "Refusal: the file moved under the write the reader asked for",
        }),
      };
    }
    const next = Buffer.from(content, "utf8");
    if (current && next.equals(current)) {
      return { ok: true, version: currentVersion as string, mtime: Math.round(statSync(path).mtimeMs) };
    }
    const mode = current ? statSync(path).mode & 0o7777 : 0o644;
    const stage = join(dirname(path), `.${basename(path)}.spex-stage`);
    try {
      writeFileSync(stage, next, { mode });
      chmodSync(stage, mode);
      renameSync(stage, path);
    } catch (cause) {
      rmSync(stage, { force: true });
      throw cause;
    }
    return { ok: true, version: sourceVersion(next), mtime: Math.round(statSync(path).mtimeMs) };
  }

  /** The diagnostic a damaged record earns: scoped to that draft. */
  diagnostic(error: unknown, id: string): StorageDiagnostic {
    return error instanceof StorageFormatError
      ? { file: error.file, reason: error.reason, blocking: false }
      : { file: this.recordFile(id), reason: String(error), blocking: false };
  }
}
