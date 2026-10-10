// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring store (DR-058, playbook-library-70, storage-23): an
// authoring session lives in the spex repository of the project it
// belongs to — `authoring/<id>.json`, replaced atomically under the
// version read, beside `authoring/<id>.records.jsonl`, appended, and
// `authoring/<id>.assets/` — written under the Spex home lease the
// store holds; its spec package under development stands in the
// project's working folder at `spex-packages/<id>/`, the source at
// `playbooks/en/<id>/<id>.md` (environments-10). No provider token
// enters any file. Nothing here is a picture of the files: every
// location, package path and transcript fact is read at use (DR-111),
// the transcript's tail through a cache its file's stat validates.

import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { knownFormat, StorageFormatError, type StorageDiagnostic } from "./app-storage.js";
import { mediaAttachmentsSchema, UUID_PATTERN, type MessageContent } from "./protocol.js";
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
  /** The home's device running it, while it runs (storage-23). */
  device?: string;
}

/** `<clone>/authoring/<id>.json`, exactly (storage-23). */
export interface StoredDraft {
  format: 1;
  id: string;
  /** The session's identity, minted at creation (storage-23). */
  instance: string;
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

/** The instance a file written before `instance` existed reads as
 * (storage-23): one UUID from its id and creation time, so the same
 * bytes read alike on every device. */
export function legacyInstance(id: string, createdAt: number): string {
  const hex = createHash("sha256").update(`authoring:${id}:${createdAt}`).digest("hex").slice(0, 32).split("");
  hex[12] = "8";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A versioned write found the file other than the writer read it:
 * changed, replaced, or gone meanwhile (DR-111). */
export class DraftChangedError extends Error {
  constructor(readonly gone: boolean) {
    super(gone ? "the session's file is gone" : "the session's file changed meanwhile");
  }
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
  closedKeys(value, ["format", "id", "createdAt", "touchedAt", "package", "queued", "failures"], ["instance", "compile", "proposal"], file);
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
    value.instance === undefined || (isText(value.instance) && UUID_PATTERN.test(value.instance)),
    file,
    i18n._({ id: "invalid instance", comment: "Diagnostic for a damaged authoring file: the identity it records will not read" }),
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
    closedKeys(compile, ["at", "by", "outcome"], ["device", "phase", "output", "questions", "relay", "roles", "sourceSha256"], file);
    need(isTimestamp(compile.at) && (compile.by === "boss" || compile.by === "agent") && OUTCOMES.includes(String(compile.outcome)), file, invalidCompile());
    need(compile.device === undefined || isText(compile.device), file, invalidCompile());
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
  const draft = value as unknown as Omit<StoredDraft, "instance"> & { instance?: string };
  // The file's own order, the instance after the id (storage-23).
  return {
    format: 1,
    id: draft.id,
    instance: draft.instance ?? legacyInstance(draft.id, draft.createdAt),
    createdAt: draft.createdAt,
    touchedAt: draft.touchedAt,
    package: draft.package,
    queued: draft.queued,
    failures: draft.failures,
    ...(draft.compile !== undefined ? { compile: draft.compile } : {}),
    ...(draft.proposal !== undefined ? { proposal: draft.proposal } : {}),
  };
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

/** A file's stat, as Git's index keys a cached fact by it. */
function statKey(file: string): string | undefined {
  try {
    const stat = statSync(file, { bigint: true });
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}`;
  } catch {
    return undefined;
  }
}

export class DraftStore {
  /** Each transcript's last sequence and damage, keyed by its file and
   * valid only while the file's stat is the one it was read under. */
  private readonly tails = new Map<string, { stat: string; lastSeq: number; incompleteAfterSeq?: number }>();
  /** Each session file's instance, validated the same way. */
  private readonly instances = new Map<string, { stat: string; instance: string | undefined }>();

  constructor(
    /** Every clone's `authoring/` directory, read at each use. */
    private readonly repositories: () => AuthoringLocation[],
  ) {}

  /** The clone holding the session now: the first the home lists whose
   * `authoring/` holds `<id>.json` (playbook-library-70). */
  private locate(id: string): AuthoringLocation | undefined {
    if (!DRAFT_ID.test(id)) return undefined;
    return this.repositories().find((location) => existsSync(join(location.authoringDir, `${id}.json`)));
  }

  private location(id: string): AuthoringLocation {
    const location = this.locate(id);
    if (!location) throw new StorageFormatError(join("authoring", `${id}.json`), i18n._({
      id: "no draft {draftId}", comment: "Refusal: no playbook draft of this id is open", values: { draftId: id } }));
    return location;
  }

  /** The project whose spex repository holds the session. */
  projectOf(id: string): string | undefined {
    return this.locate(id)?.key;
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
    return this.locate(id)?.workingFolder ?? null;
  }

  /** The spec package path inside the working folder (storage-23), as
   * the session file names it now. */
  packagePath(id: string): string {
    const location = this.locate(id);
    return location ? readPackagePath(join(location.authoringDir, `${id}.json`), id) : draftPackagePath(id);
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

  /** Every id holding an authoring file, sorted, each once. */
  ids(): string[] {
    const ids = new Set<string>();
    for (const location of this.repositories()) {
      if (!existsSync(location.authoringDir)) continue;
      for (const name of readdirSync(location.authoringDir)) {
        if (name.endsWith(".json") && DRAFT_ID.test(name.slice(0, -5))) ids.add(name.slice(0, -5));
      }
    }
    return [...ids].sort();
  }

  exists(id: string): boolean {
    return this.locate(id) !== undefined;
  }

  /** Read one record; a damaged file throws a StorageFormatError. */
  read(id: string): StoredDraft {
    return this.load(id).draft;
  }

  /** The record with the version of the bytes it was read from. */
  load(id: string): { draft: StoredDraft; version: string } {
    const file = this.recordFile(id);
    let bytes: Buffer;
    let value: unknown;
    try {
      bytes = readFileSync(file);
      value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new StorageFormatError(file, (error as Error).message);
    }
    return { draft: parseStoredDraft(value, file, id), version: sourceDigest(bytes) };
  }

  /** The version of the session file's bytes as they stand: what a
   * damaged file is deleted under, having no instance to name. */
  fileVersion(id: string): string | undefined {
    const location = this.locate(id);
    if (!location) return undefined;
    try {
      return sourceDigest(readFileSync(join(location.authoringDir, `${id}.json`)));
    } catch {
      return undefined;
    }
  }

  /** The instance the session file records now; undefined where it is
   * gone or will not read. */
  instanceOf(id: string): string | undefined {
    const location = this.locate(id);
    if (!location) return undefined;
    const file = join(location.authoringDir, `${id}.json`);
    const stat = statKey(file);
    if (stat === undefined) return undefined;
    const cached = this.instances.get(file);
    if (cached?.stat === stat) return cached.instance;
    let instance: string | undefined;
    try {
      instance = this.read(id).instance;
    } catch {
      instance = undefined;
    }
    this.instances.set(file, { stat, instance });
    return instance;
  }

  /** Replace the session file atomically under the version it was read
   * at: refused where, at the instant before the rename, the file is
   * gone or holds other bytes (playbook-library-70). */
  write(draft: StoredDraft, version: string): void {
    const location = this.locate(draft.id);
    if (!location) throw new DraftChangedError(true);
    const file = join(location.authoringDir, `${draft.id}.json`);
    const bytes = JSON.stringify(parseStoredDraft(draft, file, draft.id));
    const stage = `${file}.${randomUUID()}.tmp`;
    const fd = openSync(stage, "wx", 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    try {
      let current: Buffer;
      try {
        current = readFileSync(file);
      } catch {
        throw new DraftChangedError(true);
      }
      if (sourceDigest(current) !== version) throw new DraftChangedError(false);
      renameSync(stage, file);
    } catch (error) {
      rmSync(stage, { force: true });
      throw error;
    }
  }

  /** Make the spec package under development in the working folder —
   * its `meta.yaml` unless a folder brought in already holds one — and
   * the record, with a fresh instance, in the project's spex repository
   * (playbook-library-70, playbook-library-51, storage-23). */
  create(id: string, now: number, location: AuthoringLocation, org: string): StoredDraft {
    if (location.workingFolder === null) {
      throw new StorageFormatError(join("authoring", `${id}.json`), i18n._({
        id: "{projectId} has no working folder on this device",
        comment: "Refusal: an authoring session belongs to a project whose working folder is on this device",
        values: { projectId: location.key },
      }));
    }
    const file = join(location.authoringDir, `${id}.json`);
    const records = join(location.authoringDir, `${id}.records.jsonl`);
    // A transcript left behind without its session file is someone's
    // history: it stays, and the id waits until it is moved aside.
    if (existsSync(records) && !existsSync(file)) {
      throw new StorageFormatError(records, i18n._({
        id: "a transcript of {id} stands without its session file; move it aside or delete it first",
        values: { id },
        comment: "Refusal: an authoring transcript with no session file holds the id a new playbook asked for",
      }));
    }
    const packagePath = draftPackagePath(id);
    const dir = join(location.workingFolder, ...packagePath.split("/"));
    mkdirSync(join(dir, "playbooks", AUTHORING_LANGUAGE, id), { recursive: true });
    if (!existsSync(join(dir, "meta.yaml"))) writeFileSync(join(dir, "meta.yaml"), authoringManifest(id, org));
    // `authoring/` inside a clone that stands: a clone gone is not made.
    if (!existsSync(location.authoringDir)) mkdirSync(location.authoringDir, { mode: 0o700 });
    const draft: StoredDraft = { format: 1, id, instance: randomUUID(), createdAt: now, touchedAt: now, package: packagePath, queued: [], failures: 0 };
    const stage = `${file}.${randomUUID()}.tmp`;
    writeFileSync(stage, JSON.stringify(parseStoredDraft(draft, file, id)), { mode: 0o600 });
    try {
      if (existsSync(file)) throw new DraftChangedError(false);
      renameSync(stage, file);
    } catch (error) {
      rmSync(stage, { force: true });
      throw error;
    }
    return draft;
  }

  /** Delete the session — its record, transcript and attachments; the
   * spec package folder stays (playbook-library-63, playbook-library-70)
   * — where its file still records the instance, or for a file that
   * will not read still holds the version, the caller read. */
  delete(id: string, expected: { instance: string } | { version: string }): void {
    const location = this.locate(id);
    if (!location) throw new DraftChangedError(true);
    const matches = "instance" in expected
      ? this.instanceOf(id) === expected.instance
      : this.fileVersion(id) === expected.version;
    if (!matches) throw new DraftChangedError(false);
    rmSync(join(location.authoringDir, `${id}.assets`), { recursive: true, force: true });
    rmSync(join(location.authoringDir, `${id}.records.jsonl`), { force: true });
    rmSync(join(location.authoringDir, `${id}.json`), { force: true });
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

  /** The transcript's last sequence and damage as the file holds them
   * now: read whole only where its stat moved since last read. */
  transcript(id: string): { lastSeq: number; incompleteAfterSeq?: number } {
    const file = this.recordsFile(id);
    const stat = statKey(file);
    if (stat === undefined) return { lastSeq: 0 };
    const cached = this.tails.get(file);
    if (cached?.stat === stat) return cached;
    const read = this.records(id);
    const tail = { stat, lastSeq: read.records.at(-1)?.seq ?? 0, ...(read.incompleteAfterSeq !== undefined ? { incompleteAfterSeq: read.incompleteAfterSeq } : {}) };
    this.tails.set(file, tail);
    return tail;
  }

  /** The transcript file's version as its stat gives it — inode, size
   * and nanosecond mtime — or undefined where it is absent: any write
   * to it moves this, as Git's index tells a changed file. */
  transcriptStat(id: string): string | undefined {
    return statKey(this.recordsFile(id));
  }

  /** Append one record after the last the transcript holds, while the
   * session file records `instance`; tokens never reach the file. A
   * damaged transcript takes nothing (playbook-library-70). */
  append(id: string, instance: string, record: TmuxPlayRecord): DraftRecord {
    const current = this.instanceOf(id);
    if (current !== instance) throw new DraftChangedError(current === undefined && !this.exists(id));
    const tail = this.transcript(id);
    if (tail.incompleteAfterSeq !== undefined) throw new DraftChangedError(false);
    const file = this.recordsFile(id);
    const stored: DraftRecord = { seq: tail.lastSeq + 1, record: sanitizeRecord(record) };
    appendFileSync(file, `${JSON.stringify(stored)}\n`);
    const stat = statKey(file);
    if (stat !== undefined) this.tails.set(file, { stat, lastSeq: stored.seq });
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
