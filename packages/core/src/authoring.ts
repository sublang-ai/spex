// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Chat-assisted playbook authoring (DR-058): one conversation per
// draft, run through cligent directly on the Captain's block or a
// chosen roster player in the spec package under development, in the
// project's working folder (playbook-library-64, environments-10),
// prompts composed from the shipped documents (playbook-library-65),
// directives read from the reply (playbook-library-66), the draft
// compile and its bounded failure relay (playbook-library-67/68), the
// queue that keeps the Boss ahead of automation, and the source
// streamed at tool-call granularity (playbook-library-71). The runner
// holds the runtime only for a turn (DR-051): no Cligent instance
// outlives one, and the provider token is an in-memory hint.
//
// The thread's own lines — a ◇ status, a refusal, a system turn's
// shown prompt — are the Boss's and read in the home's language
// (core-service-111, DR-079); what this runner composes for the agent
// — the preamble, the relay, the reseed digest — is the agent's
// prompt and stays as it is.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Cligent, type AgentAdapter, type AgentEvent, type CligentOptions } from "@sublang/cligent";
import { createAssetStore, externalizeAgentEvent, type AssetImport } from "@sublang/playbook/session-assets";
import type { PlayerAdapterImports, TmuxPlayApprovalHandler } from "@sublang/cligent/tmux-play";

import { loadAgentAdapter } from "./agent-runtime.js";
import { stripLeadingComments } from "./artifacts.js";
import { compilePlaybook, compilerAgentOf, type CompileResult, type LineSpawner, type ToolchainRuntime } from "./compile.js";
import { subagentTuningOf, type ComposedConfig, type ResolvedAgent } from "./config.js";
import { parseDirectives } from "./directives.js";
import { AUTHORING_LANGUAGE, DraftChangedError, DraftStore, legacyInstance, type StoredDraft, type StoredDraftCompile } from "./drafts.js";
import { parseManifestText } from "./environment/format.js";
import { i18n } from "./i18n.js";
import type { ApplicationMedia, AssetPlace } from "./media.js";
import type {
  AdapterName,
  AgentSummary,
  ClarificationQuestion,
  ConfigState,
  DraftInfo,
  DraftRecord,
  DraftSource,
  DraftSourceMessage,
  DraftState,
  MediaAsset,
  MessageContent,
  TmuxPlayRecord,
} from "./protocol.js";
import { CoreError } from "./session.js";
import type { Store } from "./store.js";
import { StorageFormatError, type StorageDiagnostic } from "./app-storage.js";

/** The player every authoring record names (playbook-library-64). */
export const AUTHOR_PLAYER = "author";

/** The Boss's own conversation digest is bounded on a reseed. */
const RESEED_CAP_BYTES = 24 * 1024;
/** The relay carries this much of the compiler's output. */
const RELAY_OUTPUT_LINES = 200;
/** Consecutive failed compiles with no Boss message between them that
 * end the automation (playbook-library-68). */
const RELAY_BOUND = 3;

/** Spex's own packaging step, which a compile reports under either
 * id: one word, so one message. */
const packageStage = () =>
  i18n._({ id: "Package", comment: "compile phase: Spex packages the artifacts" });

/** The word a thread line calls each stage by, keyed by the compiler's
 * phase id: the Boss's own text, read when the line is composed
 * (core-service-111), whose English is the pipeline table's name for
 * that phase (playbook-library-57). Thunks, never strings: a table read
 * at module load would freeze the language it was imported in; the ids
 * and their labels stay data on the protocol. */
const STAGE_NAMES: Record<string, () => string> = {
  normalize: () => i18n._({ id: "Normalize", comment: "compile phase: slc normalizes the source" }),
  text2gears: () => i18n._({ id: "Spec items", comment: "compile phase: slc derives the spec items" }),
  optimize: () => i18n._({ id: "Optimize", comment: "compile phase: slc optimizes the spec items" }),
  prefix: () => i18n._({ id: "Prefix", comment: "compile phase: slc moves each prompt's relayed values after its instructions, so calls share a cached prefix" }),
  gears2fsm: () => i18n._({ id: "Machine", comment: "pipeline stage: the compiled state machine" }),
  link: () => i18n._({ id: "Link", comment: "compile phase: slc links the machine" }),
  spex: packageStage,
  packaging: packageStage,
};

/** The stage's name for a thread line; an unknown id reads as itself,
 * as the pipeline table's own label does, so a phase a later slc adds
 * is never renamed into nonsense. */
function stageName(id: string): string {
  return STAGE_NAMES[id]?.() ?? id;
}

export interface AuthorManagerOptions {
  approvalHandler?: (draftId: string, instance: string) => TmuxPlayApprovalHandler;
  cancelApprovals?: (draftId: string, instance: string, invocationId?: string) => void;
  store: Store;
  drafts: DraftStore;
  configPath: string;
  env: NodeJS.ProcessEnv;
  adapterImports?: PlayerAdapterImports;
  compileSpawner?: LineSpawner;
  compileRuntime?: ToolchainRuntime;
  composed: () => ComposedConfig | undefined;
  /** Brings {@link composed} to the config as its files stand, awaited
   * once as each turn or compile starts (DR-111); it keeps what it read. */
  prepareConfig?: () => Promise<void>;
  readiness: (adapter: AdapterName) => boolean | null;
  /** Ids a playbook of the project's or your own group's environment
   * holds; a new session never takes one (playbook-library-51). */
  reservedIds: (projectId: string) => string[];
  /** The `org` a new spec package names: the account's login, else
   * `local` (playbook-library-70). */
  org: () => string;
  /** Whether a session's playbook is enabled (playbook-library-69). */
  enabled: (id: string) => boolean;
  /** List a working folder's engine links in its `info/exclude`. */
  excludeEngineLinks?: (workingFolder: string) => void;
  /** The home's device, marking what this device runs (storage-23). */
  device: () => string;
  /** Import an asset into a session's own folder, prepared privately and
   * published where `place` resolves at the write boundary (media-4). */
  importInto: ApplicationMedia["importInto"];
  now?: () => number;
}

export interface AuthorManagerEvents {
  onRecord: (draftId: string, instance: string, record: DraftRecord) => void;
  onState: (draft: DraftInfo) => void;
  onSource: (message: DraftSourceMessage) => void;
  onProgress: (draftId: string, instance: string, line: string) => void;
  onRemoved: (draftId: string, projectId: string, instance?: string) => void;
  /** A sync applied the session's spex repository: its files may hold
   * another history now (core-service-96). */
  onHistory: (draftId: string, instance: string) => void;
}

/** What a command names of the session it read: its instance, or, for
 * a file that will not read, that file's version (core-service-96). */
export type DraftExpectation = { instance: string } | { version: string };

type TurnOrigin =
  | ({ kind: "boss"; preface?: string } & MessageContent)
  | { kind: "system"; label: string; text: string };

/** What this run holds of one session instance: its runtime and the
 * prompt's bookkeeping, never a copy of its files (DR-111). */
