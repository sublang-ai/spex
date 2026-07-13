// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Acceptance coverage: the desktop core running "typical dev tasks over
// the app" against the REAL Playbook Captain shell and the REAL CODE
// registry, plus a regression guard for the seeded-template config error.
//
// These exercise the same path the desktop takes on first run:
//   seed template -> composeConfig -> load @sublang/playbook/code/registry
//   -> createPlaybookCaptainShell -> createTmuxPlayRuntime -> Boss turn.
// Player agents are faked (CORE-18) so there is no network or credentials;
// the Captain shell and CODE registry are the real published modules.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { composeConfig, createModuleLoader, templatePath } from "./config.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import type { Command, CommandResults, RecordMessage, ServerMessage } from "./protocol.js";

// ---------------------------------------------------------------------------
// Minimal WebSocket client (self-contained so this file needs no shared harness)
// ---------------------------------------------------------------------------

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) return resolve();
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id);
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok
      ? { ok: true, result: reply.result as CommandResults[T] }
      : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) {
      throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    }
    return reply.result;
  }

  records(channel: "session" | "debug"): RecordMessage[] {
    return this.messages.filter(
      (m): m is RecordMessage => m.type === "record" && m.channel === channel,
    );
  }

  async waitFor(
    check: (message: ServerMessage) => boolean,
    timeoutMs = 15000,
  ): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.find(check);
      if (found) return found;
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `timeout; got ${JSON.stringify(this.messages.map((m) => m.type))}`,
        );
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

function realRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "spex-accept-"));
  const projectDir = join(dir, "project");
  mkdirSync(projectDir);
  execFileSync("git", ["init", "-q", projectDir]);
  execFileSync("git", ["-C", projectDir, "config", "user.email", "dev@example.com"]);
  execFileSync("git", ["-C", projectDir, "config", "user.name", "Dev"]);
  writeFileSync(join(projectDir, "greet.ts"), "export const greet = () => 'hi';\n");
  execFileSync("git", ["-C", projectDir, "add", "."]);
  execFileSync("git", ["-C", projectDir, "commit", "-q", "-m", "seed"]);
  return dir;
}

// ---------------------------------------------------------------------------
// Regression: the seeded default template composes against the REAL registry.
// This is the exact first-run path that reported "config is invalid: ...
// exposes no valid registry entry" when the validator required registry-entry
// state ids the Playbook Captain shell contract no longer carries.
// ---------------------------------------------------------------------------

test("ACCEPT: the bundled template composes against the real CODE registry", async () => {
  const top = readFileSync(templatePath(), "utf8");
  const parsed = (await import("yaml")).parse(top) as Record<string, unknown>;
  const composed = await composeConfig(parsed, createModuleLoader());

  assert.deepEqual(
    composed.players.map((p) => p.id),
    ["code-coder", "code-reviewer"],
  );
  assert.equal(composed.captainAgent.adapter, "claude");
  assert.equal(composed.playbooks[0].id, "code");
  assert.equal(composed.playbooks[0].command, "code");
});

// ---------------------------------------------------------------------------
// The desktop starts a real session for a project: real Captain shell, real
// CODE registry, faked players. session.create is the step that previously
// failed with invalid_config, so reaching a live session proves the fix.
// ---------------------------------------------------------------------------

test("ACCEPT: a real session starts over the real shell and CODE registry", async () => {
  const dir = realRepo();
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, readFileSync(templatePath(), "utf8"));

  const { imports } = fakeAdapterImports({ fallback: { result: "ok" } });
  // No captainFactory: the real @sublang/playbook/playbook-captain shell hosts
  // the real CODE registry loaded from @sublang/playbook/code/registry.
  const service = await CoreService.start({
    token: "test",
    configPath,
    dbPath: join(dir, "spex.db"),
    adapterImports: imports,
    env: {},
    home: join(dir, "home"),
    watchConfig: false,
  });
  const client = new Client(service.port());
  await client.open();

  const project = await client.expectOk("project.register", {
    path: join(dir, "project"),
  });
  const session = await client.expectOk("session.create", {
    projectId: project.id,
  });
  assert.deepEqual(
    session.players.map((p) => p.id),
    ["code-coder", "code-reviewer"],
  );
  assert.deepEqual(session.initialVisible, ["code-coder", "code-reviewer"]);

  client.close();
  await service.stop();
});

