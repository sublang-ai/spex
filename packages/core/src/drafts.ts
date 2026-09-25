// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The draft store (DR-058, playbook-library-70, storage-23): a
// playbook draft's source lives under the tracked library directory
// `<library>/<id>/<id>.md`; its state, queue, and transcript live as
// ignored files under `local/drafts/<id>/` — `draft.json`, replaced
// atomically, and `records.jsonl`, appended — written under the Spex
// home lease the store holds. No provider token enters either file.

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

import { StorageFormatError, writeApplicationFile, type StorageDiagnostic } from "./app-storage.js";
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

/** `local/drafts/<id>/draft.json`, exactly (storage-23). */
export interface StoredDraft {
  v: 1;
  id: string;
  createdAt: number;
  touchedAt: number;
  queued: string[];
  failures: number;
  compile?: StoredDraftCompile;
  proposal?: DraftProposal;
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
  closedKeys(value, ["v", "id", "createdAt", "touchedAt", "queued", "failures"], ["compile", "proposal"], file);
  need(
    value.v === 1,
    file,
    i18n._({ id: "unsupported draft version", comment: "Diagnostic for a draft file this Spex cannot read" }),
  );
  need(
    isText(value.id) && DRAFT_ID.test(value.id) && (id === undefined || value.id === id),
    file,
    i18n._({
      id: "draft id disagrees with its directory",
      comment: "Diagnostic for a damaged draft file: the id it names is not the one its folder does",
    }),
  );
  need(
    isTimestamp(value.createdAt) && isTimestamp(value.touchedAt),
    file,
    i18n._({ id: "invalid timestamps", comment: "Diagnostic for a damaged draft file: its recorded times will not read" }),
  );
  need(
    isStringArray(value.queued),
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

export class DraftStore {
  constructor(
    /** `<home>/local/drafts` */
    readonly root: string,
    /** `<home>/playbooks` */
    readonly libraryDir: string,
  ) {
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  recordDir(id: string): string {
    return join(this.root, id);
  }

  recordFile(id: string): string {
    return join(this.recordDir(id), "draft.json");
  }

  recordsFile(id: string): string {
    return join(this.recordDir(id), "records.jsonl");
  }

  draftDir(id: string): string {
    return join(this.libraryDir, id);
  }

  sourcePath(id: string): string {
    return join(this.draftDir(id), `${id}.md`);
  }

  /** Every id holding a `draft.json`, sorted. */
  ids(): string[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && DRAFT_ID.test(entry.name) && existsSync(this.recordFile(entry.name)))
      .map((entry) => entry.name)
      .sort();
  }

  exists(id: string): boolean {
    return existsSync(this.recordFile(id));
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

  /** Replace `draft.json` atomically. */
  write(draft: StoredDraft): void {
    mkdirSync(this.recordDir(draft.id), { recursive: true, mode: 0o700 });
    writeApplicationFile(this.recordFile(draft.id), parseStoredDraft(draft, this.recordFile(draft.id), draft.id));
  }

  /** Make the library directory and the record (playbook-library-70). */
  create(id: string, now: number): StoredDraft {
    mkdirSync(this.draftDir(id), { recursive: true });
    // A transcript left behind without its record would put the new
    // draft's first records after a stranger's; it goes first.
    rmSync(this.recordsFile(id), { force: true });
    const draft: StoredDraft = { v: 1, id, createdAt: now, touchedAt: now, queued: [], failures: 0 };
    this.write(draft);
    return draft;
  }

  /** Remove the record and transcript, leaving the library directory. */
  retire(id: string): void {
    rmSync(this.recordDir(id), { recursive: true, force: true });
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
    mkdirSync(this.recordDir(id), { recursive: true, mode: 0o700 });
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