interface LiveDraft {
  /** Set before the runner starts, so a message arriving next queues. */
  turn?: { controller: AbortController; done?: Promise<void> };
  /** Each compile of this instance in flight: ordinary processes, any
   * number at once, each removed by its own end (core-service-96). */
  compiles: Set<AbortController>;
  /** The turn a settled compile owes the agent, waiting behind the
   * running turn and the Boss's queue (playbook-library-68). */
  followUp?: { origin: Extract<TurnOrigin, { kind: "system" }>; compile: string };
  /** The provider token the previous turn of this run returned, with
   * the agent it belongs to and the transcript's bytes it continued —
   * never written (playbook-library-64). */
  resume?: { key: string; token: string };
  /** The transcript's version as this instance last left it — taken
   * as a turn starts, moved by each of its own appends — and whether
   * anything else changed the transcript since the turn took it: the
   * history a resumed provider continues is exactly this run's own
   * (playbook-library-64). */
  seen?: string;
  foreign?: boolean;
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

/** The app's six-line example, adapted from slc's demo: a core asset
 * with a provenance header. */
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

/** The phase the compiler left open — its `→` line with no `✓` or `✗`
 * after it — when it exited without naming a failure (playbook-library-67). */
export function openPhaseOf(lines: readonly string[]): string | undefined {
  let open: string | undefined;
  for (const raw of lines) {
    const line = raw.trim();
    const started = /^→\s+(\S+)/u.exec(line);
    if (started) {
      open = started[1];
      continue;
    }
    const ended = /^[✓✗]\s+(\S+)/u.exec(line);
    if (ended && ended[1] === open) open = undefined;
  }
  return open;
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
  return `The compile of ${id} succeeded; the roles are ${roles.join(", ")}. Propose enabling in a register block.`;
}

function agentSummaryOf(agent: ResolvedAgent): AgentSummary {
  return {
    adapter: agent.adapter,
    ...(agent.model !== undefined ? { model: agent.model } : {}),
    ...(agent.effort !== undefined ? { effort: agent.effort } : {}),
    ...(agent.fastMode !== undefined ? { fastMode: agent.fastMode } : {}),
    ...(agent.subagentModel !== undefined ? { subagentModel: agent.subagentModel } : {}),
    ...(agent.subagentEffort !== undefined ? { subagentEffort: agent.subagentEffort } : {}),
  };
}

function firstLineOf(markdown: string): string | null {
  const line = markdown.split(/\r?\n/).find((entry) => entry.trim() !== "");
  return line === undefined ? null : line.trim();
}


/** The refusal for an id no draft holds, worded once. */
function noDraft(id: string): string {
  return i18n._({
    id: "no draft {id}",
    values: { id },
    comment: "Refusal: no draft on this device carries that id",
  });
}

/** A compile's settlement found a newer compile's marker in place. */
class Superseded extends Error {}

/** The preference naming the player that answers a session (storage-5). */
const playerKey = (instance: string): string => `authoring:${instance}:player`;

/** The refusal of a write whose version moved (DR-111). */
function changedMeanwhile(id: string): CoreError {
  return new CoreError("conflict", i18n._({
    id: "{id} changed meanwhile; retry",
    values: { id },
    comment: "Refusal: the authoring session's file changed, or another session took its id, since the page read it",
  }));
}

export class AuthorManager {
  readonly events: AuthorManagerEvents = {
    onRecord: () => {},
    onState: () => {},
    onSource: () => {},
    onProgress: () => {},
    onRemoved: () => {},
    onHistory: () => {},
  };
  /** Keyed by the session's instance: a session made again under its
   * id is another session and inherits nothing (playbook-library-70). */
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
   * compile this device was running when the core stopped is rewritten
   * as interrupted, and a turn this device left open is closed in the
   * transcript; what another device or an earlier version recorded
   * stands, its end not this device's to say. */
  start(): void {
    const device = this.options.device();
    for (const id of this.drafts.ids()) {
      let draft: StoredDraft;
      try {
        draft = this.drafts.read(id);
      } catch (error) {
        this.problems.set(id, this.drafts.diagnostic(error, id));
        continue;
      }
      this.closeDanglingTurn(id, draft.instance, device);
      if (draft.compile?.outcome === "running" && draft.compile.device === device) {
        try {
          this.change(id, draft.instance, (stored) => {
            if (stored.compile?.outcome !== "running") return;
            const { device: _device, ...rest } = stored.compile;
            stored.compile = { ...rest, outcome: "interrupted" };
          });
        } catch {
          continue;
        }
        this.status(
          id,
          draft.instance,
          i18n._({
            id: "◇ Compile interrupted when Spex closed",
            comment: "Draft thread status line; the ◇ opens every one of them and stays",
          }),
        );
      }
    }
  }

