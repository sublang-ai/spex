// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Dev harness: boot the core service for UI development.
//
//   node dist/bin/dev-core.js            # real config, real adapters
//   node dist/bin/dev-core.js --fake     # temp config, scripted captain,
//                                        # fake adapters (no credentials)
//
// Prints the WebSocket URL; the UI's default port is 8137.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

// A small but representative specs tree (nested directory, mixed
// group coverage, Verifies lines, a table) so the spec view demos
// live against the fake project.
const DEMO_SPECS: Record<string, string> = {
  "specs/meta.md": "# META: Spec Definition\n\nDemo stub of the spec of specs.\n",
  "specs/map.md":
    "# Spec Map\n\nDemo index: auth, flows/checkout, notes.\n",
  "specs/user/auth.md": [
    "# AUTH: Sign-in Behavior",
    "",
    "## Intent",
    "",
    "This demo package defines user-visible sign-in behavior for the",
    "fake project.",
    "",
    "## Sign-in",
    "",
    "### AUTH-1",
    "",
    "When the user submits valid credentials, the app shall open a",
    "session and greet the user by name.",
    "",
    "### AUTH-2",
    "",
    "When the user submits **invalid** credentials three times, the app",
    "shall lock the form for one minute and name the remaining wait.",
    "",
    "## Sessions",
    "",
    "### AUTH-3",
    "",
    "While a session is active, when the user is idle for 30 minutes,",
    "the app shall end the session and return to the sign-in form.",
    "",
  ].join("\n"),
  "specs/dev/auth.md": [
    "# AUTH: Sign-in Implementation",
    "",
    "## Intent",
    "",
    "Implementation requirements for the demo sign-in flow.",
    "",
    "## Token Handling",
    "",
    "### AUTH-10",
    "",
    "The session token shall live in the OS keychain, never in local",
    "storage.",
    "",
    "| Store | Allowed |",
    "| --- | --- |",
    "| OS keychain | yes |",
    "| localStorage | no |",
    "",
    "### AUTH-11",
    "",
    "When a token refresh fails, the client shall retry *once* with",
    "backoff before surfacing an error.",
    "",
  ].join("\n"),
  "specs/test/auth.md": [
    "# AUTH: Sign-in Acceptance Tests",
    "",
    "## Intent",
    "",
    "Acceptance coverage for the demo sign-in flow.",
    "",
    "## Coverage",
    "",
    "### AUTH-20",
    "Verifies: [AUTH-1](../user/auth.md#auth-1), [AUTH-10](../dev/auth.md#auth-10)",
    "",
    "Where valid demo credentials exist, the test suite shall sign in",
    "and assert the greeting and the keychain-stored token.",
    "",
    "### AUTH-21",
    "Verifies: [AUTH-2](../user/auth.md#auth-2)",
    "",
    "Where invalid credentials are submitted three times, the test",
    "suite shall assert the form locks for one minute.",
    "",
  ].join("\n"),
  "specs/user/flows/checkout.md": [
    "# CHK: Checkout Flow",
    "",
    "## Intent",
    "",
    "User-visible behavior of the demo checkout flow.",
    "",
    "## Cart",
    "",
    "### CHK-1",
    "",
    "When the user confirms the cart, the app shall show an order",
    "summary with *itemized* prices.",
    "",
    "### CHK-2",
    "",
    "When payment is declined, the app shall keep the cart intact and",
    "offer a retry.",
    "",
  ].join("\n"),
  "specs/test/flows/checkout.md": [
    "# CHK: Checkout Acceptance Tests",
    "",
    "## Intent",
    "",
    "Acceptance coverage for the demo checkout flow.",
    "",
    "## Coverage",
    "",
    "### CHK-10",
    "Verifies: [CHK-1](../../user/flows/checkout.md#chk-1), [CHK-2](../../user/flows/checkout.md#chk-2)",
    "",
    "Where a stocked demo cart exists, the test suite shall confirm the",
    "cart, decline payment once, and assert the summary and the retry.",
    "",
  ].join("\n"),
  "specs/dev/notes.md": [
    "# NOTES: Session Notes",
    "",
    "## Intent",
    "",
    "Implementation notes storage for the demo project.",
    "",
    "## Storage",
    "",
    "### NOTES-1",
    "",
    "Notes shall persist to the project-local store within 100 ms of",
    "the last edit.",
    "",
  ].join("\n"),
  "specs/decisions/001-example.md": [
    "# DR-001: Example decision",
    "",
    "## Status",
    "",
    "Accepted",
    "",
    "## Context",
    "",
    "A demo decision so the records reader has content.",
    "",
    "## Decision",
    "",
    "Keep the demo tree tiny.",
    "",
    "## Consequences",
    "",
    "Nothing depends on this.",
    "",
  ].join("\n"),
  "specs/iterations/001-first.md": [
    "# IR-001: First iteration",
    "",
    "## Goal",
    "",
    "Seed the demo specs tree.",
    "",
    "## Deliverables",
    "",
    "- [x] Demo packages and records",
    "",
  ].join("\n"),
};

function seedDemoSpecs(projectDir: string): void {
  for (const [rel, text] of Object.entries(DEMO_SPECS)) {
    const abs = join(projectDir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
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
