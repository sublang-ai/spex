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
profiles:
  claude-demo:
    adapter: claude
    model: claude-opus-4-8
  codex-demo:
    adapter: codex
    model: gpt-5.5
captain: claude-demo
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    players:
      coder: claude-demo
      reviewer: codex-demo
    committer: coder
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
            deltas: [
              "### Review\n\n",
              "- `auth.ts` — the token refresh looks **correct**\n",
              "- consider a test for expiry skew\n",
            ],
            result:
              "### Review\n\n- `auth.ts` — the token refresh looks **correct**\n- consider a test for expiry skew\n",
            usage: { inputTokens: 850, outputTokens: 120, totalCostUsd: 0.04 },
            delayMs: 600,
          },
        },
      ],
      fallback: {
        deltas: [
          "Working on it. ",
          "Editing `auth.ts` to fix the refresh path…\n\n",
          "```ts\nconst token = await refresh(session);\n```\n",
          "Done — the bug is fixed.",
        ],
        thinking: "tracing the token lifecycle",
        result: "Done — the bug is fixed.",
        usage: { inputTokens: 2400, outputTokens: 310, totalCostUsd: 0.12 },
        delayMs: 800,
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
      await session.emitStatus(`◇ /code started`);
      await context.callCaptain(`route: ${turn.prompt}`, {
        visibility: "hidden",
      });
      await session.emitTelemetry({
        topic: "playbook.fsm.state",
        payload: { from: "ready", to: "coding", event: "START_CODING" },
      });
      await session.emitStatus("⤷ Coder: implement");
      await context.callPlayer("code-coder", `Implement: ${turn.prompt}`);
      await session.emitTelemetry({
        topic: "playbook.fsm.state",
        payload: { from: "coding", to: "review", event: "CODE_READY" },
      });
      await session.emitStatus("⤷ Reviewer: review round 1");
      await context.callPlayer("code-reviewer", "Review the change");
      await session.emitTelemetry({
        topic: "playbook.fsm.state",
        payload: { from: "review", to: "ready", event: "APPROVED" },
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