  /** Nothing outlives the shutdown (DR-051): turns abort and are
   * awaited; a compile in flight is left as running on disk so the
   * next start reads it as interrupted (playbook-library-59). */
  markStopping(): void {
    this.stopping = true;
    // No compiler child outlives the core; the marker stays "running".
    for (const live of this.live.values()) for (const controller of live.compiles) controller.abort();
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

  /** The instance the session's file records now (storage-23). */
  instanceOf(id: string): string | undefined {
    return this.drafts.instanceOf(id);
  }

  /** Cancel every compile `instance` runs (core-service-96); false
   * when it runs none. */
  cancelCompiles(instance: string): boolean {
    const compiles = [...(this.live.get(instance)?.compiles ?? [])];
    for (const controller of compiles) controller.abort();
    return compiles.length > 0;
  }

  /** A sync applied `repository`: each of its sessions is announced,
   * so a client showing one reads its files again, and its state is
   * published as the files now say. */
  applied(repository: string): void {
    for (const id of this.drafts.ids()) {
      if (this.drafts.projectOf(id) !== repository) continue;
      const instance = this.drafts.instanceOf(id);
      if (instance !== undefined) this.events.onHistory(id, instance);
      this.publish(id);
    }
  }

  /** Refuse a command naming another instance than the file records,
   * before anything it carries is admitted (core-service-96). */
  assertInstance(id: string, instance: string): void {
    this.expect(id, instance);
  }

  activity(id: string, instance = this.drafts.instanceOf(id)): DraftInfo["activity"] {
    const live = instance === undefined ? undefined : this.live.get(instance);
    return live?.turn ? "turn" : live && live.compiles.size > 0 ? "compiling" : "idle";
  }

  describe(id: string): DraftInfo {
    try {
      return this.info(this.read(id));
    } catch (error) {
      // A record that will not read is still a draft: listed with its
      // diagnostic, refusing everything but Delete (playbook-library-70).
      if (error instanceof CoreError && error.code === "invalid_request") return this.damagedInfo(id, error.message);
      throw error;
    }
  }

  open(id: string, afterSeq = 0): { draft: DraftInfo; source: DraftSource | null; records: DraftRecord[] } {
    const draft = this.describe(id);
    const source = this.drafts.readSource(id);
    if (source && draft.instance) this.liveOf(draft.instance).lastSourceDigest = source.sha256;
    // A damaged record or transcript withholds the records: the
    // diagnostic stands in the thread's place (playbook-library-62).
    const records = draft.diagnostic ? [] : this.drafts.records(id).records.filter((entry) => entry.seq > afterSeq);
    return {
      draft,
      source: source ? { markdown: source.markdown, version: source.version, mtime: source.mtime } : null,
      records,
    };
  }

  private read(id: string): StoredDraft {
    if (!this.drafts.exists(id)) throw new CoreError("not_found", noDraft(id));
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

  /** The session the command named: its file must still record that
   * instance, else the command is refused as changed meanwhile. */
  private expect(id: string, instance: string): StoredDraft {
    const draft = this.read(id);
    if (draft.instance !== instance) throw changedMeanwhile(id);
    return draft;
  }

  /** Read, change and write the session file under the version read
   * (playbook-library-70): refused where the file no longer records
   * `instance` or its bytes moved before the rename. */
  private change(id: string, instance: string, mutate: (draft: StoredDraft) => void): StoredDraft {
    let loaded: { draft: StoredDraft; version: string };
    try {
      loaded = this.drafts.load(id);
    } catch {
      throw changedMeanwhile(id);
    }
    if (loaded.draft.instance !== instance) throw changedMeanwhile(id);
    mutate(loaded.draft);
    loaded.draft.touchedAt = this.now();
    try {
      this.drafts.write(loaded.draft, loaded.version);
    } catch (error) {
      if (error instanceof DraftChangedError) throw changedMeanwhile(id);
      throw error;
    }
    return loaded.draft;
  }

  private info(draft: StoredDraft): DraftInfo {
    const id = draft.id;
    const live = this.liveOf(draft.instance);
    // The transcript's state is part of the draft's, read as it stands.
    const damaged = this.transcriptDamage(id);
    const dir = this.drafts.draftDir(id);
    const dirExists = dir !== null && existsSync(dir);
    const source = dirExists ? this.drafts.readSource(id) : undefined;
    const activity = this.activity(id, draft.instance);
    const resolved = this.resolveAgent(draft);
    const compile = draft.compile;
    let state: DraftState;
    if (activity === "compiling") state = "compiling";
    else if (!source) state = "no-source";
    else if (compile?.outcome === "failed") state = "failed";
    else if (compile?.outcome === "interrupted") state = "interrupted";
    else if (compile?.outcome === "ok") state = compile.sourceSha256 === source.sha256 ? "compiled" : "changed";
    else state = "draft";
    // Enabled in a config, the session stays to work on: its chip reads
    // so while what it compiled stands (playbook-library-61).
    const enabled = this.options.enabled(id);
    if (enabled && state === "compiled") state = "enabled";
    return {
      id,
      instance: draft.instance,
      projectId: this.drafts.projectOf(id) ?? "",
      createdAt: draft.createdAt,
      touchedAt: draft.touchedAt,
      firstLine: source ? firstLineOf(source.markdown) : null,
      ...this.packageFields(id, draft.package, dir),
      ...(dirExists ? {} : { sourceMissing: true }),
      enabled,
      activity,
      state,
      queued: [...draft.queued],
      player: resolved.playerId,
      agent: agentSummaryOf(resolved.agent),
      ready: this.options.readiness(resolved.agent.adapter),
      ...(compile ? { compile: (({ sourceSha256: _digest, device: _device, ...rest }) => rest)(compile) } : {}),
      failures: draft.failures,
      ...(draft.proposal ? { proposal: draft.proposal } : {}),
      ...(live.malformed.length > 0 ? { malformedDirectives: [...live.malformed] } : {}),
      ...(damaged ? { diagnostic: damaged } : {}),
    };
  }

  /** Where the session's spec package stands (playbook-library-52,
   * -56, -70): its name as its manifest gives it, its folder and its
   * source relative to the working folder. */
  private packageFields(id: string, packagePath: string, dir: string | null): Pick<DraftInfo, "package" | "packagePath" | "sourcePath"> {
    let name: string | undefined;
    if (dir !== null) {
      try {
        const manifest = parseManifestText(readFileSync(join(dir, "meta.yaml"), "utf8")).manifest;
        if (manifest) name = `${manifest.org}/${manifest.name}`;
      } catch { /* a folder without a readable manifest names none */ }
    }
    return {
      ...(name ? { package: name } : {}),
      packagePath,
      sourcePath: [packagePath, "playbooks", AUTHORING_LANGUAGE, id, `${id}.md`].join("/"),
    };
  }

  /** The draft as a damaged `draft.json` still lets it be described:
   * its source and directory as they stand, the record's mtime for
   * its times, and the diagnostic (playbook-library-70). */
  private damagedInfo(id: string, diagnostic: string): DraftInfo {
    const dir = this.drafts.draftDir(id);
    const dirExists = dir !== null && existsSync(dir);
    const source = dirExists ? this.drafts.readSource(id) : undefined;
    let at = this.now();
    try {
      at = Math.round(statSync(this.drafts.recordFile(id)).mtimeMs);
    } catch {
      // The record is unreadable in every way; now stands for its time.
    }
    // A file that will not read names no instance, so no player: the
    // Captain's block stands.
    const resolved = this.resolveAgent();
    const version = this.drafts.fileVersion(id);
    return {
      id,
      // No instance is made up for a file that will not read: Delete
      // names the bytes' version instead (core-service-96).
      ...(version !== undefined ? { fileVersion: version } : {}),
      projectId: this.drafts.projectOf(id) ?? "",
      createdAt: at,
      touchedAt: at,
      firstLine: source ? firstLineOf(source.markdown) : null,
      ...this.packageFields(id, this.drafts.packagePath(id), dir),
      ...(dirExists ? {} : { sourceMissing: true }),
      enabled: this.options.enabled(id),
      activity: this.activity(id),
      state: source ? "draft" : "no-source",
      queued: [],
      player: resolved.playerId,
      agent: agentSummaryOf(resolved.agent),
      ready: this.options.readiness(resolved.agent.adapter),
      failures: 0,
      diagnostic,
    };
  }

  private liveOf(instance: string): LiveDraft {
    let live = this.live.get(instance);
    if (!live) {
      live = { compiles: new Set(), changes: [], malformed: [] };
      this.live.set(instance, live);
    }
    return live;
  }

  /** The transcript's damage as its file holds it now: the diagnostic
   * that blocks this session alone, gone once the file reads again
   * (playbook-library-70). */
  private transcriptDamage(id: string): string | undefined {
    const tail = this.drafts.transcript(id);
    if (tail.incompleteAfterSeq === undefined) return undefined;
    const file = this.drafts.recordsFile(id);
    this.problems.set(id, {
      file,
      reason: i18n._({
        id: "damaged transcript after record {seq}; the draft refuses everything but Delete",
        values: { seq: tail.incompleteAfterSeq },
        comment: "Storage diagnostic; Delete is the control's own name on the draft's row",
      }),
      blocking: false,
    });
    return i18n._({
      id: "{file}: damaged transcript after record {seq}",
      values: { file, seq: tail.incompleteAfterSeq },
      comment: "Draft diagnostic: the transcript file, then the last record that still read",
    });
  }

  /** A damaged transcript blocks the draft (playbook-library-70). */
  private assertReadable(id: string): void {
    const damaged = this.transcriptDamage(id);
    if (damaged) {
      throw new CoreError(
        "invalid_request",
        i18n._({
          id: "{diagnostic}; delete the draft, or repair the file",
          values: { diagnostic: damaged },
          comment: "Refusal on a damaged draft: the diagnostic already composed, then the way out",
        }),
      );
    }
  }

  private publish(id: string): void {
    try {
      this.events.onState(this.describe(id));
    } catch {
      // A vanished or damaged draft has no state to publish.
    }
  }

  // -- records --------------------------------------------------------------

  /** Append one record to the session `instance` names, after the last
   * the transcript holds (playbook-library-70). A session gone, made
   * again or damaged since takes nothing: the work that wrote it
   * finishes or fails on its own. */
  private append(id: string, instance: string, record: TmuxPlayRecord): DraftRecord | undefined {
    let stored: DraftRecord;
    const live = this.live.get(instance);
    let before: string | undefined;
    try {
      before = this.drafts.transcriptStat(id);
      stored = this.drafts.append(id, instance, record);
    } catch {
      return undefined;
    }
    if (live) {
      // A transcript some other writer moved since this instance last
      // left it holds history no resumed provider saw.
      if (before !== live.seen) this.distrust(live);
      live.seen = this.drafts.transcriptStat(id);
    }
    this.events.onRecord(id, instance, stored);
    return stored;
  }

  /** The provider's conversation no longer matches the transcript: the
   * next turn reseeds (playbook-library-65). */
  private distrust(live: LiveDraft): void {
    live.resume = undefined;
    live.foreign = true;
  }

  private status(id: string, instance: string, message: string, turnId: number | null = null): void {
    this.append(id, instance, { type: "captain_status", turnId, timestamp: this.now(), message } as TmuxPlayRecord);
  }

  private runtimeError(id: string, instance: string, message: string, turnId: number | null = null): void {
    this.append(id, instance, { type: "runtime_error", turnId, timestamp: this.now(), message } as TmuxPlayRecord);
  }

  private nextTurnId(id: string): number {
    let max = 0;
    for (const { record } of this.drafts.records(id).records) {
      if (record.type === "turn_started") max = Math.max(max, (record as { turn: { id: number } }).turn.id);
    }
    return max + 1;
  }

  /** A turn this device left open, cut by a crash, ends in the
   * transcript, so a replay never shows a run that is not running; one
   * another device or an earlier version opened stands. */
  private closeDanglingTurn(id: string, instance: string, device: string): void {
    const read = this.drafts.records(id);
    if (read.incompleteAfterSeq !== undefined) return;
    let openTurn: number | undefined;
    let ownTurn = false;
    let openPlayer = false;
    for (const { record } of read.records) {
      if (record.type === "turn_started") {
        openTurn = (record as { turn: { id: number } }).turn.id;
        ownTurn = (record as { device?: unknown }).device === device;
        openPlayer = false;
      } else if (record.type === "turn_finished" || record.type === "turn_aborted") openTurn = undefined;
      else if (record.type === "player_prompt") openPlayer = true;
      else if (record.type === "player_finished") openPlayer = false;
    }
    if (openTurn === undefined || !ownTurn) return;
    if (openPlayer) {
      this.append(id, instance, {
        type: "player_finished", turnId: openTurn, timestamp: this.now(), playerId: AUTHOR_PLAYER,
        result: { status: "aborted", playerId: AUTHOR_PLAYER, turnId: openTurn, error: "interrupted when Spex closed" },
      } as TmuxPlayRecord);
    }
    this.append(id, instance, { type: "turn_aborted", turnId: openTurn, timestamp: this.now(), reason: "interrupted when Spex closed" } as TmuxPlayRecord);
  }

  // -- source ---------------------------------------------------------------

  /** Read `<id>.md` and, when its digest differs from the last one
   * streamed, broadcast it (playbook-library-71). */
  refreshSource(id: string, instance: string, live: LiveDraft = this.liveOf(instance)): void {
    if (this.drafts.instanceOf(id) !== instance) return;
    const source = this.drafts.readSource(id);
    const digest = source?.sha256 ?? null;
    if (live.lastSourceDigest === digest) return;
    live.lastSourceDigest = digest;
    if (source) {
      this.events.onSource({ type: "draft.source", draftId: id, instance, markdown: source.markdown, version: source.version, mtime: source.mtime });
    }
    // The chip may have moved: no source → draft, compiled → changed.
    this.publish(id);
  }

  // -- commands -------------------------------------------------------------

  create(id: string, location: { key: string; authoringDir: string; workingFolder: string | null }): DraftInfo {
    // An id naming a session already standing opens it: the page reads
    // the conflict as "open it" (playbook-library-51).
    if (this.drafts.exists(id)) {
      throw new CoreError(
        "conflict",
        i18n._({
          id: "draft {id} already exists; open it",
          values: { id },
          comment: "Refusal: a draft with that id is already on this device",
        }),
      );
    }
    if (this.options.reservedIds(location.key).includes(id)) {
      throw new CoreError(
        "invalid_request",
        i18n._({
          id: "{id} is already a playbook of this project's or your own environment; pick another id",
          values: { id },
          comment: "Refusal: the id offered for a new playbook is one an installed spec package exports",
        }),
      );
    }
    let draft: StoredDraft;
    try {
      draft = this.drafts.create(id, this.now(), location, this.options.org());
    } catch (error) {
      if (error instanceof DraftChangedError) throw changedMeanwhile(id);
      throw new CoreError("invalid_request", error instanceof StorageFormatError ? error.reason : error instanceof Error ? error.message : String(error));
    }
    this.liveOf(draft.instance).lastSourceDigest = this.drafts.readSource(id)?.sha256 ?? null;
    const info = this.info(draft);
    this.events.onState(info);
    return info;
  }

  /** A Boss message: dispatched at once while the draft is idle, else
   * queued and dispatched in order when it is (core-service-96). */
  send(id: string, instance: string, input: string | MessageContent): { accepted: true; queued: boolean } {
    const content: MessageContent = typeof input === "string" ? {text: input} : {
      text: input.text,
      ...(input.attachments?.length ? {attachments: input.attachments.map((asset) => ({...asset}))} : {}),
    };
    this.expect(id, instance);
    this.assertReadable(id);
    const live = this.liveOf(instance);
    const queued = this.activity(id, instance) !== "idle";
    // The Boss spoke: the relay count starts over (playbook-library-68).
    this.change(id, instance, (draft) => {
      draft.failures = 0;
      if (queued) draft.queued.push(content);
    });
    if (queued) {
      this.publish(id);
      return { accepted: true, queued: true };
    }
    this.startTurn(id, instance, live, { kind: "boss", ...content });
    return { accepted: true, queued: false };
  }

  abort(id: string, instance: string): { aborted: boolean } {
    this.expect(id, instance);
    const turn = this.live.get(instance)?.turn;
    if (!turn) return { aborted: false };
    turn.controller.abort();
    return { aborted: true };
  }

  /** The Boss's own write, under the version token it read: a file the
   * agent or another writer changed meanwhile is a conflict, never a
   * wait (playbook-library-70). */
  writeSource(
    id: string,
    instance: string,
    input: { content?: string; sourcePath?: string; baseVersion?: string },
  ): { version: string; mtime: number } {
    this.expect(id, instance);
    this.assertReadable(id);
    if ((input.content === undefined) === (input.sourcePath === undefined)) {
      throw new CoreError(
        "invalid_request",
        i18n._({
          id: "send either the source text or a file path",
          comment: "Refusal: a source write must carry one of the two, not both and not neither",
        }),
      );
    }
    let content: string;
    if (input.sourcePath !== undefined) {
      const path = resolve(input.sourcePath);
      if (!existsSync(path) || !statSync(path).isFile()) {
        throw new CoreError(
          "invalid_request",
          i18n._({
            id: "{path} is not a file",
            values: { path },
            comment: "Refusal: the path offered as a draft's source is no file on this device",
          }),
        );
      }
      content = readFileSync(path, "utf8");
    } else {
      content = input.content as string;
    }
    if (content.trim() === "") {
      throw new CoreError(
        "invalid_request",
        i18n._({
          id: "the source is empty; nothing was written",
          comment: "Refusal: the draft's source would have been emptied",
        }),
      );
    }
    const written = this.drafts.writeSource(id, content, input.baseVersion);
    if (!written.ok) throw new CoreError(written.code, written.message);
    const live = this.liveOf(instance);
    live.changes.push("the Boss replaced the source");
    this.change(id, instance, () => {});
    this.refreshSource(id, instance, live);
    this.publish(id);
    return { version: written.version, mtime: written.mtime };
  }

  /** The Boss's Compile: resolves when the compile settles. */
  async compile(id: string, instance: string): Promise<{ ok: true; roles: string[] }> {
    this.expect(id, instance);
    this.assertReadable(id);
    const started = this.beginCompile(id, instance, "boss");
    if (!started.ok) throw new CoreError(started.code, started.message);
    const settled = await started.done;
    if (settled.outcome === "ok") return { ok: true, roles: settled.roles };
    if (settled.outcome === "canceled") {
      throw new CoreError(
        "aborted",
        i18n._({ id: "compile canceled", comment: "Refusal: the compile the Boss awaited was canceled" }),
      );
    }
    throw new CoreError("invalid_request", settled.message);
  }

  /**
   * Enable the session's playbook (playbook-library-69): re-package the
   * last successful compile with the confirmed command and intent, hand
   * the result to `commit` — the enabling path shared with
   * `compile.run`, which requests the spec package and writes the
   * config — and keep the session, now enabled, so the playbook can be
   * worked on further and published (playbook-library-61); a refused
   * commit leaves the session standing with its artifacts. It waits on
   * no turn or compile and claims nothing: the packaging reads the
   * compiled outputs as they stand when it reads them, and once started
   * the enabling finishes or fails on its own, whatever becomes of the
   * session (DR-111) — its writes are the environment's and the config's.
   */
  async register(
    id: string,
    instance: string,
    command: string,
    intent: string,
    commit: (result: CompileResult, location: { packageDir: string; packagePath: string; workingFolder: string }) => Promise<ConfigState>,
  ): Promise<ConfigState> {
    const draft = this.expect(id, instance);
    this.assertReadable(id);
    if (draft.compile?.outcome !== "ok" || !draft.compile.roles) {
      throw new CoreError(
        "invalid_request",
        i18n._({
          id: "compile the draft successfully before registering it",
          comment: "Refusal: registration needs a compile that succeeded",
        }),
      );
    }
    const packageDir = this.drafts.draftDir(id);
    const workingFolder = this.drafts.workingFolder(id);
    if (packageDir === null || workingFolder === null || !existsSync(packageDir)) {
      throw new CoreError("invalid_request", i18n._({
        id: "the spec package of {id} is missing from the working folder",
        values: { id },
        comment: "Refusal: the authoring session's spec package folder is not on this device",
      }));
    }
    const packagePath = this.drafts.packagePath(id);
    let result: CompileResult;
    try {
      result = await compilePlaybook({
        playbookId: id,
        source: {},
        roles: draft.compile.roles,
        command,
        intent,
        libraryDir: join(packageDir, "playbooks", AUTHORING_LANGUAGE),
        env: this.options.env,
        skipSlc: true,
        ...(this.options.compileSpawner ? { spawner: this.options.compileSpawner } : {}),
      });
    } catch (error) {
      throw new CoreError("invalid_request", error instanceof Error ? error.message : String(error));
    }
    return await commit(result, { packageDir, packagePath, workingFolder });
  }

  /** Announce a session's state again: its enabled mark may have moved. */
  republish(): void {
    for (const id of this.drafts.ids()) this.publish(id);
  }

  setPlayer(id: string, instance: string, playerId: string | null): DraftInfo {
    // The choice applies from the next turn; one running keeps its
    // agent. Read first, so a choice an earlier version kept by id
    // moves to the instance before this one replaces it.
    const draft = this.expect(id, instance);
    this.assertReadable(id);
    this.preferredPlayer(draft);
    const key = playerKey(instance);
    if (playerId === null) {
      this.options.store.deletePref(key);
    } else {
      const composed = this.options.composed();
      if (!composed?.roster.some((player) => player.id === playerId)) {
        throw new CoreError(
          "invalid_request",
          i18n._({
            id: "no roster player {playerId}",
            values: { playerId },
            comment: "Refusal: the config's roster holds no player with that id",
          }),
        );
      }
      this.options.store.setPref(key, playerId);
    }
    // One message per case, so the Captain is named in the reader's
    // language and a player by its own id.
    this.status(
      id,
      instance,
      playerId === null
        ? i18n._({
            id: "◇ Now answering: Captain — the conversation so far was replayed to it",
            comment: "Draft thread status line: the draft fell back to the Captain; the ◇ stays",
          })
        : i18n._({
            id: "◇ Now answering: {playerId} — the conversation so far was replayed to it",
            values: { playerId },
            comment: "Draft thread status line: a roster player now answers, named by its id; the ◇ stays",
          }),
    );
    this.change(id, instance, () => {});
    const info = this.describe(id);
    this.events.onState(info);
    return info;
  }

  /** Delete names the instance it read, or a damaged file's version
   * (core-service-96); a turn or compile running waits for nothing and
   * goes on, writing nothing once the file is gone. */
  assertDeletable(id: string, expected: DraftExpectation): void {
    // A damaged draft is still deleted: its record need not read.
    if (!this.drafts.exists(id)) throw new CoreError("not_found", noDraft(id));
    const matches = "instance" in expected
      ? this.drafts.instanceOf(id) === expected.instance
      : this.drafts.fileVersion(id) === expected.version;
    if (!matches) throw changedMeanwhile(id);
  }

  delete(id: string, expected: DraftExpectation): void {
    this.assertDeletable(id, expected);
    const projectId = this.drafts.projectOf(id) ?? "";
    try {
      this.drafts.delete(id, expected);
    } catch (error) {
      if (error instanceof DraftChangedError) throw changedMeanwhile(id);
      throw error;
    }
    const instance = "instance" in expected ? expected.instance : undefined;
    if (instance !== undefined) {
      this.options.store.deletePref(playerKey(instance));
      // A turn or compile still running keeps its handles, so Abort,
      // Cancel and shutdown still reach it.
      if (this.activity(id, instance) === "idle") this.live.delete(instance);
    }
    this.problems.delete(id);
    this.events.onRemoved(id, projectId, instance);
  }

  // -- the agent ------------------------------------------------------------

  /** The roster player chosen to answer the session (storage-5): kept
   * under its instance, so another session of its id inherits nothing.
   * The one session an earlier version kept a choice for by its id —
   * the one whose instance its id and creation time derive — has that
   * choice moved under its instance once. */
  private preferredPlayer(draft: Pick<StoredDraft, "id" | "instance" | "createdAt">): string | undefined {
    const store = this.options.store;
    const key = playerKey(draft.instance);
    const chosen = store.getPref<string>(key);
    if (chosen !== undefined || draft.instance !== legacyInstance(draft.id, draft.createdAt)) return chosen;
    const legacy = store.getPref<string>(`authoring:${draft.id}:player`);
    if (legacy === undefined) return undefined;
    store.setPref(key, legacy);
    store.deletePref(`authoring:${draft.id}:player`);
    return legacy;
  }

  /** The block that answers: the preferred roster player's, else the
   * Captain's (playbook-library-64, storage-5). */
  resolveAgent(draft?: Pick<StoredDraft, "id" | "instance" | "createdAt">): ResolvedAuthorAgent {
    const composed = this.options.composed();
    const preferred = draft ? this.preferredPlayer(draft) : undefined;
    const player = preferred ? composed?.roster.find((entry) => entry.id === preferred) : undefined;
    const agent: ResolvedAgent = player ?? composed?.captainAgent ?? { adapter: "claude" };
    const playerId = player ? player.id : null;
    return {
      playerId,
      agent,
      key: [playerId ?? "captain", agent.adapter, agent.model ?? "", agent.effort ?? "", String(agent.fastMode ?? ""), String(agent.subagentModel ?? ""), agent.subagentEffort ?? ""].join("|"),
    };
  }

  private async loadAdapter(adapter: AdapterName): Promise<new () => AgentAdapter<string, boolean, string>> {
    return loadAgentAdapter(adapter, this.options.adapterImports);
  }

  // -- turns ----------------------------------------------------------------

  private startTurn(id: string, instance: string, live: LiveDraft, origin: TurnOrigin): void {
    const controller = new AbortController();
    const entry: NonNullable<LiveDraft["turn"]> = { controller };
    live.turn = entry;
    entry.done = this.runTurn(id, instance, live, origin, controller).catch((error) => {
      console.error(`spex: authoring turn failed: ${String(error)}`);
    });
    this.publish(id);
  }

  private async runTurn(id: string, instance: string, live: LiveDraft, origin: TurnOrigin, controller: AbortController): Promise<void> {
    // The transcript the turn takes up must be exactly the one this run
    // left: a resume over anything else is dropped before the turn's
    // own records begin (playbook-library-64).
    const taken = this.drafts.transcriptStat(id);
    if (taken !== live.seen) live.resume = undefined;
    live.seen = taken;
    live.foreign = false;
    const turnId = this.nextTurnId(id);
    const at = this.now();
    const shown = origin.kind === "boss" ? origin.text : origin.label;
    // The turn names this device, so only this device's next start may
    // close it as cut by a crash (storage-23).
    const started = this.append(id, instance, { type: "turn_started", turnId, timestamp: at, device: this.options.device(), turn: { id: turnId, prompt: shown, timestamp: at, ...(origin.kind === "boss" && origin.attachments?.length ? {attachments: origin.attachments} : {}) } } as TmuxPlayRecord);
    if (!started) {
      // The session is gone or another took its id: nothing runs.
      this.endTurn(live, controller);
      this.publish(id);
      return;
    }
    let aborted = false;
    let reply: string | undefined;
    try {
      await this.options.prepareConfig?.();
      const draft = this.expect(id, instance);
      const resolved = this.resolveAgent(draft);
      const composed = this.options.composed();
      // The thread shows this one as its runtime error line, so it is
      // the reader's text, not a developer's.
      if (!composed) {
        throw new Error(
          i18n._({
            id: "the config is not valid; fix it in Settings before the agent can answer",
            comment: "Draft thread error; Settings is the surface's own name",
          }),
        );
      }
      const Adapter = await this.loadAdapter(resolved.agent.adapter);
      // A conversation continues only within one run, one agent and the
      // transcript it continued (DR-051, playbook-library-64): anything
      // else starts fresh, reseeded from the transcript as it stands.
      let resume = live.resume && live.resume.key === resolved.key ? live.resume.token : undefined;
      if (!resume) live.resume = undefined;
      let mode: "first" | "later" | "reseed" = resume ? "later" : this.hasPriorTurns(id, turnId) ? "reseed" : "first";
      let reseeded = false;
      // What this turn's prompt owes the agent — the changes since the
      // last prompt and the last reply's unreadable blocks — is taken
      // once, so a reseed re-run after a rejected resume says it too.
      const pending = { changes: live.changes, malformed: live.malformed };
      live.changes = [];
      live.malformed = [];
      for (;;) {
        const prompt = this.composePrompt(id, draft, resolved, origin, mode, pending);
        const run = await this.runAgent(id, instance, turnId, Adapter, resolved.agent, prompt, controller, resume, origin.kind === "boss" ? origin.attachments : undefined);
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
          this.status(
            id,
            instance,
            i18n._({
              id: "◇ The provider rejected the resumed conversation — replaying it",
              comment: "Draft thread status line: the agent's provider dropped the conversation; the ◇ stays",
            }),
            turnId,
          );
          continue;
        }
        // A token continues the turn's input and this run's own records
        // alone: one returned over a transcript another writer changed
        // goes, and the next turn reseeds.
        const own = !live.foreign && this.drafts.transcriptStat(id) === live.seen;
        if (run.resumeToken && own) live.resume = { key: resolved.key, token: run.resumeToken };
        else if (run.resumeToken || run.status !== "success") live.resume = undefined;
        if (run.status === "success") reply = run.result ?? run.text;
        break;
      }
    } catch (error) {
      this.runtimeError(id, instance, error instanceof Error ? error.message : String(error), turnId);
    } finally {
      this.refreshSource(id, instance, live);
      // The Boss's Abort and the core's own stop both end the turn; the
      // record says which (DR-051).
      const reason = this.stopping ? "interrupted when Spex closed" : "aborted by the Boss";
      this.append(id, instance, aborted
        ? ({ type: "turn_aborted", turnId, timestamp: this.now(), reason } as TmuxPlayRecord)
        : ({ type: "turn_finished", turnId, timestamp: this.now() } as TmuxPlayRecord));
      this.endTurn(live, controller);
    }
    // The turn is over: its directives act (playbook-library-66), then
    // the queue dispatches if nothing started (core-service-96).
    if (reply !== undefined) this.actOnReply(id, instance, live, reply);
    this.publish(id);
    this.afterSettle(id, instance, live);
  }

  /** Clear this turn's own handle, never a later turn's. */
  private endTurn(live: LiveDraft, controller: AbortController): void {
    if (live.turn?.controller === controller) live.turn = undefined;
  }

  private hasPriorTurns(id: string, turnId: number): boolean {
    return this.drafts.records(id).records.some((entry) => entry.record.type === "turn_started" && (entry.record as { turn: { id: number } }).turn.id < turnId);
  }

  private async runAgent(
    id: string,
    instance: string,
    turnId: number,
    Adapter: new () => AgentAdapter<string, boolean, string>,
    agent: ResolvedAgent,
    prompt: string,
    controller: AbortController,
    resume: string | undefined,
    attachments?: readonly MediaAsset[],
  ): Promise<{ status: string; result?: string; text: string; resumeToken?: string; resumeRejected: boolean; error?: string }> {
    const packageDir = this.drafts.draftDir(id);
    if (packageDir === null) {
      throw new Error(i18n._({
        id: "the spec package of {id} is missing from the working folder",
        values: { id },
        comment: "Refusal: the authoring session's spec package folder is not on this device",
      }));
    }
    this.append(id, instance, { type: "player_prompt", turnId, timestamp: this.now(), playerId: AUTHOR_PLAYER, prompt } as TmuxPlayRecord);
    // The block's model, effort and fast mode, and its subagent model
    // and effort (DR-093) — an unset subagent model resolved to
    // `inherit` and an Off sent as none, as the launcher resolves them
    // (DR-095); `{ mode: "auto" }` with the package as cwd and no extra
    // writable paths (DR-112); no tool lists, no maxTurns, no role — the
    // records name the player, not the events (playbook-library-64).
    const options: CligentOptions<string, boolean, string> = {
      cwd: packageDir,
      ...(agent.model !== undefined ? { model: agent.model } : {}),
      ...(agent.effort !== undefined ? { effort: agent.effort } : {}),
      ...(agent.fastMode !== undefined ? { fastMode: agent.fastMode } : {}),
      ...subagentTuningOf(agent),
      permissions: { mode: "auto" },
      ...(agent.browser !== undefined ? {browser: agent.browser} : {}),
    };
    const cligent = new Cligent<string, boolean, string>(new Adapter(), options);
    const invocationId = randomUUID();
    const approvalHandler = this.options.approvalHandler?.(id, instance);
    const text: string[] = [];
    let status = "error";
    let result: string | undefined;
    let resumeToken: string | undefined;
    let resumeRejected = false;
    let error: string | undefined;
    let errorCode: string | undefined;
    try {
      const assets = createAssetStore({directory: this.drafts.assetsDir(id)});
      const nativeAttachments = attachments?.length ? await Promise.all(attachments.map((asset) => assets.resolveAttachment(asset, {signal: controller.signal}))) : undefined;
      // Each record's assets are prepared privately and published where
      // the session's file stands at the publication's instant, only
      // while it is still this session's (media-4): a moved clone is
      // followed, a session gone or replaced refuses and nothing is
      // recreated. The run itself goes on, its own affair (DR-111).
      const place = (): AssetPlace => {
        const current = this.drafts.instanceOf(id);
        if (current !== instance) throw new DraftChangedError(current === undefined);
        const directory = this.drafts.assetsDir(id);
        return { root: dirname(dirname(directory)), directory };
      };
      const ownAssets = { importAsset: (input: AssetImport) => this.options.importInto((stage) => stage.importAsset(input), place) };
      for await (const event of cligent.run(prompt, { abortSignal: controller.signal, resume: resume ?? false,
        ...(approvalHandler ? {approvalHandler: (request, context) => approvalHandler({request, turnId, actorId: AUTHOR_PLAYER, invocationId}, context)} : {}), ...(nativeAttachments ? {attachments: nativeAttachments} : {}) })) {
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
        if (this.drafts.instanceOf(id) === instance) {
          let stored: Awaited<ReturnType<typeof externalizeAgentEvent>> | undefined;
          try { stored = await externalizeAgentEvent(ownAssets, typed); }
          catch (cause) { if (!(cause instanceof DraftChangedError)) throw cause; }
          if (stored) this.append(id, instance, { type: "player_event", turnId, timestamp: this.now(), playerId: AUTHOR_PLAYER, event: stored.event } as TmuxPlayRecord);
        }
        if (typed.type === "tool_result") this.refreshSource(id, instance);
      }
    } catch (cause) {
      // cligent turns an adapter's failure into events; a throw here is
      // the runner's own (a record that would not write). The prompt
      // still gets its finished record, so the transcript's folds
      // never show a call that is not running (playbook-library-64).
      this.append(id, instance, {
        type: "player_finished", turnId, timestamp: this.now(), playerId: AUTHOR_PLAYER,
        result: { status: "error", playerId: AUTHOR_PLAYER, turnId, error: cause instanceof Error ? cause.message : String(cause) },
      } as TmuxPlayRecord);
      throw cause;
    } finally {
      this.options.cancelApprovals?.(id, instance, invocationId);
    }
    const finalText = result ?? text.join("");
    this.append(id, instance, {
      type: "player_finished", turnId, timestamp: this.now(), playerId: AUTHOR_PLAYER,
      result: {
        status: status === "success" ? "ok" : status === "interrupted" ? "aborted" : "error",
        playerId: AUTHOR_PLAYER, turnId,
        ...(finalText ? { finalText } : {}),
        // The adapter's own message where it gave one; with none, this
        // package's own words, which the Boss reads (core-service-111).
        ...(status !== "success" && status !== "interrupted"
          ? {
              error:
                error ??
                i18n._({
                  id: "the agent ended with status {status}",
                  values: { status },
                  comment: "A failed authoring turn that carried no message; {status} is the runtime's own status word and stays as it is",
                }),
            }
          : {}),
        ...(errorCode ? { errorCode } : {}),
      },
    } as TmuxPlayRecord);
    return { status, result, text: text.join(""), resumeToken, resumeRejected, error };
  }

  /** The reply's directives (playbook-library-66). */
  private actOnReply(id: string, instance: string, live: LiveDraft, finalText: string): void {
    const parsed = parseDirectives(finalText);
    live.malformed = parsed.malformed;
    if (parsed.register) {
      const proposal = parsed.register;
      try {
        this.change(id, instance, (draft) => { draft.proposal = proposal; });
      } catch {
        return;
      }
    }
    if (parsed.compile) {
      const started = this.beginCompile(id, instance, "agent");
      if (!started.ok) {
        this.status(
          id,
          instance,
          i18n._({
            id: "◇ Compile skipped: {reason}",
            values: { reason: started.message },
            comment: "Draft thread status line: the agent asked for a compile that could not start; the ◇ stays",
          }),
        );
      }
    }
  }

  /** When the draft is idle — no turn, no compile — start what is owed
   * (core-service-96, playbook-library-68): the Boss's queue first, in
   * order, as the session file holds it, carrying a settled compile's
   * follow-up as its preface; else that follow-up alone. A follow-up
   * whose outcome the file no longer records — another writer replaced
   * it meanwhile — is owed no more (playbook-library-68). */
  private afterSettle(id: string, instance: string, live: LiveDraft): void {
    if (this.stopping || this.activity(id, instance) !== "idle") return;
    let followUp: Extract<TurnOrigin, { kind: "system" }> | undefined;
    let content: MessageContent | undefined;
    try {
      const draft = this.drafts.read(id);
      if (draft.instance !== instance) return;
      if (live.followUp && live.followUp.compile === JSON.stringify(draft.compile)) followUp = live.followUp.origin;
      else live.followUp = undefined;
      if (draft.queued.length > 0) {
        this.change(id, instance, (stored) => {
          content = stored.queued.shift();
          if (content !== undefined) stored.failures = 0;
        });
      }
    } catch {
      return;
    }
    if (content !== undefined) {
      live.followUp = undefined;
      this.startTurn(id, instance, live, { kind: "boss", ...content, ...(followUp ? { preface: followUp.text } : {}) });
    } else if (followUp) {
      live.followUp = undefined;
      this.startTurn(id, instance, live, followUp);
    }
  }

  // -- prompts --------------------------------------------------------------

  private composePrompt(
    id: string,
    draft: StoredDraft,
    resolved: ResolvedAuthorAgent,
    origin: TurnOrigin,
    mode: "first" | "later" | "reseed",
    pending: { changes: readonly string[]; malformed: readonly string[] },
  ): string {
    const parts: string[] = [];
    if (pending.malformed.length > 0) {
      parts.push(
        `Spex could not read ${pending.malformed.length === 1 ? "a spex block" : `${pending.malformed.length} spex blocks`} in your last reply; ${pending.malformed.length === 1 ? "it was" : "they were"} left as code. Each must be YAML with one \`kind\` — \`compile\` alone, or \`register\` with command, intent, and players — and nothing else:\n` +
          pending.malformed.map((block) => `  > ${block.split("\n").join("\n  > ")}`).join("\n"),
      );
    }
    if (mode === "later") {
      if (pending.changes.length > 0) parts.push(`Since your last reply: ${pending.changes.join("; ")}.`);
    } else {
      parts.push(this.preamble(id, draft, resolved));
      if (mode === "reseed") parts.push(this.conversationSoFar(id));
    }
    if (origin.kind === "boss") {
      parts.push(`${origin.preface ? `${origin.preface}\n\n` : ""}Boss: ${origin.text}`);
    } else {
      parts.push(`Spex: ${origin.text}`);
    }
    return parts.join("\n\n");
  }

  private preamble(id: string, draft: StoredDraft, resolved: ResolvedAuthorAgent): string {
    const sourcePath = this.drafts.sourcePath(id) ?? join(draft.package, "playbooks", AUTHORING_LANGUAGE, id, `${id}.md`);
    const packageDir = this.drafts.draftDir(id) ?? draft.package;
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
      `You are helping the Boss write a Spex playbook: a markdown source the slc compiler turns into a state machine that coordinates agents. It is the playbook artifact of a spec package under development at ${packageDir}. Write and edit exactly one file — ${sourcePath} — with your file tools, and, where it helps, the \`description\` line of ${join(packageDir, "meta.yaml")}; nothing else. Never run slc, git, or npm; Spex compiles when asked.`,
      "",
      "What a source is (read the documents below before writing anything non-trivial):",
      "- An H1 title, then `Roles:` — a list of capitalized, unique role names (two or three is right).",
      '- Behaviors as prose: "When <condition>, Captain shall prompt <Role>:" followed by the prompt as a blockquote, one point per line, or a fenced ```markdown instruction block introduced as the instruction.',
      '- Runtime values the role cannot otherwise see are relayed in quotes (`>`) as <placeholders>: "> Original request: <caller-input>".',
      "- `Results:` bullets only where a behavior has several outcomes, or a later prompt consumes its output; a relayed whole reply is declared as `<field>: <verbatim final text>`.",
      "- Each outcome has exactly one repository effect: one that may either commit or leave the repository unchanged is two outcomes (e.g. `drafted` commits, `noChanges` leaves it unchanged); slc's link refuses an outcome with both.",
      '- A nested call: "Captain shall call playbook `id`:" with the input template blockquoted.',
      "- Boss questions resume the same behavior; do not write a second behavior for the answer.",
      "- A source the Boss placed may be a SKILL.md (Agent Skills: YAML frontmatter `name` and `description`, then instructions) or other workflow markdown: rewrite it in place into a source — its description becomes the H1 and the registration intent, its instructions the prompts, its actors the roles.",
      "",
      "The shortest complete source, adapted from slc's demo:",
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
      `Draft state: id=${id} · spec package=${packageDir} · source=${existsSync(sourcePath) ? sourcePath : "none"} · last compile=${lastCompile}${resolved.playerId ? ` · answering as ${resolved.playerId}` : ""}`,
      roster.length > 0
        ? `Roster players you may name: ${roster.join(", ")}`
        : "Roster players you may name: none yet — propose new ones as dev.<role>",
    ].join("\n");
  }

