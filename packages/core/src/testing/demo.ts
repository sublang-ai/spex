// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The demo narration (DR-039): one scripted Captain and one fake
// adapter script shared by the fake dev core and the browser
// acceptance harness, so both draw the same run — the real CODE
// machine's states with a nested review, two player transcripts with
// tool use, usage, and a clean finish — with no credentials.

import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { Captain } from "@sublang/cligent/tmux-play";

import { academyCorpusDir } from "../forge.js";
import { fakeAdapterImports } from "./fake-adapter.js";
import { createScriptedCaptain } from "./scripted-captain.js";

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

/** Fake player adapters: the coder edits and tests, the reviewer
 * inspects and approves — each with tool calls, streamed markdown,
 * usage, and a delay long enough to watch in-flight state. */
export function demoAdapterImports(options: { delayMs?: number } = {}) {
  const delay = options.delayMs ?? 1;
  return fakeAdapterImports({
    rules: [
      {
        match: "route:",
        response: { result: '{"decision":"dispatch"}' },
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
  });
}

/** The scripted Captain: a prompt starting with "ask" parks the
 * session on a player question; anything else narrates a full /code
 * run with a nested /review, mirroring the runtime's trace shapes
 * (DR-028, DR-031) so the UI draws the cards a real run produces. */
export function demoCaptain(): Captain {
  // The runtime leaves a park with one transition on the Boss reply
  // (BOSS_REPLY from awaitBossReply); the narration mirrors it so the
  // folds that answer a question on that departure see what a real
  // run emits (run-view-9).
  let parked = false;
  return createScriptedCaptain(async (turn, context, session) => {
    if (parked && !turn.prompt.toLowerCase().startsWith("ask")) {
      parked = false;
      await session.emitTelemetry({
        topic: "playbook.fsm.state",
        payload: { from: "awaitBossReply", to: "coding", event: "BOSS_REPLY" },
      });
    }
    if (turn.prompt.toLowerCase().startsWith("ask")) {
      parked = true;
      await session.emitStatus(
        "◆ code-coder asks: Should I also migrate the legacy sessions?",
      );
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
      return;
    }
    const runId = `demo-code-${Date.now()}`;
    let sequence = 0;
    const trace = async (
      type: string,
      payload: Record<string, unknown>,
    ): Promise<void> => {
      sequence += 1;
      await session.emitTelemetry({
        topic: "playbook.trace",
        payload: {
          schemaVersion: 3,
          sessionId: runId,
          playbookId: "code",
          rootSessionId: runId,
          depth: 1,
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
          schemaVersion: 3,
          sessionId: reviewId,
          playbookId: "review",
          rootSessionId: runId,
          parentSessionId: runId,
          depth: 2,
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
    await trace("session.disposed", {
      state: { value: "done", status: "done" },
    });
    await session.emitStatus("◇ /code finished");
  });
}
