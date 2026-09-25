// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The demo narration (DR-039): one scripted Captain and one fake
// adapter script shared by the fake dev core and the browser
// acceptance harness, so both draw the same run — the real CODE
// machine's states with a nested review, two player transcripts with
// tool use, usage, and a clean finish — with no credentials.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createSessionStore, validateSessionManifest } from "@sublang/playbook/session-store";
import { sha256, writeApplicationFile } from "../app-storage.js";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { Captain } from "@sublang/cligent/tmux-play";

import { academyCorpusDir } from "../forge.js";
import { Store } from "../store.js";
import { fakeAdapterImports, type FakeScript } from "./fake-adapter.js";
import { createScriptedCaptain, type CaptainTurnScript } from "./scripted-captain.js";

/** A starter config naming two players and the code/review built-ins;
 * the captain and coder ride the claude adapter, the reviewer codex. */
export const DEMO_CONFIG = `# Spex demo config — the comment is kept by every in-app edit.
captain:
  adapter: claude
  model: claude-opus-5
players:
  dev.coder:
    adapter: claude
    model: claude-opus-5
  dev.reviewer:
    adapter: codex
    model: gpt-5.6-sol
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
  review:
    from: "@sublang/playbook/review/registry"
    roles:
      coder: dev.coder
      reviewer: dev.reviewer
`;

/** The demo project: a git-initialized directory holding the staged
 * Academy corpus (DR-015) — the same example the app seeds for users. */
export function seedDemoProject(projectDir: string): void {
  mkdirSync(projectDir, { recursive: true });
  execFileSync("git", ["init", "-q", projectDir]);
  cpSync(academyCorpusDir(), projectDir, { recursive: true });
  writeFileSync(join(projectDir, "README.md"), "# Demo project\n");
  execFileSync("git", ["-C", projectDir, "add", "-A"]);
  // Identity and no signing: the host's global git config must not
  // decide whether a scratch repository can commit.
  execFileSync("git", [
    "-C",
    projectDir,
    "-c",
    "user.name=Spex Demo",
    "-c",
    "user.email=demo@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "seed",
  ]);
}

/** Done work the demo project holds before the app meets it
 * (dashboard-27): `count` intents, each worked in one finished turn
 * of one ended session and closed done, written into the state root
 * the core will serve — a History longer than one intent page with
 * nothing run. The project registers by its path, so the core's own
 * registration after boot finds this one. */
export async function seedDemoHistory(
  dataDir: string,
  projectDir: string,
  count: number,
): Promise<void> {
  const store = new Store({ dir: dataDir });
  try {
    const project = store.registerProject(projectDir, "demo-project", 1);
    const sessionId = randomUUID();
    const minute = 60_000;
    const base = Date.now() - (count + 1) * minute;
    const records: Record<string, unknown>[] = [];
    for (let i = 1; i <= count; i += 1) {
      const id = demoHistoryIntentId(i);
      const text = `Seeded done work ${i}`;
      const at = base + i * minute;
      store.addIntent({ id, projectId: project.id, text, rank: `${String(i).padStart(3, "0")}i`, createdAt: at - 30_000 });
      records.push({ type: "turn_started", turnId: i, turn: { id: i, prompt: text }, timestamp: at - 20_000 });
      records.push({ type: "turn_finished", turnId: i, timestamp: at - 10_000 });
      store.stampIntentDispatch(id, sessionId, i, at - 20_000);
      store.closeIntent(id, "done", at);
    }
    await seedHistorySession(join(dataDir, "sessions"), projectDir, records, sessionId);
  } finally { store.close(); }
}