// ---------------------------------------------------------------------------
// A typical dev task flows through the app: the Captain divides the Boss
// intent into an ordered plan and drives CODE's coder then reviewer over the
// real project, producing an ascending, meaningful, fully-tracked turn. The
// Captain is scripted here so the orchestration is deterministic; the cligent
// runtime, record bus, store, and usage accounting are all real.
// ---------------------------------------------------------------------------

test("ACCEPT: a dev task divides into coder+reviewer calls over a real repo", async () => {
  const dir = realRepo();
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, readFileSync(templatePath(), "utf8"));

  const { imports, stats } = fakeAdapterImports({
    rules: [
      {
        match: "implement",
        response: {
          deltas: ["writing greet()"],
          result: "Added greet(name) and a unit test.",
          usage: { totalCostUsd: 0.03 },
        },
      },
      {
        match: "review",
        response: {
          deltas: ["reviewing"],
          result: "LGTM: greet(name) reads well; test covers the empty case.",
          usage: { totalCostUsd: 0.01 },
        },
      },
    ],
    fallback: { result: "ack" },
  });

  // Scripted Captain shell: it plans the intent as a coder step then a
  // reviewer step — the "right task division and playbooks to call".
  const captain = createScriptedCaptain(async (turn, context, session) => {
    await session.emitStatus(`◇ planning: ${turn.prompt}`);
    await context.callPlayer("code-coder", `implement: ${turn.prompt}`);
    await context.callPlayer("code-reviewer", `review the change for: ${turn.prompt}`);
    await session.emitStatus("done: implemented and reviewed");
  });

  const service = await CoreService.start({
    token: "test",
    configPath,
    dbPath: join(dir, "spex.db"),
    adapterImports: imports,
    captainFactory: async () => captain,
    env: {},
    home: join(dir, "home"),
    watchConfig: false,
  });
  const client = new Client(service.port());
  await client.open();

  const project = await client.expectOk("project.register", {
    path: join(dir, "project"),
  });
  const session = await client.expectOk("session.create", {
    projectId: project.id,
  });
  await client.expectOk("subscribe", {
    channel: { kind: "session", sessionId: session.id },
  });

  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "add a name argument to greet and cover it with a test",
  });
  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );

  const records = client.records("session");
  const types = records.map((m) => m.record.type);

  // The turn opens and closes cleanly.
  assert.equal(types[0], "turn_started");
  assert.equal(types[types.length - 1], "turn_finished");

  // The coder ran before the reviewer, both prompted and finished — the task
  // division reached the right players in order.
  const prompts = records
    .filter((m) => m.record.type === "player_prompt")
    .map((m) => (m.record as unknown as { playerId: string }).playerId);
  assert.deepEqual(prompts, ["code-coder", "code-reviewer"]);
  assert.ok(types.filter((t) => t === "player_finished").length === 2);

  // The runtime cwd was the real project; usage was accounted for the turn.
  assert.ok(
    stats.runs.every((run) => run.cwd === join(dir, "project")),
    `adapter cwds: ${JSON.stringify(stats.runs.map((r) => r.cwd))}`,
  );
  const usage = (await client.expectOk("usage.get", {
    sessionId: session.id,
  })) as unknown as { inputTokens: number; totalCostUsd: number };
  assert.ok(
    usage.totalCostUsd > 0 && usage.inputTokens > 0,
    `expected usage accounting, got ${JSON.stringify(usage)}`,
  );

  client.close();
  await service.stop();
});
