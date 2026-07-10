// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Acceptance coverage for the CORE test package (CORE-19..23):
// end-to-end over the WebSocket protocol against the scripted fake
// adapter — no network, no agent credentials (CORE-18).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { fakeAdapterImports, type FakeAdapterStats } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import type {
  Command,
  CommandResults,
  ReadinessEntry,
  RecordMessage,
  ServerMessage,
  SessionInfo,
  StoredRecord,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const VALID_CONFIG = `
profiles:
  claude-fast:
    adapter: claude
    model: claude-test
  codex-fast:
    adapter: codex
  gemini-extra:
    adapter: gemini
captain: claude-fast
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    players:
      coder: claude-fast
      reviewer: codex-fast
    committer: coder
`;

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.on("message", (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  sendRaw(text: string): void {
    this.socket.send(text);
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
    const reply = await this.waitFor(
      (m) => m.type === "reply" && m.id === id,
    );
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
    timeoutMs = 5000,
  ): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.find(check);
      if (found) return found;
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `timeout waiting; got ${JSON.stringify(this.messages.map((m) => m.type))}`,
        );
      }
      await sleep(10);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Harness {
  service: CoreService;
  stats: FakeAdapterStats;
  dir: string;
  dbPath: string;
  projectDir: string;
}

async function startHarness(
  configText: string = VALID_CONFIG,
  options: {
    dbPath?: string;
    env?: NodeJS.ProcessEnv;
    runCommand?: import("./forge.js").RunCommand;
  } = {},
): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "spex-core-it-"));
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, configText);
  const projectDir = join(dir, "project");
  mkdirSync(projectDir);
  execFileSync("git", ["init", "-q", projectDir]);
  const dbPath = options.dbPath ?? join(dir, "spex.db");

  const { imports, stats } = fakeAdapterImports({
    rules: [
      { match: "route:", response: { result: '{"decision":"dispatch"}' } },
      {
        match: "slow:",
        response: { deltas: ["working"], result: "slow done", delayMs: 250 },
      },
    ],
    fallback: {
      deltas: ["hello ", "world"],
      result: "hello world",
      usage: { totalCostUsd: 0.02 },
    },
  });

  const captain = createScriptedCaptain(async (turn, context, session) => {
    await session.emitStatus(`◇ turn ${turn.id}`);
    await context.callCaptain(`route: ${turn.prompt}`, { visibility: "hidden" });
    await context.callPlayer("code-coder", `${turn.prompt}`);
  });

  const service = await CoreService.start({
    configPath,
    dbPath,
    adapterImports: imports,
    captainFactory: async () => captain,
    env: options.env ?? {},
    home: join(dir, "home"),
    watchConfig: false,
    ...(options.runCommand ? { runCommand: options.runCommand } : {}),
  });
  return { service, stats, dir, dbPath, projectDir };
}

// ---------------------------------------------------------------------------
// CORE-19: end-to-end session over the protocol
// ---------------------------------------------------------------------------

