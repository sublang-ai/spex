// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Projects as working folders paired with spex repositories (projects-9,
// projects-10, projects-21): removal forgets the pair and deletes the
// clone, asking a second confirmation while the clone holds what has not
// reached the host, and leaves the working folder exactly as it was.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";
import type { Command, CommandResults, ServerMessage } from "./protocol.js";

const CONFIG = `captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`;

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.test", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.test" };
const git = (cwd: string, ...args: string[]): string => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => { this.messages.push(JSON.parse(String(data)) as ServerMessage); });
  }
  open(): Promise<void> { return new Promise((resolveOpen, reject) => { this.socket.once("open", () => resolveOpen()); this.socket.once("error", reject); }); }
  close(): void { this.socket.close(); }
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<{ ok: true; result: CommandResults[T] } | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    for (let i = 0; i < 3000; i += 1) {
      const reply = this.messages.find((m) => m.type === "reply" && m.id === id);
      if (reply?.type === "reply") return reply.ok ? { ok: true, result: reply.result as CommandResults[T] } : { ok: false, error: reply.error };
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`${type}: no reply`);
  }
  async ok<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type}: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  }
  async until(check: (message: ServerMessage) => boolean, timeoutMs = 20_000): Promise<void> {
    const start = Date.now();
    while (!this.messages.some(check)) {
      if (Date.now() - start > timeoutMs) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

/** Every file of a folder with its bytes and mode, `.git` included. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(relative(dir, full), `${statSync(full).mode}:${readFileSync(full).toString("base64")}`);
    }
  };
  walk(dir);
  return out;
}

async function boot(dataDir: string, home: string): Promise<{ service: CoreService; client: Client }> {
  const { imports } = fakeAdapterImports({ rules: [{ match: "route:", response: { result: '{"decision":"dispatch"}' } }], fallback: { result: "done" } });
  const captain = createScriptedCaptain(async (turn, context) => {
    await context.callPlayer("dev.coder", turn.prompt);
    await context.emitReply("Finished.");
  });
  const env = { PATH: process.env.PATH ?? "", HOME: home, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const service = await CoreService.start({
    token: "test", dataDir, own: "tester", env, home, adapterImports: imports, adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => captain, watchConfig: false, spaceTransportTimeoutMs: 20_000,
  });
  const client = new Client(service.port());
  await client.open();
  return { service, client };
}

test("projects-21: removal deletes the clone behind a second confirm naming its one unit, and the folder stays untouched", async () => {
  const scratch = scratchDir("spex-project-removal-");
  const dataDir = join(scratch, "home");
  const home = join(scratch, "user");
  mkdirSync(home);
  const config = join(dataDir, "workspace", "tester", "tester-spex", "config");
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, "playbook.config.yaml"), CONFIG);
  const folder = join(scratch, "fixture");
  mkdirSync(folder);
  git(folder, "init", "-q");
  writeFileSync(join(folder, "README.md"), "# Fixture\n");
  git(folder, "add", "-A");
  git(folder, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture");

  let { service, client } = await boot(dataDir, home);
  const project = await client.ok("project.register", { path: folder });
  const clone = join(dataDir, "workspace", "tester", "fixture-spex");
  assert.ok(existsSync(clone));
  // One session in the local-only spex repository.
  const session = await client.ok("session.create", { projectId: project.id });
  await client.ok("turn.submit", { sessionId: session.id, text: "Read the fixture" });
  await client.until((m) => m.type === "session.state" && m.session.id === session.id && !m.session.live && m.session.turns > 0);
  const before = snapshot(folder);

  // The first confirm meets what would be lost: one unit, named.
  const refused = await client.command("project.remove", { projectId: project.id });
  assert.ok(!refused.ok);
  assert.equal(refused.error.code, "conflict");
  assert.match(refused.error.message, /1 record has not reached the host/);
  assert.deepEqual(refused.error.details, { units: 1 });
  assert.ok(existsSync(clone), "nothing is deleted before the second confirm");

  // The second confirm removes it, announcing the session's removal.
  await client.ok("project.remove", { projectId: project.id, confirm: true });
  await client.until((m) => m.type === "session.removed" && m.sessionId === session.id);
  assert.ok(!existsSync(clone), "the clone is gone");
  assert.deepEqual(await client.ok("project.list", {}), []);

  client.close();
  await service.stop();
  ({ service, client } = await boot(dataDir, home));
  try {
    assert.deepEqual(await client.ok("project.list", {}), []);
    assert.deepEqual(await client.ok("session.list", {}), []);
    const file = parseYaml(readFileSync(join(dataDir, "home.yaml"), "utf8")) as { folders: unknown[] };
    assert.deepEqual(file.folders, [], "no pair for it remains");
    assert.ok(!existsSync(clone));
    assert.deepEqual(snapshot(folder), before, "the working folder's files and Git state are as they were");

    // A project whose spex repository has reached the host goes on the
    // first confirm alone.
    const bare = join(scratch, "host.git");
    execFileSync("git", ["init", "-q", "--bare", "-b", "spex", bare]);
    const again = await client.ok("project.register", { path: folder });
    const second = await client.ok("session.create", { projectId: again.id });
    await client.ok("turn.submit", { sessionId: second.id, text: "Read it again" });
    await client.until((m) => m.type === "session.state" && m.session.id === second.id && !m.session.live && m.session.turns > 0);
    await client.ok("space.remote.set", { repository: again.id, url: bare });
    const from = client.messages.length;
    await client.ok("space.sync", { repository: again.id });
    await client.until((m) => client.messages.indexOf(m) >= from && m.type === "space.state" &&
      m.state.groups.some((group) => group.repositories.some((repository) => repository.key === again.id && repository.sync.phase === "done")), 30_000);
    await client.ok("project.remove", { projectId: again.id });
    assert.ok(!existsSync(join(dataDir, "workspace", "tester", "fixture-spex")));
    assert.notEqual(git(bare, "rev-parse", "spex"), "", "nothing on the host changed");
  } finally {
    client.close();
    await service.stop();
  }
});
