// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Chat-assisted playbook authoring (DR-058): one conversation per
// draft, run through cligent directly on the Captain's block or a
// chosen roster player in the draft directory (playbook-library-64),
// prompts composed from the shipped documents (playbook-library-65),
// directives read from the reply (playbook-library-66), the draft
// compile and its bounded failure relay (playbook-library-67/68), the
// queue that keeps the Boss ahead of automation, and the source
// streamed at tool-call granularity (playbook-library-71). The runner
// holds the runtime only for a turn (DR-051): no Cligent instance
// outlives one, and the provider token is an in-memory hint.

import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Cligent, type AgentAdapter, type AgentEvent, type CligentOptions } from "@sublang/cligent";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";

import { stripLeadingComments } from "./artifacts.js";
import { compilePlaybook, type CompileResult, type LineSpawner } from "./compile.js";
import type { ComposedConfig, ResolvedAgent } from "./config.js";
import { parseDirectives } from "./directives.js";
import { DraftStore, type StoredDraft, type StoredDraftCompile } from "./drafts.js";
import type {
  AdapterName,
  AgentSummary,
  ClarificationQuestion,
  DraftInfo,
  DraftRecord,
  DraftSource,
  DraftSourceMessage,
  DraftState,
  TmuxPlayRecord,
} from "./protocol.js";
import { CoreError } from "./session.js";
import type { Store } from "./store.js";
import type { StorageDiagnostic } from "./app-storage.js";

/** The player every authoring record names (playbook-library-64). */
export const AUTHOR_PLAYER = "author";

/** The Boss's own conversation digest is bounded on a reseed. */
const RESEED_CAP_BYTES = 24 * 1024;
/** The relay carries this much of the compiler's output. */
const RELAY_OUTPUT_LINES = 200;
/** Consecutive failed compiles with no Boss message between them that
 * end the automation (playbook-library-68). */
const RELAY_BOUND = 3;

export interface AuthorManagerOptions {
  store: Store;
  drafts: DraftStore;
  configPath: string;
  env: NodeJS.ProcessEnv;
  adapterImports?: PlayerAdapterImports;
  compileSpawner?: LineSpawner;
  /** Shared with `compile.run`: one compile per playbook id. */
  activeCompiles: Map<string, AbortController>;
  composed: () => ComposedConfig | undefined;
  readiness: (adapter: AdapterName) => boolean | null;
  /** Ids a configured playbook or a built-in holds; a draft never takes one. */
  reservedIds: () => string[];
  now?: () => number;
}

export interface AuthorManagerEvents {
  onRecord: (draftId: string, record: DraftRecord) => void;
  onState: (draft: DraftInfo) => void;
  onSource: (message: DraftSourceMessage) => void;
  onProgress: (draftId: string, line: string) => void;
  onRemoved: (draftId: string) => void;
}

type TurnOrigin =
  | { kind: "boss"; text: string; preface?: string }
  | { kind: "system"; label: string; text: string };

interface LiveDraft {
  records?: DraftRecord[];
  seq: number;
  /** Set before the runner starts, so a message arriving next queues. */
  turn?: { controller: AbortController; done?: Promise<void> };
  compile?: { controller: AbortController; done?: Promise<CompileSettled>; by: "boss" | "agent" };
  /** The provider token the previous turn of this run returned, with
   * the agent it belongs to — never written (playbook-library-64). */
  resume?: { key: string; token: string };
  /** The digest last streamed as draft.source; null when no source. */
  lastSourceDigest?: string | null;
  /** What changed since the last prompt, for "Since your last reply". */
  changes: string[];
  /** The last reply's unreadable spex blocks, named in the next prompt. */
  malformed: string[];
}

type CompileSettled =
  | { outcome: "ok"; roles: string[] }
  | { outcome: "canceled" }
  | { outcome: "failed"; phase: string; message: string };

interface ResolvedAuthorAgent {
  playerId: string | null;
  agent: ResolvedAgent;
  /** Identity of the provider conversation: a change reseeds. */
  key: string;
}

/** cligent's own default adapter table, by the adapters' public
 * subpaths: the classes every session player loads through. */
const DEFAULT_ADAPTER_IMPORTS = {
  claude: async () => (await import("@sublang/cligent/adapters/claude-code")).ClaudeCodeAdapter,
  codex: async () => (await import("@sublang/cligent/adapters/codex")).CodexAdapter,
  gemini: async () => (await import("@sublang/cligent/adapters/gemini")).GeminiAdapter,
  kimi: async () => (await import("@sublang/cligent/adapters/kimi")).KimiAdapter,
  opencode: async () => (await import("@sublang/cligent/adapters/opencode")).OpenCodeAdapter,
} as unknown as PlayerAdapterImports;

/** The installed @sublang/playbook package root, resolved from a file
 * the package exports. */
export function playbookPackageDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(dirname(require.resolve("@sublang/playbook/slc/text2gears.md")));
}

/** The four shipped documents the prompt points at (playbook-library-65). */
export function authoringDocuments(packageDir = playbookPackageDir()): { path: string; note: string }[] {
  return [
    { path: join(packageDir, "slc", "text2gears.md"), note: "the compiler's reading of a source: the law" },
    { path: join(packageDir, "reference", "sdlc", "review.md"), note: "a two-role source with rounds" },
    { path: join(packageDir, "reference", "sdlc", "code.md"), note: "a one-role source with a nested call" },
    { path: join(packageDir, "reference", "sdlc", "review.playbook", "review.gears.md"), note: "what review.md compiles to" },
  ];
}

/** The six-line slc demo, a core asset with a provenance header. */
export function slcDemoText(): string {
  const path = fileURLToPath(new URL("../assets/slc-demo/workflow.txt", import.meta.url));
  return stripLeadingComments(readFileSync(path, "utf8")).trimEnd();
}