  /** The Boss, system, and agent final texts in order, oldest dropped
   * past the cap (playbook-library-65). */
  private conversationSoFar(id: string): string {
    const entries: string[] = [];
    for (const { record } of this.drafts.records(id).records) {
      if (record.type === "turn_started") {
        const prompt = record.turn.prompt;
        if (record.turn.attachments?.length) {
          entries.push(`Previously attached (metadata only; reattach to inspect again): ${record.turn.attachments.map((asset) => `${asset.name ?? asset.mimeType} [${asset.assetId}]`).join(", ")}`);
        }
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
  beginCompile(id: string, instance: string, by: "boss" | "agent"): { ok: true; done: Promise<CompileSettled> } | { ok: false; code: CoreError["code"]; message: string } {
    const live = this.liveOf(instance);
    const damaged = this.transcriptDamage(id);
    if (damaged) return { ok: false, code: "invalid_request", message: damaged };
    const sourcePath = this.drafts.sourcePath(id);
    if (sourcePath === null || !existsSync(sourcePath)) {
      return {
        ok: false,
        code: "invalid_request",
        message: i18n._({
          id: "No source yet",
          comment: "Why a compile cannot start: the draft has no source file written yet",
        }),
      };
    }
    // A handle to cancel it by, and nothing that holds anything else
    // back: a turn, a source write or another compile go on beside it.
    const controller = new AbortController();
    live.compiles.add(controller);
    return { ok: true, done: this.runCompile(id, instance, live, by, controller) };
  }

  private async runCompile(id: string, instance: string, live: LiveDraft, by: "boss" | "agent", controller: AbortController): Promise<CompileSettled> {
    let startedAt = this.now();
    const lines: string[] = [];
    let sawCompiler = false;
    let sawPackaging = false;
    let settled: CompileSettled;
    // The digest of the source the compiler starts on: an edit made
    // while it runs reads "Changed" after (playbook-library-67).
    let input: string | undefined;
    try {
      // The device marks the compile as this one's to close should the
      // core stop under it (storage-23).
      // Its `at` is its marker: later than any before it, so a compile
      // settling after a newer one started settles nothing.
      const started = this.change(id, instance, (draft) => {
        startedAt = Math.max(startedAt, (draft.compile?.at ?? 0) + 1);
        draft.compile = { at: startedAt, by, outcome: "running", device: this.options.device() };
      });
      // The compiler's agent is the config's as its files stand (DR-111);
      // a refusal settles the compile its marker started.
      await this.options.prepareConfig?.();
      this.status(
        id,
        instance,
        by === "boss"
          ? i18n._({
              id: "◇ Compiling — asked by you",
              comment: "Draft thread status line: the Boss started this compile; the ◇ stays",
            })
          : i18n._({
              id: "◇ Compiling — asked by the agent",
              comment: "Draft thread status line: the draft's agent started this compile; the ◇ stays",
            }),
      );
      this.publish(id);
      const packageDir = this.drafts.draftDir(id);
      if (packageDir === null) throw new Error(i18n._({
        id: "the spec package of {id} is missing from the working folder",
        values: { id },
        comment: "Refusal: the authoring session's spec package folder is not on this device",
      }));
      // The engine links the compile provisions stay out of the working
      // folder's Git (playbook-library-12).
      const workingFolder = this.drafts.workingFolder(id);
      if (workingFolder !== null) this.options.excludeEngineLinks?.(workingFolder);
      input = this.drafts.readSource(id)?.sha256;
      const result = await compilePlaybook({
        playbookId: id,
        // The `<id>.md` already in the playbook artifact's folder of the
        // spec package under development: nothing is copied
        // (playbook-library-67).
        source: {},
        roles: [],
        command: id,
        intent: "(draft)",
        libraryDir: join(packageDir, "playbooks", AUTHORING_LANGUAGE),
        env: this.options.env,
        // The compile runs on the block that answers the draft
        // (playbook-library-42).
        agent: compilerAgentOf(this.resolveAgent(started).agent),
        ...(this.options.compileRuntime ? { runtime: this.options.compileRuntime } : {}),
        signal: controller.signal,
        ...(this.options.compileSpawner ? { spawner: this.options.compileSpawner } : {}),
        onProgress: (line) => {
          if (controller.signal.aborted) return;
          if (line.startsWith("running:")) sawCompiler = true;
          if (line.startsWith("packaging:")) sawPackaging = true;
          lines.push(line);
          this.events.onProgress(id, instance, line);
        },
      });
      settled = { outcome: "ok", roles: result.roles };
    } catch (error) {
      if (controller.signal.aborted) settled = { outcome: "canceled" };
      else {
        const message = error instanceof Error ? error.message : String(error);
        // The failed phase: the last ✗ line's; else the phase the
        // compiler left open when it exited, or the compiler itself;
        // "packaging" once the compiler finished; the toolchain before
        // it ran (playbook-library-67).
        const clarification = clarificationOf(lines);
        const failed = failedPhaseOf(lines);
        const phase =
          clarification?.phase ?? failed?.phase ??
          (sawPackaging ? "packaging" : sawCompiler ? (openPhaseOf(lines) ?? "slc") : "toolchain");
        settled = {
          outcome: "failed",
          phase,
          // The Boss reads this one as the refusal his Compile earns;
          // the compiler's own phase id and words are relayed.
          message: phase === "toolchain"
            ? message
            : i18n._({
                id: "compile failed at {phase}: {message}",
                values: { phase, message },
                comment: "Refusal: the compiler's own stage id, then what it said",
              }),
        };
      }
    } finally {
      live.compiles.delete(controller);
    }
    if (this.stopping) return settled;
    this.settleCompile(id, instance, live, settled, lines, startedAt, input);
    return settled;
  }

  /** Record the outcome and owe the follow-up (playbook-library-68):
   * on the session file as it stands, only while it still records the
   * instance that started the compile and this compile's marker — one
   * settling after a newer compile started records nothing. */
  private settleCompile(id: string, instance: string, live: LiveDraft, settled: CompileSettled, lines: string[], startedAt: number, input: string | undefined): void {
    let preface: string | undefined;
    let relay = false;
    let queued = false;
    let line: string;
    let recorded: string;
    try {
      const written = this.change(id, instance, (draft) => {
        const base = draft.compile;
        // Its own marker only: the `at` it wrote, still running on this
        // device — a sync may have brought a peer's running marker.
        if (base?.at !== startedAt || base.outcome !== "running" || base.device !== this.options.device()) throw new Superseded();
        queued = draft.queued.length > 0;
        if (settled.outcome === "ok") {
          draft.compile = { at: base.at, by: base.by, outcome: "ok", roles: settled.roles, ...(input ? { sourceSha256: input } : {}) };
          draft.failures = 0;
          preface = successText(id, settled.roles);
          relay = true;
        } else if (settled.outcome === "canceled") {
          draft.compile = { at: base.at, by: base.by, outcome: "canceled" };
        } else {
          const clarification = clarificationOf(lines);
          const failed = failedPhaseOf(lines);
          const output = lines.slice(-RELAY_OUTPUT_LINES).join("\n");
          draft.compile = {
            at: base.at, by: base.by, outcome: "failed", phase: settled.phase,
            output: settled.phase === "toolchain" ? settled.message : output,
            ...(clarification ? { questions: clarification.questions } : {}),
          };
          if (settled.phase !== "toolchain") {
            draft.failures += 1;
            preface = relayText(id, draft.compile, failed?.elapsed ?? formatElapsed(this.now() - startedAt));
            // What became of the failure travels as a fact beside the
            // line, so the page phrases it (playbook-library-58).
            draft.compile.relay = queued ? "queued" : draft.failures >= RELAY_BOUND ? "stopped" : "sent";
            relay = draft.compile.relay === "sent";
          }
        }
      });
      // The outcome as the file now records it: what is owed stands only
      // while the file still says so.
      recorded = JSON.stringify(written.compile);
    } catch {
      // Nothing of this compile is recorded; what waits on the session
      // goes as it would after any compile.
      this.publish(id);
      this.afterSettle(id, instance, live);
      return;
    }
    if (settled.outcome === "ok") {
      live.changes.push(`a compile succeeded with the roles ${settled.roles.join(", ")}`);
      line = i18n._({
        id: "◇ Compiled — roles: {roles}",
        values: { roles: settled.roles.join(", ") },
        comment: "Draft thread status line: the compile succeeded; the roles are the source's own names, the ◇ stays",
      });
    } else if (settled.outcome === "canceled") {
      live.changes.push("a compile was canceled");
      line = i18n._({
        id: "◇ Compile canceled",
        comment: "Draft thread status line: the compile was canceled; the ◇ stays",
      });
    } else if (settled.phase === "toolchain") {
      live.changes.push("a compile failed before the compiler ran");
      line = i18n._({
        id: "◇ Compile failed before the compiler ran: {reason}",
        values: { reason: settled.message },
        comment: "Draft thread status line: the toolchain's own guidance follows; the ◇ stays",
      });
    } else {
      // The agent reads the compiler's own phase id; the Boss reads
      // the row's human word (DR-010 §2, playbook-library-57), the
      // catalog's, passed as a value: one phase, one word.
      live.changes.push(`a compile failed at ${settled.phase}`);
      const where = stageName(settled.phase);
      line = queued
        ? i18n._({
            id: "◇ Compile failed at {where} — waiting for your queued message",
            values: { where },
            comment: "Draft thread status line; {where} is the pipeline stage's name and the ◇ stays",
          })
        : relay
          ? i18n._({
              id: "◇ Compile failed at {where} — sent to the agent",
              values: { where },
              comment: "Draft thread status line; {where} is the pipeline stage's name and the ◇ stays",
            })
          : i18n._({
              id: "◇ Compile failed at {where} — three in a row; tell the agent how to proceed",
              values: { where },
              comment: "Draft thread status line; {where} is the pipeline stage's name and the ◇ stays",
            });
    }
    this.status(id, instance, line);
    this.publish(id);
    // The follow-up waits for the running turn, and a queued Boss
    // message always goes first, carrying its text as its preface
    // (playbook-library-68); never a second turn beside the first.
    // The newest outcome this session recorded decides what is owed: one
    // owing nothing clears what an earlier compile owed.
    live.followUp = undefined;
    if (preface && (queued || relay)) {
      // The label is the line the thread shows for this turn; `text` is
      // the prompt the agent reads and stays as it is.
      live.followUp = { compile: recorded, origin: {
        kind: "system",
        label: settled.outcome === "failed"
          ? i18n._({
              id: "Spex: the compile failed at {where} — asking the agent to fix the source",
              values: { where: stageName(settled.phase) },
              comment:
                "Draft thread line for a turn Spex started; {where} is the pipeline stage's name, and keep the `Spex: ` opening",
            })
          : i18n._({
              id: "Spex: the compile succeeded — asking for a registration proposal",
              comment: "Draft thread line for a turn Spex started; keep the `Spex: ` opening, which marks it as Spex's own",
            }),
        text: preface,
      } };
    }
    this.afterSettle(id, instance, live);
  }
}
