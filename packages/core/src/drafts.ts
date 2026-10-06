// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring store (DR-058, playbook-library-70, storage-23): an
// authoring session lives in the spex repository of the project it
// belongs to — `authoring/<id>.json`, replaced atomically, beside
// `authoring/<id>.records.jsonl`, appended, and `authoring/<id>.assets/`
// — written under the Spex home lease the store holds; its source stays
// under the home's library directory `<library>/<id>/<id>.md` until the
// spec packages of DR-104 hold it. No provider token enters any file.

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
 * folder, until the environment's packages hold it (DR-104). */
export const draftPackagePath = (id: string): string => `spex-packages/${id}`;

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

/** Where an authoring session is kept: its project's spex repository. */
export interface AuthoringLocation { key: string; authoringDir: string }

export class DraftStore {
  /** Which spex repository holds each authoring session. */
  private locations = new Map<string, AuthoringLocation>();

  constructor(
    /** `<home>/playbooks`, where a session's source stays this wave. */
    readonly libraryDir: string,
    /** Every clone's `authoring/` directory, read on each rescan. */
    private readonly repositories: () => AuthoringLocation[],
  ) {
    this.refresh();
  }

  /** Re-read which clone holds which session (space-20). */
  refresh(): void {
    const next = new Map<string, AuthoringLocation>();
    for (const location of this.repositories()) {
      if (!existsSync(location.authoringDir)) continue;
      for (const name of readdirSync(location.authoringDir)) {
        if (!name.endsWith(".json")) continue;
        const id = name.slice(0, -5);
        if (!DRAFT_ID.test(id) || next.has(id)) continue;
        next.set(id, location);
      }
    }
    this.locations = next;
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

  draftDir(id: string): string {
    return join(this.libraryDir, id);
  }

  sourcePath(id: string): string {
    return join(this.draftDir(id), `${id}.md`);
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

  /** Make the library directory and the record in the project's spex
   * repository (playbook-library-70, storage-23). */
  create(id: string, now: number, location: AuthoringLocation): StoredDraft {
    mkdirSync(this.draftDir(id), { recursive: true });
    this.locations.set(id, location);
    // A transcript left behind without its record would put the new
    // draft's first records after a stranger's; it goes first.
    rmSync(this.recordsFile(id), { force: true });
    const draft: StoredDraft = { format: 1, id, createdAt: now, touchedAt: now, package: draftPackagePath(id), queued: [], failures: 0 };
    this.write(draft);
    return draft;
  }

  /** Remove the record, transcript and attachments, leaving the library
   * directory. */
  retire(id: string): void {
    if (!this.locations.has(id)) return;
    rmSync(this.assetsDir(id), { recursive: true, force: true });
    rmSync(this.recordsFile(id), { force: true });
    rmSync(this.recordFile(id), { force: true });
    this.locations.delete(id);
  }

  /** Remove the record, the transcript, and the library directory. */
  delete(id: string): void {
    this.retire(id);
    rmSync(this.draftDir(id), { recursive: true, force: true });
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
    if (!existsSync(path)) return undefined;
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