/** slc's own elapsed rendering, so the relay reads as the band does. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const pad = (value: number): string => value.toString().padStart(2, "0");
  if (minutes < 60) return `${minutes}m${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}m`;
}

/** The failed phase and its elapsed time from the compiler's lines:
 * the last `✗ <phase> failed at … (<elapsed>)` line (playbook-library-67). */
export function failedPhaseOf(lines: readonly string[]): { phase: string; elapsed?: string } | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^✗\s+(\S+)\s+failed(?:\s+at\s+.*?)?(?:\s+\((\S+)\))?\s*$/u.exec(lines[index].trim());
    if (match) return { phase: match[1], ...(match[2] ? { elapsed: match[2] } : {}) };
  }
  return undefined;
}

/** The compiler's clarification report, when its lines carry one. */
export function clarificationOf(lines: readonly string[]): { phase?: string; questions: ClarificationQuestion[] } | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^\s*SLC_CLARIFICATION:\s*(\{.*\})\s*$/u.exec(lines[index]);
    if (!match) continue;
    try {
      const report = JSON.parse(match[1]) as { phase?: unknown; questions?: unknown };
      if (!Array.isArray(report.questions)) return undefined;
      const questions = report.questions.filter(
        (question): question is ClarificationQuestion =>
          typeof question === "object" && question !== null &&
          typeof (question as ClarificationQuestion).id === "string" &&
          typeof (question as ClarificationQuestion).question === "string",
      ).map((question) => ({
        id: question.id,
        question: question.question,
        reason: String(question.reason ?? ""),
        evidence: String(question.evidence ?? ""),
        ...(Array.isArray(question.choices) ? { choices: question.choices.map(String) } : {}),
      }));
      return { ...(typeof report.phase === "string" ? { phase: report.phase } : {}), questions };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The relay text of a failed compile (playbook-library-65). */
export function relayText(id: string, compile: StoredDraftCompile, elapsed: string): string {
  const closing = `Fix ${id}.md and explain the cause; you may ask for another compile with a compile block, or ask the Boss if the compiler's questions need their answer.`;
  if (compile.questions && compile.questions.length > 0) {
    const questions = compile.questions.flatMap((question) => [
      `- [${question.id}] ${question.question}`,
      `  Reason: ${question.reason}`,
      `  Evidence: ${question.evidence}`,
      ...(question.choices ? [`  Choices: ${question.choices.join(" | ")}`] : []),
    ]);
    return [
      `The compile of ${id} stopped at ${compile.phase ?? "the compiler"} after ${elapsed}: the compiler asks for clarification.`,
      "Questions:",
      ...questions,
      closing,
    ].join("\n");
  }
  return [
    `The compile of ${id} failed at ${compile.phase ?? "the compiler"} after ${elapsed}.`,
    `--- compiler output (last ${RELAY_OUTPUT_LINES} lines) ---`,
    compile.output ?? "",
    "--- end ---",
    closing,
  ].join("\n");
}

/** The success text (playbook-library-65). */
export function successText(id: string, roles: readonly string[]): string {
  return `The compile of ${id} succeeded; the roles are ${roles.join(", ")}. Propose the registration in a register block.`;
}

function agentSummaryOf(agent: ResolvedAgent): AgentSummary {
  return {
    adapter: agent.adapter,
    ...(agent.model !== undefined ? { model: agent.model } : {}),
    ...(agent.effort !== undefined ? { effort: agent.effort } : {}),
    ...(agent.fastMode !== undefined ? { fastMode: agent.fastMode } : {}),
  };
}

function firstLineOf(markdown: string): string | null {
  const line = markdown.split(/\r?\n/).find((entry) => entry.trim() !== "");
  return line === undefined ? null : line.trim();
}

/** The source's first prose paragraph — the Register tab's default intent. */
export function firstProseParagraph(markdown: string): string | undefined {
  const paragraphs = markdown.split(/\r?\n\s*\r?\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.trim();
    if (!text || /^(#|-|\*|>|```|\d+\.)/.test(text) || /^Roles:/i.test(text)) continue;
    return text.replace(/\s+/g, " ");
  }
  return undefined;
}

export class AuthorManager {
  readonly events: AuthorManagerEvents = {
    onRecord: () => {},
    onState: () => {},
    onSource: () => {},
    onProgress: () => {},
    onRemoved: () => {},
  };
  private readonly live = new Map<string, LiveDraft>();
  private readonly problems = new Map<string, StorageDiagnostic>();
  private readonly now: () => number;
  private stopping = false;

  constructor(private readonly options: AuthorManagerOptions) {
    this.now = options.now ?? Date.now;
  }

  private get drafts(): DraftStore {
    return this.options.drafts;
  }

  // -- lifecycle ------------------------------------------------------------

  /** Fold the drafts on disk at core start (playbook-library-70): a
   * compile running when the core stopped is rewritten as interrupted,
   * and a turn cut by a crash is closed in the transcript. */
  start(): void {
    for (const id of this.drafts.ids()) {
      let draft: StoredDraft;
      try {
        draft = this.drafts.read(id);
      } catch (error) {
        this.problems.set(id, this.drafts.diagnostic(error, id));
        continue;
      }
      const live = this.liveOf(id);
      this.closeDanglingTurn(id, live);
      if (draft.compile?.outcome === "running") {
        draft.compile = { ...draft.compile, outcome: "interrupted" };
        draft.touchedAt = this.now();
        this.drafts.write(draft);
        this.status(id, live, "◇ Compile interrupted when Spex closed");
      }
    }
  }

  /** Nothing outlives the shutdown (DR-051): turns abort and are
   * awaited; a compile in flight is left as running on disk so the
   * next start reads it as interrupted (playbook-library-59). */
  markStopping(): void {
    this.stopping = true;
  }

  async stopAll(): Promise<void> {
    this.stopping = true;
    const pending: Promise<void>[] = [];
    for (const live of this.live.values()) {
      if (live.turn) {
        live.turn.controller.abort();
        pending.push(live.turn.done ?? Promise.resolve());
      }
    }
    await Promise.allSettled(pending);
  }

  diagnostics(): StorageDiagnostic[] {
    return [...this.problems.values()];
  }

  // -- reads ----------------------------------------------------------------

  list(): DraftInfo[] {
    const out: DraftInfo[] = [];
    for (const id of this.drafts.ids()) {
      try {
        out.push(this.describe(id));
      } catch (error) {
        if (error instanceof CoreError) continue;
        this.problems.set(id, this.drafts.diagnostic(error, id));
      }
    }
    return out;
  }

  has(id: string): boolean {
    return this.drafts.exists(id);
  }

  activity(id: string): DraftInfo["activity"] {
    const live = this.live.get(id);
    return live?.turn ? "turn" : live?.compile || this.options.activeCompiles.has(id) ? "compiling" : "idle";
  }

  describe(id: string): DraftInfo {
    const draft = this.read(id);
    return this.info(draft);
  }

  open(id: string, afterSeq = 0): { draft: DraftInfo; source: DraftSource | null; records: DraftRecord[] } {
    const draft = this.read(id);
    const live = this.liveOf(id);
    const source = this.drafts.readSource(id);
    if (source) live.lastSourceDigest = source.sha256;
    const records = this.recordsOf(id, live).filter((entry) => entry.seq > afterSeq);
    return {
      draft: this.info(draft),
      source: source ? { markdown: source.markdown, version: source.version, mtime: source.mtime } : null,
      records,
    };
  }

  /** The Register tab's derived defaults (playbook-library-61). */
  derivedIntent(id: string): string | undefined {
    const source = this.drafts.readSource(id);
    return source ? firstProseParagraph(source.markdown) : undefined;
  }

  private read(id: string): StoredDraft {
    if (!this.drafts.exists(id)) throw new CoreError("not_found", `no draft ${id}`);
    try {
      const draft = this.drafts.read(id);
      this.problems.delete(id);
      return draft;
    } catch (error) {
      const diagnostic = this.drafts.diagnostic(error, id);
      this.problems.set(id, diagnostic);
      throw new CoreError("invalid_request", `${diagnostic.file}: ${diagnostic.reason}`);
    }
  }

  private info(draft: StoredDraft): DraftInfo {
    const id = draft.id;
    const live = this.live.get(id);
    const dirExists = existsSync(this.drafts.draftDir(id));
    const source = dirExists ? this.drafts.readSource(id) : undefined;
    const activity = this.activity(id);
    const resolved = this.resolveAgent(id);
    const compile = draft.compile;
    let state: DraftState;
    if (activity === "compiling") state = "compiling";
    else if (!source) state = "no-source";
    else if (compile?.outcome === "failed") state = "failed";
    else if (compile?.outcome === "interrupted") state = "interrupted";
    else if (compile?.outcome === "ok") state = compile.sourceSha256 === source.sha256 ? "compiled" : "changed";
    else state = "draft";
    return {
      id,
      createdAt: draft.createdAt,
      touchedAt: draft.touchedAt,
      firstLine: source ? firstLineOf(source.markdown) : null,
      ...(dirExists ? {} : { sourceMissing: true }),
      activity,
      state,
      queued: [...draft.queued],
      player: resolved.playerId,
      agent: agentSummaryOf(resolved.agent),
      ready: this.options.readiness(resolved.agent.adapter),
      ...(compile ? { compile: (({ sourceSha256: _digest, ...rest }) => rest)(compile) } : {}),
      failures: draft.failures,
      ...(draft.proposal ? { proposal: draft.proposal } : {}),
      ...(live && live.malformed.length > 0 ? { malformedDirectives: [...live.malformed] } : {}),
    };
  }

  private liveOf(id: string): LiveDraft {
    let live = this.live.get(id);
    if (!live) {
      live = { seq: 0, changes: [], malformed: [] };
      this.live.set(id, live);
    }
    return live;
  }

  private recordsOf(id: string, live: LiveDraft): DraftRecord[] {
    if (!live.records) {
      const read = this.drafts.records(id);
      live.records = read.records;
      live.seq = read.records.at(-1)?.seq ?? 0;
      if (read.incompleteAfterSeq !== undefined) {
        this.problems.set(id, {
          file: this.drafts.recordsFile(id),
          reason: `damaged transcript after record ${read.incompleteAfterSeq}; the readable prefix is served`,
          blocking: false,
        });
      }
    }
    return live.records;
  }

  private publish(id: string): void {
    try {
      this.events.onState(this.describe(id));
    } catch {
      // A vanished or damaged draft has no state to publish.
    }
  }

  private save(draft: StoredDraft): void {
    draft.touchedAt = this.now();
    this.drafts.write(draft);
  }

  // -- records --------------------------------------------------------------

  private append(id: string, live: LiveDraft, record: TmuxPlayRecord): DraftRecord {
    this.recordsOf(id, live);
    live.seq += 1;
    const stored = this.drafts.append(id, live.seq, record);
    live.records?.push(stored);
    this.events.onRecord(id, stored);
    return stored;
  }

  private status(id: string, live: LiveDraft, message: string, turnId: number | null = null): void {
    this.append(id, live, { type: "captain_status", turnId, timestamp: this.now(), message } as TmuxPlayRecord);
  }

  private runtimeError(id: string, live: LiveDraft, message: string, turnId: number | null = null): void {
    this.append(id, live, { type: "runtime_error", turnId, timestamp: this.now(), message } as TmuxPlayRecord);
  }

  private nextTurnId(id: string, live: LiveDraft): number {
    let max = 0;
    for (const { record } of this.recordsOf(id, live)) {
      if (record.type === "turn_started") max = Math.max(max, (record as { turn: { id: number } }).turn.id);
    }
    return max + 1;
  }

  /** A turn left open by a crash ends in the transcript, so a replay
   * never shows a run that is not running. */
  private closeDanglingTurn(id: string, live: LiveDraft): void {
    const records = this.recordsOf(id, live);
    let openTurn: number | undefined;
    let openPlayer = false;
    for (const { record } of records) {
      if (record.type === "turn_started") {
        openTurn = (record as { turn: { id: number } }).turn.id;
        openPlayer = false;
      } else if (record.type === "turn_finished" || record.type === "turn_aborted") openTurn = undefined;
      else if (record.type === "player_prompt") openPlayer = true;
      else if (record.type === "player_finished") openPlayer = false;
    }
    if (openTurn === undefined) return;
    if (openPlayer) {
      this.append(id, live, {
        type: "player_finished", turnId: openTurn, timestamp: this.now(), playerId: AUTHOR_PLAYER,
        result: { status: "aborted", playerId: AUTHOR_PLAYER, turnId: openTurn, error: "interrupted when Spex closed" },
      } as TmuxPlayRecord);
    }
    this.append(id, live, { type: "turn_aborted", turnId: openTurn, timestamp: this.now(), reason: "interrupted when Spex closed" } as TmuxPlayRecord);
  }

  // -- source ---------------------------------------------------------------

  /** Read `<id>.md` and, when its digest differs from the last one
   * streamed, broadcast it (playbook-library-71). */
  refreshSource(id: string, live: LiveDraft = this.liveOf(id)): void {
    const source = this.drafts.readSource(id);
    const digest = source?.sha256 ?? null;
    if (live.lastSourceDigest === digest) return;
    live.lastSourceDigest = digest;
    if (source) {
      this.events.onSource({ type: "draft.source", draftId: id, markdown: source.markdown, version: source.version, mtime: source.mtime });
    }
    // The chip may have moved: no source → draft, compiled → changed.
    this.publish(id);
  }

  // -- commands -------------------------------------------------------------

  create(id: string): DraftInfo {
    if (this.options.reservedIds().includes(id)) {
      throw new CoreError("invalid_request", `${id} is already a configured playbook or a built-in; pick another id`);
    }
    if (this.drafts.exists(id)) throw new CoreError("conflict", `draft ${id} already exists; open it`);
    const draft = this.drafts.create(id, this.now());
    const live = this.liveOf(id);
    live.records = [];
    live.seq = 0;
    live.lastSourceDigest = this.drafts.readSource(id)?.sha256 ?? null;
    const info = this.info(draft);
    this.events.onState(info);
    return info;
  }

  /** A Boss message: dispatched at once while the draft is idle, else
   * queued and dispatched in order when it is (core-service-96). */
  send(id: string, text: string): { accepted: true; queued: boolean } {
    const draft = this.read(id);
    const live = this.liveOf(id);
    // The Boss spoke: the relay count starts over (playbook-library-68).
    draft.failures = 0;
    if (this.activity(id) !== "idle") {
      draft.queued.push(text);
      this.save(draft);
      this.publish(id);
      return { accepted: true, queued: true };
    }
    this.save(draft);
    this.startTurn(id, live, { kind: "boss", text });
    return { accepted: true, queued: false };
  }

  abort(id: string): { aborted: boolean } {
    this.read(id);
    const live = this.live.get(id);
    if (!live?.turn) return { aborted: false };
    live.turn.controller.abort();
    return { aborted: true };
  }

  /** The Boss's own write: refused while the agent may be editing the
   * same file (playbook-library-70). */
  writeSource(
    id: string,
    input: { content?: string; sourcePath?: string; baseVersion?: string },
  ): { version: string; mtime: number } {
    this.read(id);
    this.assertIdle(id);
    if ((input.content === undefined) === (input.sourcePath === undefined)) {
      throw new CoreError("invalid_request", "send either the source text or a file path");
    }
    let content: string;
    if (input.sourcePath !== undefined) {
      const path = resolve(input.sourcePath);
      if (!existsSync(path) || !statSync(path).isFile()) throw new CoreError("invalid_request", `${path} is not a file`);
      content = readFileSync(path, "utf8");
    } else {
      content = input.content as string;
    }
    if (content.trim() === "") throw new CoreError("invalid_request", "the source is empty; nothing was written");
    const written = this.drafts.writeSource(id, content, input.baseVersion);
    if (!written.ok) throw new CoreError(written.code, written.message);
    const live = this.liveOf(id);
    live.changes.push("the Boss replaced the source");
    const draft = this.read(id);
    this.save(draft);
    this.refreshSource(id, live);
    this.publish(id);
    return { version: written.version, mtime: written.mtime };
  }

  /** The Boss's Compile: resolves when the compile settles. */
  async compile(id: string): Promise<{ ok: true; roles: string[] }> {
    this.read(id);
    const started = this.beginCompile(id, "boss");
    if (!started.ok) throw new CoreError(started.code, started.message);
    const settled = await started.done;
    if (settled.outcome === "ok") return { ok: true, roles: settled.roles };
    if (settled.outcome === "canceled") throw new CoreError("aborted", "compile canceled");
    throw new CoreError("invalid_request", settled.message);
  }

  /** Re-package the last successful compile with the confirmed command
   * and intent (playbook-library-69); the caller writes the config and
   * then retires the draft. */
  async prepareRegistration(id: string, command: string, intent: string, libraryDir: string): Promise<CompileResult> {
    const draft = this.read(id);
    this.assertIdle(id);
    if (draft.compile?.outcome !== "ok" || !draft.compile.roles) {
      throw new CoreError("invalid_request", "compile the draft successfully before registering it");
    }
    if (this.options.activeCompiles.has(id)) throw new CoreError("busy", `a compile is already running for ${id}`);
    const controller = new AbortController();
    this.options.activeCompiles.set(id, controller);
    try {
      return await compilePlaybook({
        playbookId: id,
        configPath: this.options.configPath,
        source: {},
        roles: draft.compile.roles,
        command,
        intent,
        libraryDir,
        env: this.options.env,
        skipSlc: true,
        signal: controller.signal,
        ...(this.options.compileSpawner ? { spawner: this.options.compileSpawner } : {}),
      });
    } catch (error) {
      throw new CoreError("invalid_request", error instanceof Error ? error.message : String(error));
    } finally {
      this.options.activeCompiles.delete(id);
    }
  }

  /** The draft is registered: its record and preference go, the
   * directory stays with the playbook (playbook-library-70). */
  retire(id: string): void {
    this.drafts.retire(id);
    this.options.store.deletePref(`draft:${id}:player`);
    this.live.delete(id);
    this.problems.delete(id);
    this.events.onRemoved(id);
  }

  setPlayer(id: string, playerId: string | null): DraftInfo {
    const draft = this.read(id);
    const live = this.liveOf(id);
    if (live.turn) throw new CoreError("busy", "wait for the reply before switching the agent");
    const key = `draft:${id}:player`;
    if (playerId === null) {
      this.options.store.deletePref(key);
    } else {
      const composed = this.options.composed();
      if (!composed?.players.some((player) => player.id === playerId)) {
        throw new CoreError("invalid_request", `no roster player ${playerId}`);
      }
      this.options.store.setPref(key, playerId);
    }
    this.status(id, live, `◇ Now answering: ${playerId ?? "Captain"} — the conversation so far was replayed to it`);
    this.save(draft);
    const info = this.describe(id);
    this.events.onState(info);
    return info;
  }

  delete(id: string): void {
    this.read(id);
    this.assertIdle(id);
    this.drafts.delete(id);
    this.options.store.deletePref(`draft:${id}:player`);
    this.live.delete(id);
    this.problems.delete(id);
    this.events.onRemoved(id);
  }

  private assertIdle(id: string): void {
    const activity = this.activity(id);
    if (activity === "turn") throw new CoreError("busy", "wait for the reply, or abort it, first");
    if (activity === "compiling") throw new CoreError("busy", `a compile is running for ${id}; cancel it first`);
  }

  // -- the agent ------------------------------------------------------------

  /** The block that answers: the preferred roster player's, else the
   * Captain's (playbook-library-64, storage-5). */
  resolveAgent(id: string): ResolvedAuthorAgent {
    const composed = this.options.composed();
    const preferred = this.options.store.getPref<string>(`draft:${id}:player`);
    const player = preferred ? composed?.players.find((entry) => entry.id === preferred) : undefined;
    const agent: ResolvedAgent = player ?? composed?.captainAgent ?? { adapter: "claude" };
    const playerId = player ? player.id : null;
    return {
      playerId,
      agent,
      key: [playerId ?? "captain", agent.adapter, agent.model ?? "", agent.effort ?? "", String(agent.fastMode ?? "")].join("|"),
    };
  }

  private async loadAdapter(adapter: AdapterName): Promise<new () => AgentAdapter<string, boolean>> {
    const table = this.options.adapterImports ?? DEFAULT_ADAPTER_IMPORTS;
    const load = (table as unknown as Record<string, (() => Promise<unknown>) | undefined>)[adapter];
    if (!load) throw new Error(`no adapter runtime for ${adapter}`);
    return (await load()) as new () => AgentAdapter<string, boolean>;
  }

  // -- turns ----------------------------------------------------------------

  private startTurn(id: string, live: LiveDraft, origin: TurnOrigin): void {
    const controller = new AbortController();
    const entry: NonNullable<LiveDraft["turn"]> = { controller };
    live.turn = entry;
    entry.done = this.runTurn(id, live, origin, controller).catch((error) => {
      console.error(`spex: authoring turn failed: ${String(error)}`);
    });
    this.publish(id);
  }

  private async runTurn(id: string, live: LiveDraft, origin: TurnOrigin, controller: AbortController): Promise<void> {
    const turnId = this.nextTurnId(id, live);
    const at = this.now();
    const shown = origin.kind === "boss" ? origin.text : origin.label;
    this.append(id, live, { type: "turn_started", turnId, timestamp: at, turn: { id: turnId, prompt: shown, timestamp: at } } as TmuxPlayRecord);
    let aborted = false;
    let reply: string | undefined;
    try {
      const draft = this.read(id);
      const resolved = this.resolveAgent(id);
      const composed = this.options.composed();
      if (!composed) throw new Error("the config is not valid; fix it in Settings before the agent can answer");
      const Adapter = await this.loadAdapter(resolved.agent.adapter);
      // A conversation continues only within one run and one agent
      // (DR-051): anything else starts fresh, reseeded from the transcript.
      let resume = live.resume && live.resume.key === resolved.key ? live.resume.token : undefined;
      let mode: "first" | "later" | "reseed" = resume ? "later" : this.hasPriorTurns(id, live, turnId) ? "reseed" : "first";
      let reseeded = false;
      for (;;) {
        const prompt = this.composePrompt(id, live, draft, resolved, origin, mode);
        const run = await this.runAgent(id, live, turnId, Adapter, resolved.agent, prompt, controller, resume);
        if (run.status === "interrupted") {
          aborted = true;
          break;
        }
        if (run.status === "error" && run.resumeRejected && resume && !reseeded) {
          // The provider dropped the conversation: once, replay it.
          live.resume = undefined;
          resume = undefined;
          reseeded = true;
          mode = "reseed";
          this.status(id, live, "◇ The provider rejected the resumed conversation — replaying it", turnId);
          continue;
        }
        if (run.resumeToken) live.resume = { key: resolved.key, token: run.resumeToken };
        else if (run.status !== "success") live.resume = undefined;
        if (run.status === "success") reply = run.result ?? run.text;
        break;
      }
    } catch (error) {
      this.runtimeError(id, live, error instanceof Error ? error.message : String(error), turnId);
    } finally {
      this.refreshSource(id, live);
      this.append(id, live, aborted
        ? ({ type: "turn_aborted", turnId, timestamp: this.now(), reason: "aborted by the Boss" } as TmuxPlayRecord)
        : ({ type: "turn_finished", turnId, timestamp: this.now() } as TmuxPlayRecord));
      if (live.turn?.controller === controller) live.turn = undefined;
    }
    // The turn is over: its directives act (playbook-library-66), then
    // the queue dispatches if nothing started (core-service-96).
    if (reply !== undefined) this.actOnReply(id, live, reply);
    this.publish(id);
    this.afterSettle(id, live);
  }

  private hasPriorTurns(id: string, live: LiveDraft, turnId: number): boolean {
    return this.recordsOf(id, live).some((entry) => entry.record.type === "turn_started" && (entry.record as { turn: { id: number } }).turn.id < turnId);
  }

  private async runAgent(
    id: string,
    live: LiveDraft,
    turnId: number,
    Adapter: new () => AgentAdapter<string, boolean>,
    agent: ResolvedAgent,
    prompt: string,
    controller: AbortController,
    resume: string | undefined,
  ): Promise<{ status: string; result?: string; text: string; resumeToken?: string; resumeRejected: boolean; error?: string }> {
    this.append(id, live, { type: "player_prompt", turnId, timestamp: this.now(), playerId: AUTHOR_PLAYER, prompt } as TmuxPlayRecord);
    // The block's model, effort, and fast mode; `{ mode: "auto" }` alone
    // as permissions; no tool lists, no maxTurns (playbook-library-64).
    const options: CligentOptions<string, boolean> = {
      role: AUTHOR_PLAYER,
      cwd: this.drafts.draftDir(id),
      ...(agent.model !== undefined ? { model: agent.model } : {}),
      ...(agent.effort !== undefined ? { effort: agent.effort } : {}),
      ...(agent.fastMode !== undefined ? { fastMode: agent.fastMode } : {}),
      permissions: { mode: "auto" },
    };
    const cligent = new Cligent<string, boolean>(new Adapter(), options);
    const text: string[] = [];
    let status = "error";
    let result: string | undefined;
    let resumeToken: string | undefined;
    let resumeRejected = false;
    let error: string | undefined;
    let errorCode: string | undefined;
    for await (const event of cligent.run(prompt, { abortSignal: controller.signal, resume: resume ?? false })) {
      const typed = event as AgentEvent;
      if (typed.type === "text_delta") text.push(typed.payload.delta);
      else if (typed.type === "text") text.push(typed.payload.content);
      else if (typed.type === "error") {
        error = typed.payload.message;
        if (typed.payload.code === "SESSION_RESUME_REJECTED") {
          resumeRejected = true;
          errorCode = typed.payload.code;
        }
      } else if (typed.type === "done") {
        status = typed.payload.status;
        result = typed.payload.result;
        resumeToken = typed.payload.resumeToken;
      }
      this.append(id, live, { type: "player_event", turnId, timestamp: this.now(), playerId: AUTHOR_PLAYER, event } as TmuxPlayRecord);
      if (typed.type === "tool_result") this.refreshSource(id, live);
    }
    const finalText = result ?? text.join("");
    this.append(id, live, {
      type: "player_finished", turnId, timestamp: this.now(), playerId: AUTHOR_PLAYER,
      result: {
        status: status === "success" ? "ok" : status === "interrupted" ? "aborted" : "error",
        playerId: AUTHOR_PLAYER, turnId,
        ...(finalText ? { finalText } : {}),
        ...(status !== "success" && status !== "interrupted" ? { error: error ?? `the agent ended with status ${status}` } : {}),
        ...(errorCode ? { errorCode } : {}),
      },
    } as TmuxPlayRecord);
    return { status, result, text: text.join(""), resumeToken, resumeRejected, error };
  }

  /** The reply's directives (playbook-library-66). */
  private actOnReply(id: string, live: LiveDraft, finalText: string): void {
    const parsed = parseDirectives(finalText);
    live.malformed = parsed.malformed;
    if (parsed.register) {
      try {
        const draft = this.read(id);
        draft.proposal = parsed.register;
        this.save(draft);
      } catch {
        return;
      }
    }
    if (parsed.compile) {
      const started = this.beginCompile(id, "agent");
      if (!started.ok) this.status(id, live, `◇ Compile skipped: ${started.message}`);
    }
  }

  /** Dispatch the queue when the draft is idle (core-service-96). */
  private afterSettle(id: string, live: LiveDraft, preface?: string): void {
    if (this.stopping || this.activity(id) !== "idle") return;
    let draft: StoredDraft;
    try {
      draft = this.read(id);
    } catch {
      return;
    }
    const text = draft.queued.shift();
    if (text === undefined) return;
    draft.failures = 0;
    this.save(draft);
    this.startTurn(id, live, { kind: "boss", text, ...(preface ? { preface } : {}) });
  }

  // -- prompts --------------------------------------------------------------

  private composePrompt(
    id: string,
    live: LiveDraft,
    draft: StoredDraft,
    resolved: ResolvedAuthorAgent,
    origin: TurnOrigin,
    mode: "first" | "later" | "reseed",
  ): string {
    const parts: string[] = [];
    if (live.malformed.length > 0) {
      parts.push(
        `Spex could not read ${live.malformed.length === 1 ? "a spex block" : `${live.malformed.length} spex blocks`} in your last reply; ${live.malformed.length === 1 ? "it was" : "they were"} left as code. Each must be YAML with one \`kind\` — \`compile\` alone, or \`register\` with command, intent, and players — and nothing else:\n` +
          live.malformed.map((block) => `  > ${block.split("\n").join("\n  > ")}`).join("\n"),
      );
      live.malformed = [];
    }
    if (mode === "later") {
      if (live.changes.length > 0) parts.push(`Since your last reply: ${live.changes.join("; ")}.`);
    } else {
      parts.push(this.preamble(id, draft, resolved));
      if (mode === "reseed") parts.push(this.conversationSoFar(id, live));
    }
    live.changes = [];
    if (origin.kind === "boss") {
      parts.push(`${origin.preface ? `${origin.preface}\n\n` : ""}Boss: ${origin.text}`);
    } else {
      parts.push(`Spex: ${origin.text}`);
    }
    return parts.join("\n\n");
  }

  private preamble(id: string, draft: StoredDraft, resolved: ResolvedAuthorAgent): string {
    const sourcePath = this.drafts.sourcePath(id);
    const documents = authoringDocuments();
    const width = Math.max(...documents.map((document) => document.path.length)) + 2;
    const compile = draft.compile;
    const lastCompile =
      !compile ? "never"
      : compile.outcome === "ok" ? `ok at ${new Date(compile.at).toISOString()}`
      : compile.outcome === "failed" ? `failed at ${compile.phase ?? "the compiler"}`
      : compile.outcome;
    const composed = this.options.composed();
    const roster = (composed?.players ?? []).map((player) => `${player.id} (${player.adapter}${player.model ? ` · ${player.model}` : ""})`);
    return [
      `You are helping the Boss write a Spex playbook: a markdown source the slc compiler turns into a state machine that coordinates agents. Write and edit exactly one file — ${sourcePath} — with your file tools. Never run slc, git, or npm; Spex compiles when asked.`,
      "",
      "What a source is (read the documents below before writing anything non-trivial):",
      "- An H1 title, then `Roles:` — a list of capitalized, unique role names (two or three is right).",
      '- Behaviors as prose: "When <condition>, Captain shall prompt <Role>:" followed by the prompt as a blockquote, one point per line, or a fenced ```markdown instruction block introduced as the instruction.',
      '- Runtime values the role cannot otherwise see are relayed in quotes (`>`) as <placeholders>: "> Original request: <caller-input>".',
      "- `Results:` bullets only where a behavior has several outcomes, or a later prompt consumes its output; a relayed whole reply is declared as `<field>: <verbatim final text>`.",
      '- A nested call: "Captain shall call playbook `id`:" with the input template blockquoted.',
      "- Boss questions resume the same behavior; do not write a second behavior for the answer.",
      "",
      "The shortest complete source is slc's demo:",
      slcDemoText().split("\n").map((line) => `  ${line}`).join("\n"),
      "",
      "Documents (absolute paths in the installed @sublang/playbook package):",
      ...documents.map((document) => `  ${document.path.padEnd(width)}— ${document.note}`),
      "",
      "How you talk to Spex — fenced blocks in your reply, YAML, one `kind` each; anything else is prose:",
      "  ```spex",
      "  kind: compile",
      "  ```",
      "  ```spex",
      "  kind: register",
      "  command: <lowercase command, defaults to the id>",
      "  intent: <one line the Captain routes free text with>",
      "  players:",
      "    <Role>: <player id, e.g. dev.coder>",
      "  ```",
      "Ask for a compile only when the Boss has said the source is ready or asked for it, or after a relayed compile failure. Propose registration after a compile succeeds. The id and the roles are fixed by the source; you propose neither.",
      "",
      "Working rules: ask at most one question per reply, and only when the answer changes the roles or the ending; otherwise write a first draft at once and say in three lines what it does; keep prompts as the player will read them; after a relayed failure, fix the source and explain the cause.",
      "",
      `Draft state: id=${id} · source=${existsSync(sourcePath) ? sourcePath : "none"} · last compile=${lastCompile}${resolved.playerId ? ` · answering as ${resolved.playerId}` : ""}`,
      roster.length > 0
        ? `Roster players you may name: ${roster.join(", ")}`
        : "Roster players you may name: none yet — propose new ones as dev.<role>",
    ].join("\n");
  }

  /** The Boss, system, and agent final texts in order, oldest dropped
   * past the cap (playbook-library-65). */
  private conversationSoFar(id: string, live: LiveDraft): string {
    const entries: string[] = [];
    for (const { record } of this.recordsOf(id, live)) {
      if (record.type === "turn_started") {
        const prompt = (record as { turn: { prompt: string } }).turn.prompt;
        entries.push(prompt.startsWith("Spex:") ? `System: ${prompt.slice("Spex:".length).trim()}` : `Boss: ${prompt}`);
      } else if (record.type === "captain_status") {
        entries.push(`System: ${(record as { message: string }).message}`);
      } else if (record.type === "player_finished") {
        const result = (record as { result: { finalText?: string } }).result;
        if (result.finalText) entries.push(`Agent: ${result.finalText}`);
      }
    }
    let size = entries.reduce((sum, entry) => sum + Buffer.byteLength(entry, "utf8") + 1, 0);
    while (entries.length > 1 && size > RESEED_CAP_BYTES) {
      size -= Buffer.byteLength(entries[0], "utf8") + 1;
      entries.shift();
    }
    return `Conversation so far:\n${entries.join("\n")}`;
  }

  // -- compiles -------------------------------------------------------------

  /**
   * Start the draft's compile as the id's one compile (playbook-library-67,
   * core-service-96). The activity flips before anything awaits, so a
   * message arriving next queues.
   */
  beginCompile(id: string, by: "boss" | "agent"): { ok: true; done: Promise<CompileSettled> } | { ok: false; code: CoreError["code"]; message: string } {
    const live = this.liveOf(id);
    if (live.turn) return { ok: false, code: "busy", message: "Waits for the reply" };
    if (live.compile || this.options.activeCompiles.has(id)) {
      return { ok: false, code: "busy", message: `a compile is already running for ${id}` };
    }
    if (!existsSync(this.drafts.sourcePath(id))) return { ok: false, code: "invalid_request", message: "No source yet" };
    const controller = new AbortController();
    this.options.activeCompiles.set(id, controller);
    const entry: NonNullable<LiveDraft["compile"]> = { controller, by };
    live.compile = entry;
    const done = this.runCompile(id, live, by, controller);
    entry.done = done;
    return { ok: true, done };
  }

  private async runCompile(id: string, live: LiveDraft, by: "boss" | "agent", controller: AbortController): Promise<CompileSettled> {
    const startedAt = this.now();
    const lines: string[] = [];
    let sawCompiler = false;
    let settled: CompileSettled;
    try {
      const draft = this.read(id);
      draft.compile = { at: startedAt, by, outcome: "running" };
      this.save(draft);
      this.status(id, live, `◇ Compiling — asked by ${by === "boss" ? "you" : "the agent"}`);
      this.publish(id);
      const result = await compilePlaybook({
        playbookId: id,
        configPath: this.options.configPath,
        // The `<id>.md` already in the draft directory: nothing is copied.
        source: {},
        roles: [],
        command: id,
        intent: "(draft)",
        libraryDir: this.drafts.libraryDir,
        env: this.options.env,
        signal: controller.signal,
        ...(this.options.compileSpawner ? { spawner: this.options.compileSpawner } : {}),
        onProgress: (line) => {
          if (controller.signal.aborted) return;
          if (line.startsWith("running:")) sawCompiler = true;
          lines.push(line);
          this.events.onProgress(id, line);
        },
      });
      settled = { outcome: "ok", roles: result.roles };
    } catch (error) {
      if (controller.signal.aborted) settled = { outcome: "canceled" };
      else {
        const message = error instanceof Error ? error.message : String(error);
        const clarification = clarificationOf(lines);
        const failed = failedPhaseOf(lines);
        const phase = clarification?.phase ?? failed?.phase ?? (sawCompiler ? "packaging" : "toolchain");
        settled = { outcome: "failed", phase, message: phase === "toolchain" ? message : `compile failed at ${phase}: ${message}` };
      }
    } finally {
      this.options.activeCompiles.delete(id);
      if (live.compile?.controller === controller) live.compile = undefined;
    }
    if (this.stopping) return settled;
    this.settleCompile(id, live, settled, lines, startedAt);
    return settled;
  }

  /** Record the outcome and start the follow-up (playbook-library-68). */
  private settleCompile(id: string, live: LiveDraft, settled: CompileSettled, lines: string[], startedAt: number): void {
    let draft: StoredDraft;
    try {
      draft = this.read(id);
    } catch {
      return;
    }
    const base = draft.compile ?? { at: startedAt, by: "boss" as const, outcome: "running" as const };
    const source = this.drafts.readSource(id);
    let preface: string | undefined;
    let relay = false;
    if (settled.outcome === "ok") {
      draft.compile = { at: base.at, by: base.by, outcome: "ok", roles: settled.roles, ...(source ? { sourceSha256: source.sha256 } : {}) };
      draft.failures = 0;
      live.changes.push(`a compile succeeded with the roles ${settled.roles.join(", ")}`);
      this.status(id, live, `◇ Compiled — roles: ${settled.roles.join(", ")}`);
      preface = successText(id, settled.roles);
      relay = true;
    } else if (settled.outcome === "canceled") {
      draft.compile = { at: base.at, by: base.by, outcome: "canceled" };
      live.changes.push("a compile was canceled");
      this.status(id, live, "◇ Compile canceled");
    } else {
      const clarification = clarificationOf(lines);
      const failed = failedPhaseOf(lines);
      const output = lines.slice(-RELAY_OUTPUT_LINES).join("\n");
      draft.compile = {
        at: base.at, by: base.by, outcome: "failed", phase: settled.phase,
        output: settled.phase === "toolchain" ? settled.message : output,
        ...(clarification ? { questions: clarification.questions } : {}),
      };
      if (settled.phase === "toolchain") {
        live.changes.push("a compile failed before the compiler ran");
        this.status(id, live, `◇ Compile failed before the compiler ran: ${settled.message}`);
      } else {
        draft.failures += 1;
        live.changes.push(`a compile failed at ${settled.phase}`);
        preface = relayText(id, draft.compile, failed?.elapsed ?? formatElapsed(this.now() - startedAt));
        if (draft.queued.length > 0) {
          this.status(id, live, `◇ Compile failed at ${settled.phase} — waiting for your queued message`);
        } else if (draft.failures >= RELAY_BOUND) {
          this.status(id, live, `◇ Compile failed at ${settled.phase} — three in a row; tell the agent how to proceed`);
        } else {
          this.status(id, live, `◇ Compile failed at ${settled.phase} — sent to the agent`);
          relay = true;
        }
      }
    }
    this.save(draft);
    this.publish(id);
    // A queued Boss message always goes first, carrying the follow-up
    // text as its preface (playbook-library-68).
    if (draft.queued.length > 0) {
      this.afterSettle(id, live, preface);
      return;
    }
    if (!relay || !preface) return;
    if (settled.outcome === "ok") {
      this.startTurn(id, live, { kind: "system", label: "Spex: the compile succeeded — asking for a registration proposal", text: preface });
    } else if (settled.outcome === "failed") {
      this.startTurn(id, live, { kind: "system", label: `Spex: the compile failed at ${settled.phase} — asking the agent to fix the source`, text: preface });
    }
  }
}