test("CORE-19: fake-adapter session end to end over the WebSocket", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();

  const hello = client.messages[0];
  assert.equal(hello.type, "hello");

  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });
  const session = await client.expectOk("session.create", {
    projectId: project.id,
  });
  assert.deepEqual(
    session.players.map((p) => p.id),
    ["code-coder", "code-reviewer"],
  );

  await client.expectOk("subscribe", {
    channel: { kind: "session", sessionId: session.id },
  });

  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "slow: build the feature",
  });

  // A second submission during the active turn is rejected busy.
  const busy = await client.command("turn.submit", {
    sessionId: session.id,
    text: "another",
  });
  assert.ok(!busy.ok && busy.error.code === "busy");

  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );

  const sessionRecords = client.records("session");
  // The runtime cwd is the project directory, observed by the adapter.
  assert.ok(
    harness.stats.runs.every((run) => run.cwd === harness.projectDir),
    `adapter cwds: ${JSON.stringify(harness.stats.runs.map((r) => r.cwd))}`,
  );
  // Script-ordered, seq-ascending, no hidden records on the session channel.
  const seqs = sessionRecords.map((m) => m.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
  const types = sessionRecords.map((m) => m.record.type);
  assert.equal(types[0], "turn_started");
  assert.ok(types.includes("captain_status"));
  assert.ok(types.includes("player_prompt"));
  assert.ok(types.includes("player_event"));
  assert.ok(types.includes("player_finished"));
  assert.equal(types[types.length - 1], "turn_finished");
  assert.ok(!types.includes("captain_prompt"), "hidden records leaked");

  // No network: every event came from the fake adapter.
  const playerEvents = sessionRecords.filter(
    (m) => m.record.type === "player_event",
  );
  assert.ok(playerEvents.length > 0);
  for (const message of playerEvents) {
    const event = (message.record as { event: { agent: string } }).event;
    assert.equal(event.agent, "fake");
  }

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// CORE-20: hidden records only on the debug channel
// ---------------------------------------------------------------------------

test("CORE-20: hidden records reach only debug subscribers", async () => {
  const harness = await startHarness();
  const sessionClient = new Client(harness.service.port());
  const debugClient = new Client(harness.service.port());
  await sessionClient.open();
  await debugClient.open();

  const project = await sessionClient.expectOk("project.register", {
    path: harness.projectDir,
  });
  const session = await sessionClient.expectOk("session.create", {
    projectId: project.id,
  });
  await sessionClient.expectOk("subscribe", {
    channel: { kind: "session", sessionId: session.id },
  });
  await debugClient.expectOk("subscribe", {
    channel: { kind: "debug", sessionId: session.id },
  });

  await sessionClient.expectOk("turn.submit", {
    sessionId: session.id,
    text: "do something",
  });
  await sessionClient.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );
  await debugClient.waitFor(
    (m) => m.type === "record" && m.record.type === "captain_finished",
  );

  const visibleTypes = sessionClient
    .records("session")
    .map((m) => m.record.type);
  assert.ok(!visibleTypes.includes("captain_prompt"));
  assert.ok(!visibleTypes.includes("captain_event"));

  const debugRecords = debugClient.records("debug");
  const debugTypes = [...new Set(debugRecords.map((m) => m.record.type))].sort();
  assert.deepEqual(debugTypes, [
    "captain_event",
    "captain_finished",
    "captain_prompt",
  ]);
  for (const message of debugRecords) {
    assert.equal(
      (message.record as { visibility?: string }).visibility,
      "hidden",
    );
  }

  sessionClient.close();
  debugClient.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// CORE-21: launcher fail-closed defect classes rejected identically
// ---------------------------------------------------------------------------

const DEFECT_CONFIGS: { name: string; pattern: RegExp; config: string }[] = [
  {
    name: "profile id collides with adapter shorthand",
    pattern: /profiles\.claude collides/,
    config: VALID_CONFIG.replace("  claude-fast:", "  claude:\n    adapter: claude\n  claude-fast:"),
  },
  {
    name: "missing from",
    pattern: /playbooks\.code\.from must be a module specifier/,
    config: VALID_CONFIG.replace('    from: "@sublang/playbook/code/registry"\n', ""),
  },
  {
    name: "import failure",
    pattern: /failed to import/,
    config: VALID_CONFIG.replace(
      "@sublang/playbook/code/registry",
      "@sublang/definitely-missing",
    ),
  },
  {
    name: "key/manifest id mismatch",
    pattern: /key must equal the module manifest id "code"/,
    config: VALID_CONFIG.replace("  code:", "  wrong:"),
  },
  {
    name: "reserved captain role",
    pattern: /players\.captain binds local role "captain"/,
    config: VALID_CONFIG.replace(
      "      coder: claude-fast",
      "      captain: claude-fast\n      coder: claude-fast",
    ),
  },
  {
    name: "unresolved required role",
    pattern: /required role "reviewer" has no players entry/,
    config: VALID_CONFIG.replace("      reviewer: codex-fast\n", ""),
  },
  {
    name: "zero visible roles",
    pattern: /resolves no visible local role/,
    config: VALID_CONFIG.replace(
      /    players:\n      coder: claude-fast\n      reviewer: codex-fast\n/,
      "    players: {}\n",
    ),
  },
];

test("CORE-21: each launcher defect class yields a named config error and blocks sessions", async () => {
  for (const defect of DEFECT_CONFIGS) {
    const harness = await startHarness(defect.config);
    const client = new Client(harness.service.port());
    await client.open();

    const state = await client.expectOk("config.get", {});
    assert.equal(state.status, "invalid", defect.name);
    if (state.status === "invalid") {
      assert.match(state.errors.join("; "), defect.pattern, defect.name);
    }

    const project = await client.expectOk("project.register", {
      path: harness.projectDir,
    });
    const rejected = await client.command("session.create", {
      projectId: project.id,
    });
    assert.ok(
      !rejected.ok && rejected.error.code === "invalid_config",
      defect.name,
    );

    client.close();
    await harness.service.stop();
  }
});

// ---------------------------------------------------------------------------
// CORE-22: restart persistence
// ---------------------------------------------------------------------------

test("CORE-22: records, order, and usage survive a service restart", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();

  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });
  const session = await client.expectOk("session.create", {
    projectId: project.id,
  });
  await client.expectOk("subscribe", {
    channel: { kind: "session", sessionId: session.id },
  });
  await client.expectOk("turn.submit", { sessionId: session.id, text: "go" });
  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );

  const before = await client.expectOk("history.get", {
    sessionId: session.id,
  });
  const usageBefore = await client.expectOk("usage.get", {
    sessionId: session.id,
  });
  client.close();
  // Stop WITHOUT disposing gracefully first: session is live at shutdown.
  await harness.service.stop();

  const restarted = await CoreService.start({
    configPath: join(harness.dir, "playbook.config.yaml"),
    dbPath: harness.dbPath,
    env: {},
    home: join(harness.dir, "home"),
    watchConfig: false,
  });
  const client2 = new Client(restarted.port());
  await client2.open();

  const sessions = await client2.expectOk("session.list", {});
  const recovered = sessions.find((s: SessionInfo) => s.id === session.id);
  assert.ok(recovered, "session survives restart");
  assert.equal(recovered.live, false, "live-at-shutdown reported not live");

  const after = await client2.expectOk("history.get", {
    sessionId: session.id,
  });
  assert.deepEqual(
    after.records.map((r: StoredRecord) => [r.seq, r.record.type]),
    before.records.map((r: StoredRecord) => [r.seq, r.record.type]),
  );
  assert.deepEqual(
    await client2.expectOk("usage.get", { sessionId: session.id }),
    usageBefore,
  );

  client2.close();
  await restarted.stop();
});

