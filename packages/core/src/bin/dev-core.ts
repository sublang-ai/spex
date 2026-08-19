// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Dev harness: boot the core service for UI development.
//
//   node dist/bin/dev-core.js            # real config, real adapters
//   node dist/bin/dev-core.js --fake     # temp config, scripted captain,
//                                        # fake adapters (no credentials)
//
// Prints the WebSocket URL; the UI's default port is 8137.

import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { academyCorpusDir } from "../forge.js";
import { CoreService, type CoreServiceOptions } from "../service.js";
import { fakeAdapterImports } from "../testing/fake-adapter.js";
import { createScriptedCaptain } from "../testing/scripted-captain.js";

const args = process.argv.slice(2);
const fake = args.includes("--fake");
const portArg = args.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 8137;

const FAKE_CONFIG = `
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

function seedDemoSpecs(projectDir: string): void {
  // The staged Academy corpus (DR-015) — the same example the app
  // seeds for users — keeps the fake project representative.
  cpSync(academyCorpusDir(), projectDir, { recursive: true });
}

async function main(): Promise<void> {
  const options: CoreServiceOptions = { port, token: process.env.SPEX_TOKEN ?? "dev" };

  if (fake) {
    const dir = mkdtempSync(join(tmpdir(), "spex-dev-"));
    const configPath = join(dir, "playbook.config.yaml");
    writeFileSync(configPath, FAKE_CONFIG);
    const projectDir = join(dir, "demo-project");
    mkdirSync(projectDir);
    execFileSync("git", ["init", "-q", projectDir]);
    seedDemoSpecs(projectDir);

    const { imports } = fakeAdapterImports({
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
            delayMs: 2400,
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
        delayMs: 3200,
      },
    });

    const captain = createScriptedCaptain(async (turn, context, session) => {
      if (turn.prompt.toLowerCase().startsWith("ask")) {
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
      // The scripted run narrates the real CODE machine's states and
      // mirrors the runtime's playbook.trace shapes (DR-028), so the
      // dev UI draws the same cards a real run produces.
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
      // The review runs as a nested playbook — the demo shows the
      // call tree the way a real run traces it (DR-031).
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

    options.configPath = configPath;
    options.dbPath = join(dir, "spex.db");
    options.adapterImports = imports;
    options.captainFactory = async () => captain;
    options.env = {};
    options.home = dir;

    console.log(`[dev-core] fake mode; demo project: ${projectDir}`);
  }

  const service = await CoreService.start(options);
  console.log(`[dev-core] listening on ws://127.0.0.1:${service.port()}/?token=${service.token()}`);
  console.log(`[dev-core] config: ${JSON.stringify(service.configStateSnapshot().status)}`);

  process.on("SIGINT", () => {
    void service.stop().then(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