export const demoHistoryIntentId = (index: number): string =>
  `72000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

/** Historical fixtures have no runtime checkpoint and never claim to resume. */
export async function seedHistorySession(
  sessionsDir: string,
  cwd: string,
  records: Record<string, unknown>[],
  sessionId: string = randomUUID(),
): Promise<string> {
  const shared = createSessionStore({ sessionsDir }); await shared.prepare();
  const writer = await shared.acquire(sessionId);
  try { for (const record of records) await writer.append(record); }
  finally { await writer.release(); }
  const history = await shared.readHistory(sessionId);
  const bytes = readFileSync(join(sessionsDir, `${sessionId}.records.jsonl`));
  const times = records.map((record) => record.timestamp).filter((at): at is number => typeof at === "number" && Number.isFinite(at));
  const lease = await shared.acquireManagement(sessionId);
  try {
    const manifest = validateSessionManifest({
      schemaVersion: 7, kind: "captain-session", sessionId, cwd,
      createdAt: new Date(times[0] ?? 0).toISOString(), updatedAt: new Date(times.at(-1) ?? 0).toISOString(),
      state: "history-only", reason: "Historical demonstration fixture", contextSeq: null,
      replay: { seq: history.lastReadableSeq, sha256: sha256(bytes), incomplete: false },
    });
    writeApplicationFile(join(sessionsDir, `${sessionId}.json`), manifest);
  } finally { await lease.release(); }
  const checked = await shared.validate(sessionId);
  if (!checked.integrityValid) throw new Error(checked.reasons.join("; "));
  return sessionId;
}

/**
 * Another device's turn on an existing session: the records appended
 * through the shared store and the settled manifest re-checkpointed
 * on the longer replay, so the bundle stays continuable (DR-042) and
 * differs from the ancestor as one unit (space-33). Stands in for a
 * peer core running the session, so a sync journey can meet the same
 * session changed on both sides.
 */
export async function appendHistorySession(
  sessionsDir: string,
  sessionId: string,
  records: Record<string, unknown>[],
): Promise<void> {
  const shared = createSessionStore({ sessionsDir }); await shared.prepare();
  const manifestPath = join(sessionsDir, `${sessionId}.json`);
  const prior = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const writer = await shared.acquire(sessionId);
  try { for (const record of records) await writer.append(record); }
  finally { await writer.release(); }
  const history = await shared.readHistory(sessionId);
  const bytes = readFileSync(join(sessionsDir, `${sessionId}.records.jsonl`));
  const times = records.map((record) => record.timestamp).filter((at): at is number => typeof at === "number" && Number.isFinite(at));
  const lease = await shared.acquireManagement(sessionId);
  try {
    const manifest = validateSessionManifest({
      ...prior,
      updatedAt: new Date(Math.max(Date.parse(String(prior.updatedAt)) || 0, times.at(-1) ?? 0)).toISOString(),
      replay: { seq: history.lastReadableSeq, sha256: sha256(bytes), incomplete: false },
    });
    writeApplicationFile(manifestPath, manifest);
  } finally { await lease.release(); }
  const checked = await shared.validate(sessionId);
  if (!checked.resumable) throw new Error(checked.reasons.join("; "));
}

/** Save the real pre-turn uncertainty boundary; the harness stops its host first. */
export async function interruptDemoSession(sessionsDir: string, sessionId: string, input: string): Promise<void> {
  const shared = createSessionStore({ sessionsDir });
  const lease = await shared.acquire(sessionId);
  try {
    const prior = await lease.read();
    if (!prior || prior.state !== "settled") throw new Error("fixture needs a settled real checkpoint");
    await lease.beginTurn({ input, attemptId: randomUUID(), attemptedExecutionProjection: prior.lastAppliedExecutionProjection });
  } finally { await lease.release(); }
}

/** Fake player adapters: the coder edits and tests, the reviewer
 * inspects and approves — each with tool calls, streamed markdown,
 * usage, and a delay long enough to watch in-flight state. */
export function demoAdapterImports(options: { delayMs?: number } = {}) {
  return fakeAdapterImports(demoScript(options));
}

/**
 * The script that parks a real run on real repository evidence
 * (DR-076): the Captain's decision starts the real /code root, the
 * coder commits its phase and leaves a stray file behind, and the
 * phase's own adjudication passes — so the run reaches its governed
 * receipt, fails closed on the residual, and settles with one
 * unresolved effect and a fenced leaf advertising its controls.
 * Shared by the core's integration suite and the browser harness, so
 * the published-control path is proven against one failure and not
 * two.
 */
export function parkingScript(options: { delayMs?: number } = {}): FakeScript {
  const delay = options.delayMs ?? 1;
  let phase = 0;
  return {
    rules: [
      {
        // The coder's own call, inside the repository-effect boundary.
        // Identity rides each command, so the host's global Git config
        // never decides whether the scratch repository can commit.
        match: "Original request:",
        response: {
          result: "Committed the phase.",
          delayMs: delay,
          effect: (cwd) => {
            phase += 1;
            writeFileSync(join(cwd, "work.txt"), `baseline\nphase ${phase}\n`);
            execFileSync("git", ["-C", cwd, "add", "-A"]);
            execFileSync("git", [
              "-C", cwd,
              "-c", "user.name=Spex Test",
              "-c", "user.email=spex@example.test",
              "-c", "commit.gpgsign=false",
              "commit", "-q", "-m", `phase ${phase}`,
            ]);
            writeFileSync(join(cwd, `stray-${phase}.txt`), "left behind\n");
          },
        },
      },
      {
        // The hidden adjudication of the coder's output: the phase's
        // own declared outcome, so the run is judged on its receipt
        // rather than failing at the judge.
        match: "Pick exactly one declared",
        response: { result: JSON.stringify({ guard: "directCommit" }) },
      },
      {
        // The Captain's decision: start the real /code root.
        match: /"action"/,
        response: {
          result: JSON.stringify({
            action: "start",
            playbookId: "code",
            input: "Add a line to work.txt",
          }),
        },
      },
    ],
    fallback: { result: "Done." },
  };
}

/** The fake adapter's script behind the demo: the coder's and the
 * reviewer's replies, each in flight for `delayMs`. Exported so a
 * harness can lay other rules before it (the authoring agent's) and
 * still draw the same sessions. */
export function demoScript(options: { delayMs?: number } = {}): FakeScript {
  const delay = options.delayMs ?? 1;
  return {
    rules: [
      // The fixture narrates work, but the real session Captain still owns
      // its single reply and durable settlement (core-service-91).
      { match: /Select exactly one action[\s\S]*\[Boss message\]\nCaptain, explain/, response: {
        result: JSON.stringify({ action: "respond", text: "Coder needs to know whether the old sessions should also be migrated. The question is still open." }),
      } },
      { match: /Select exactly one action[\s\S]*\[Boss message\]\nask before migrating/, response: {
        result: JSON.stringify({ action: "respond", text: "Coder asks: Should I also migrate the legacy sessions?" }),
      } },
      { match: "Select exactly one action from the closed set", response: {
        result: JSON.stringify({ action: "respond", text: "Done — the requested change is ready." }),
      } },
      { match: "An action just settled for the current Boss turn", response: { result: "Done — the requested change is ready." } },

      {
        match: "route:",
        response: { result: '{"decision":"dispatch"}' },
      },
      {
        // The hidden decision a recovery request costs (DR-060): the
        // Captain reads the parked leaf's control view before it
        // applies anything, so the machine stays in `failed` for as
        // long as that call takes.
        match: "recover:",
        response: {
          result: '{"decision":"runtime"}',
          delayMs: Math.round(delay * 0.5),
        },
      },
      {
        match: "Review the change",
        response: {
          tools: [
            { toolName: "command_execution", input: { command: "git show --stat HEAD" } },
            { toolName: "command_execution", input: { command: "npm test" } },
          ],
          deltas: [
            "### Review\n\n",
            "- `auth.ts` — the token refresh looks **correct**\n",
            "- consider a test for expiry skew\n",
          ],
          result:
            "### Review\n\n- `auth.ts` — the token refresh looks **correct**\n- consider a test for expiry skew\n",
          usage: { inputTokens: 850, outputTokens: 120, totalCostUsd: 0.04 },
          delayMs: Math.round(delay * 0.75),
        },
      },
    ],
    fallback: {
      tools: [
        { toolName: "Read", input: { file_path: "src/auth.ts" } },
        { toolName: "Edit", input: { file_path: "src/auth.ts" } },
        { toolName: "Bash", input: { command: "npm test -- auth" } },
      ],
      deltas: [
        "Working on it. ",
        "Editing `auth.ts` to fix the refresh path…\n\n",
        "```ts\nconst token = await refresh(session);\n```\n",
        "Done — the bug is fixed.",
      ],
      thinking: "tracing the token lifecycle",
      result: "Done — the bug is fixed.",
      usage: { inputTokens: 2400, outputTokens: 310, totalCostUsd: 0.12 },
      delayMs: delay,
    },
  };
}

/** The scripted Captain: a prompt starting with "ask" parks the
 * session on a player question; anything else narrates a full /code
 * run with a nested /review, mirroring the runtime's trace shapes
 * (DR-028, DR-031) so the UI draws the cards a real run produces. */
/** Which demo sessions stand parked on a question, by session id: the
 * runtime is held only for a turn (DR-051), so a fresh fixture takes
 * the reply turn and must still know the park it is leaving. */
const parkedSessions = new Set<string>();

/** Which demo sessions stand parked in their recoverable failure
 * state, by session id and by the run that parked there (DR-060): the
 * recovery turn walks the same machine out of `failed`, so the run's
 * identity has to outlive the runtime that emitted it. */
const failedSessions = new Map<string, string>();

export function demoCaptain(
  sessionId?: string,
  options: { governedCompletion?: boolean } = {},
): Captain {
  // The runtime leaves a park with one transition on the Boss reply
  // (BOSS_REPLY from awaitBossReply); the narration mirrors it so the
  // folds that answer a question on that departure see what a real
  // run emits (run-view-9).
  let parkedHere = false;
  const isParked = () => (sessionId ? parkedSessions.has(sessionId) : parkedHere);
  const setParked = (value: boolean) => {
    parkedHere = value;
    if (sessionId) {
      if (value) parkedSessions.add(sessionId);
      else parkedSessions.delete(sessionId);
    }
  };
  // The run standing in `failed`, if this session left one there.
  let failedHere: string | undefined;
  const failedRun = () => (sessionId ? failedSessions.get(sessionId) : failedHere);
  const setFailedRun = (runId?: string) => {
    failedHere = runId;
    if (!sessionId) return;
    if (runId) failedSessions.set(sessionId, runId);
    else failedSessions.delete(sessionId);
  };
  // The run that asked, so its own frame carries the park: the
  // interface reads a leaf's state from that run's frames (DR-061), and
  // the way out of a question park hangs on the same reading (DR-073).
  const askingRun = `demo-ask-${sessionId ?? "local"}`;
  const askTrace = async (
    session: Parameters<CaptainTurnScript>[2],
    from: string,
    to: string,
    event: string,
    tags: string[],
  ): Promise<void> => {
    await session.emitTelemetry({
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: askingRun,
        playbookId: "code",
        rootSessionId: askingRun,
        depth: 1,
        sequence: 1,
        timestamp: Date.now(),
        type: "fsm.transition",
        payload: {
          from,
          to,
          event: { type: event },
          state: { value: to, activeStateIds: [to], tags, status: "active", quiescent: true },
        },
      },
    });
  };
  return createScriptedCaptain(async (turn, context, session) => {
    if (isParked() && turn.prompt.startsWith("Captain, explain")) {
      await context.emitReply("Coder needs to know whether the old sessions should also be migrated. The question is still open.");
      return;
    }
    if (isParked() && !turn.prompt.toLowerCase().startsWith("ask")) {
      setParked(false);
      await askTrace(session, "awaitBossReply", "coding", "BOSS_REPLY", [
        "playbook.busy",
      ]);
      await session.emitTelemetry({
        topic: "playbook.fsm.state",
        payload: { from: "awaitBossReply", to: "coding", event: "BOSS_REPLY" },
      });
    }
    if (turn.prompt.toLowerCase().startsWith("ask")) {
      setParked(true);
      await askTrace(session, "coding", "awaitBossReply", "NEEDS_BOSS", [
        "playbook.parked",
      ]);
      await session.emitTelemetry({
        topic: "playbook.fsm.state",
        payload: {
          from: "coding",
          to: "awaitBossReply",
          event: "NEEDS_BOSS",
          pendingBossQuestion: {
            player: "coder",
            question: "Should I also migrate the legacy sessions?",
            resumeStateId: "coding",
          },
        },
      });
      await context.emitReply("Coder asks: Should I also migrate the legacy sessions?");
      return;
    }
    // A recovery turn walks the parked run out of `failed`; anything
    // else opens a fresh run.
    const parked = failedRun();
    const runId = parked ?? `demo-code-${Date.now()}`;
    let sequence = 0;
    const trace = async (
      type: string,
      payload: Record<string, unknown>,
    ): Promise<void> => {
      sequence += 1;
      await session.emitTelemetry({
        topic: "playbook.trace",
        payload: {
          schemaVersion: options.governedCompletion ? 4 : 3,
          sessionId: runId,
          playbookId: "code",
          rootSessionId: runId,
          depth: options.governedCompletion ? 0 : 1,
          sequence,
          timestamp: Date.now(),
          type,
          payload,
        },
      });
    };
    const move = async (
      from: string | null,
      to: string,
      event: string,
      status: "active" | "done" = "active",
      tags: string[] = [],
    ): Promise<void> => {
      await trace("fsm.transition", {
        from,
        to,
        event: { type: event },
        state: { value: to, activeStateIds: [to], tags, status, quiescent: true },
      });
      await session.emitTelemetry({
        topic: "playbook.fsm.state",
        payload: { from, to, event },
      });
    };

    // The parked failure is left the way the runtime leaves it: one
    // transition out of `failed`, so the way back stops being owed
    // (run-view-130, DR-060).
    if (parked) {
      setFailedRun(undefined);
      // The decision precedes the action, so the run is still parked
      // while the Captain reads what the leaf advertises.
      await context.callCaptain(`recover: ${turn.prompt}`, {
        visibility: "hidden",
      });
      await move("failed", "runFirstPhase", "RETRY_CODE", "active", [
        "playbook.busy",
      ]);
      await session.emitStatus("◇ /code recovery started");
      await context.emitReply("Retrying the step the workflow failed on.");
      return;
    }

    await session.emitStatus(`◇ /code started`);
    await context.callCaptain(`route: ${turn.prompt}`, {
      visibility: "hidden",
    });
    await trace("session.started", {});
    await move("ready", "runFirstPhase", "START_CODE");
    await session.emitStatus("⤷ Coder: implement");
    await trace("player.call.started", {
      stateId: "runFirstPhase",
      roleId: "coder",
      playerId: "dev.coder",
    });
    await context.callPlayer("dev.coder", `Implement: ${turn.prompt}`);
    // A prompt starting with "fail" parks the run in its recoverable
    // failure state: `failed` is a parked state and not a final one,
    // so the machine stands there waiting for the Boss (DR-060).
    if (turn.prompt.toLowerCase().startsWith("fail")) {
      await trace("player.call.finished", {
        stateId: "runFirstPhase",
        status: "error",
      });
      await session.emitStatus("◆ workflow failed; awaiting Boss recovery.");
      await move("runFirstPhase", "failed", "CODE_FAILED", "active", [
        "playbook.parked",
      ]);
      setFailedRun(runId);
      await context.emitReply("The coding workflow failed and is waiting for you.");
      return;
    }
    await trace("player.call.finished", {
      stateId: "runFirstPhase",
      status: "ok",
    });
    await move("runFirstPhase", "reviewFirstCommit", "done");
    const reviewId = `${runId}-review`;
    let reviewSequence = 0;
    const reviewTrace = async (
      type: string,
      payload: Record<string, unknown>,
    ): Promise<void> => {
      reviewSequence += 1;
      await session.emitTelemetry({
        topic: "playbook.trace",
        payload: {
          schemaVersion: options.governedCompletion ? 4 : 3,
          sessionId: reviewId,
          playbookId: "review",
          rootSessionId: runId,
          parentSessionId: runId,
          depth: options.governedCompletion ? 1 : 2,
          sequence: reviewSequence,
          timestamp: Date.now(),
          type,
          payload,
        },
      });
    };
    const reviewMove = async (
      from: string | null,
      to: string,
      event: string,
      status: "active" | "done" = "active",
    ): Promise<void> => {
      await reviewTrace("fsm.transition", {
        from,
        to,
        event: { type: event },
        state: { value: to, activeStateIds: [to], tags: [], status },
      });
    };
    await session.emitStatus("⮕ /review: first commit");
    await trace("playbook.call.started", {
      stateId: "reviewFirstCommit",
      playbookId: "review",
      text: "review the first commit",
    });
    await reviewTrace("session.started", {});
    await reviewMove("ready", "reviewInitial", "START_REVIEW");
    await session.emitStatus("⤷ Reviewer: review round 1");
    await reviewTrace("player.call.started", {
      stateId: "reviewInitial",
      roleId: "reviewer",
      playerId: "dev.reviewer",
    });
    await context.callPlayer("dev.reviewer", "Review the change");
    await reviewTrace("player.call.finished", {
      stateId: "reviewInitial",
      status: "ok",
    });
    await reviewMove("reviewInitial", "done", "done", "done");
    await reviewTrace("session.disposed", {
      state: { value: "done", status: "done" },
    });
    await trace("playbook.call.finished", {
      stateId: "reviewFirstCommit",
      playbookId: "review",
      result: "approved",
    });
    await move("reviewFirstCommit", "done", "done", "done");
    await trace("status.emitted", { message: "settled", stateId: "done" });
    // Opt in only for journeys exercising advancement from a typed
    // governed result; the ordinary demo remains narration alone.
    if (options.governedCompletion) {
      await trace("boss.input.settled", {
        outcome: "terminal",
        stateId: "done",
        state: { value: "done", activeStateIds: ["done"], tags: [], status: "done", quiescent: true, stateId: "done" },
        terminal: { kind: "success", stateId: "done" },
      });
    }
    await trace("session.disposed", {
      state: { value: "done", status: "done" },
    });
    await session.emitStatus("◇ /code finished");
    await context.emitReply("Done — the requested change is ready.");
  });
}