// ---------------------------------------------------------------------------
// CORE-23: readiness reporting
// ---------------------------------------------------------------------------

test("CORE-23: readiness marks profiles per adapter rules and names requirements", async () => {
  const harness = await startHarness(VALID_CONFIG, {
    env: { ANTHROPIC_API_KEY: "test-key" },
  });
  const client = new Client(harness.service.port());
  await client.open();

  const readiness = await client.expectOk("readiness.get", {});
  const byProfile = new Map(
    readiness.map((entry: ReadinessEntry) => [entry.profileId, entry]),
  );
  assert.equal(byProfile.get("claude-fast")?.ready, true);
  assert.equal(byProfile.get("codex-fast")?.ready, false);
  assert.match(byProfile.get("codex-fast")?.requirement ?? "", /OPENAI_API_KEY/);
  assert.equal(byProfile.get("gemini-extra")?.ready, null);

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// PROJ-16..19: registration validation, create flow, stubbed forge, removal
// ---------------------------------------------------------------------------

test("PROJ: work-tree validation, create flow, forge states, removal", async () => {
  const { defaultRunCommand } = await import("./forge.js");
  const ghStub: import("./forge.js").RunCommand = async (command, args, cwd) => {
    if (command !== "gh") return defaultRunCommand(command, args, cwd);
    if (args[0] === "auth") return { code: 0, stdout: "ok", stderr: "" };
    return {
      code: 0,
      stdout: JSON.stringify([
        { number: 3, title: "Stub item", url: "https://github.com/o/r/issues/3" },
      ]),
      stderr: "",
    };
  };
  const harness = await startHarness(VALID_CONFIG, { runCommand: ghStub });
  const client = new Client(harness.service.port());
  await client.open();

  // Non-repo directory is rejected with guidance (PROJ-1).
  const plain = join(harness.dir, "plain");
  mkdirSync(plain);
  const rejected = await client.command("project.register", { path: plain });
  assert.ok(!rejected.ok && rejected.error.code === "invalid_request");
  assert.match(rejected.error.message, /git work tree/);

  // Create flow produces a registered, statusable repo (PROJ-2/3).
  const created = await client.expectOk("project.create", {
    path: join(harness.dir, "fresh"),
  });
  const status = await client.expectOk("project.status", {
    projectId: created.id,
  });
  assert.ok(status.branch.length > 0);
  assert.equal(status.dirty, false);

  // Forge state via the stubbed gh (PROJ-5/6): bind an origin first.
  execFileSync("git", [
    "-C",
    created.path,
    "remote",
    "add",
    "origin",
    "https://github.com/sublang-ai/demo.git",
  ]);
  const forge = await client.expectOk("forge.items", {
    projectId: created.id,
    refresh: true,
  });
  assert.equal(forge.authenticated, true);
  assert.equal(forge.repo, "sublang-ai/demo");
  assert.equal(forge.issues[0]?.number, 3);

  // Removal keeps the repo on disk (PROJ-8/19).
  await client.expectOk("project.remove", { projectId: created.id });
  assert.ok(existsSync(join(created.path, ".git")));

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// CORE-13: malformed messages leave the connection open with no state change
// ---------------------------------------------------------------------------

test("CORE-13: invalid messages get error replies and the connection survives", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();

  client.sendRaw("{not json");
  const errorReply = await client.waitFor(
    (m) => m.type === "reply" && !m.ok,
  );
  assert.equal(errorReply.type, "reply");
  if (errorReply.type === "reply" && !errorReply.ok) {
    assert.equal(errorReply.error.code, "invalid_message");
  }

  // Connection still serves commands.
  const projects = await client.expectOk("project.list", {});
  assert.deepEqual(projects, []);

  client.close();
  await harness.service.stop();
});
