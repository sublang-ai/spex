// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The config state is a cache validated at use (core-service-2,
// DR-111): what an editor wrote is what the next command reads, with no
// watcher and no reload; a load whose files changed while it composed
// publishes nothing of them, reading once more or answering a retry
// (core-service-117).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";

import type { LineSpawner } from "./compile.js";
import { CoreService } from "./service.js";
import type { EnvironmentManager } from "./environments.js";
import type { Store } from "./store.js";
import type { Command, CommandResults, ConfigState, ServerMessage } from "./protocol.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";

const CONFIG = (model: string, extra = ""): string => `captain:
  adapter: claude
  model: ${model}
players:
  dev.coder:
    adapter: claude
    model: claude-test
${extra}playbooks:
  code:
    roles:
      coder: dev.coder
  review:
    roles:
      coder: dev.coder
      reviewer: dev.coder
`;
/** Refused only once the playbook's module is imported: its roles. */
const UNCOVERED = (model: string): string => CONFIG(model).replace("      coder: dev.coder\n  review:", "      coder: dev.coder\n      stray: dev.coder\n  review:");

type Reply<T extends Command["type"]> = { ok: true; result: CommandResults[T] } | { ok: false; error: { code: string; message: string } };

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => this.messages.push(JSON.parse(String(data)) as ServerMessage));
  }
  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => { this.socket.once("open", resolve); this.socket.once("error", reject); });
  }
  close(): void { this.socket.close(); }
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<Reply<T>> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    await until(() => this.messages.some((m) => m.type === "reply" && m.id === id), 60_000, type);
    const reply = this.messages.find((m) => m.type === "reply" && m.id === id);
    if (reply?.type !== "reply") throw new Error("unreachable");
    return reply.ok ? { ok: true, result: reply.result as CommandResults[T] } : { ok: false, error: reply.error };
  }
  async ok<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  }
  /** Every config state broadcast since a mark. */
  states(from: number): ConfigState[] {
    return this.messages.slice(from).flatMap((m) => (m.type === "config.state" ? [m.state] : []));
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, timeoutMs = 30_000, what = "condition"): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(10);
  }
}

const model = (state: ConfigState): string | undefined => (state.status === "valid" ? state.summary.captain.model : undefined);

test("core-service-117: commands, turns and compiles read the config files as they stand, and a load overtaken while it imports, probes or broadcasts publishes nothing stale", { timeout: 180_000 }, async (t) => {
  const dir = scratchDir("spex-config-fresh-");
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, CONFIG("claude-start"));
  // The `code` module's import is held while a test step stands armed.
  let codeModule: string | undefined;
  // Only while `holdWhen` holds, where set.
  let holdWhen: (() => boolean) | undefined;
  const holds: { reached: boolean; open: () => void; gate: Promise<void> }[] = [];
  // Every hold ever armed, so the cleanup opens one still awaited.
  const allHolds: typeof holds = [];
  const arm = () => {
    let open!: () => void;
    const hold = { reached: false, open: () => open(), gate: new Promise<void>((resolve) => { open = resolve; }) };
    holds.push(hold);
    allHolds.push(hold);
    return hold;
  };
  const loadModule = async (specifier: string): Promise<unknown> => {
    const hold = specifier === codeModule && (holdWhen?.() ?? true) ? holds.shift() : undefined;
    if (hold) { hold.reached = true; await hold.gate; }
    return import(isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier);
  };
  // A readiness probe is held while one stands armed.
  const probes: typeof holds = [];
  const adapterRuntime = async () => {
    const hold = probes.shift();
    if (hold) { hold.reached = true; await hold.gate; }
    return { usable: true };
  };
  // The compiler records the agent it was handed and fails at once.
  const compilerModels: (string | undefined)[] = [];
  let spawns = 0;
  const compileSpawner: LineSpawner = async (_command, args, _cwd, onLine, _signal, env) => {
    spawns += 1;
    if (args.length === 1 && args[0] === "--version") { onLine("v24.1.0"); return 0; }
    compilerModels.push(env?.SLC_MODEL);
    return 1;
  };
  const { imports, stats } = fakeAdapterImports({
    rules: [{ match: "slow", response: { result: "slow reply", delayMs: 600 } }],
    fallback: { result: "reply" },
  });
  const service = await CoreService.start({
    token: "test", configPath, dataDir: join(dir, "state"), adapterImports: imports, adapterRuntime, compileSpawner,
    env: { SPEX_HOST_URL: "http://127.0.0.1:9" }, home: join(dir, "user"), own: "tester", watchConfig: false, loadModule,
    captainFactory: async () => createScriptedCaptain(async () => {}),
  });
  const client = new Client(service.port());
  await client.open();
  t.after(async () => {
    for (const hold of allHolds) hold.open();
    client.close();
    await service.stop();
  });
  const internals = service as unknown as { environments: EnvironmentManager; store: Store };
  const own = internals.store.home.own();
  await until(() => internals.environments.modulesFor(null).find("code") !== undefined, 60_000, "the built-in environment");
  const ownCodeModule = internals.environments.modulesFor(null).find("code")!.module;
  codeModule = ownCodeModule;
  assert.ok(isAbsolute(codeModule), "the module entry is a file composition reads");
  for (let settled = false; !settled; await sleep(25)) settled = (await client.ok("environment.get", { repository: own })).busy === null;

  // An editor's change is read by the next command, with no watcher
  // and no reload; readiness follows the same files.
  writeFileSync(configPath, CONFIG("claude-edited").replace("captain:\n  adapter: claude", "captain:\n  adapter: gemini"));
  assert.equal(model(await client.ok("config.get", {})), "claude-edited");
  assert.ok((await client.ok("readiness.get", {})).some((entry) => entry.adapter === "gemini"), "readiness reads the edited captain");

  // A valid file overtaken while its module imports: the stale success
  // is never published; the one re-read publishes what stands.
  writeFileSync(configPath, CONFIG("claude-stale"));
  let mark = client.messages.length;
  let hold = arm();
  let reply = client.command("config.get", {});
  await until(() => hold.reached, 30_000, "the held import");
  writeFileSync(configPath, UNCOVERED("claude-broken"));
  hold.open();
  let answer = await reply;
  assert.ok(answer.ok && answer.result.status === "invalid" && /stray/.test(answer.result.errors.join(" ")), JSON.stringify(answer));
  assert.ok(!client.states(mark).some((state) => model(state) === "claude-stale"), "the stale success was not broadcast");

  // An invalid file repaired while its module imports: the stale error
  // is never published; the repair is.
  mark = client.messages.length;
  writeFileSync(configPath, UNCOVERED("claude-broken-again"));
  hold = arm();
  reply = client.command("config.get", {});
  await until(() => hold.reached, 30_000, "the held import");
  writeFileSync(configPath, CONFIG("claude-repaired"));
  hold.open();
  answer = await reply;
  assert.ok(answer.ok && model(answer.result) === "claude-repaired", JSON.stringify(answer));
  assert.ok(!client.states(mark).some((state) => state.status === "invalid"), "the stale error was not broadcast");

  // Changed again during the one re-read: an explicit retry, nothing
  // published; the retry reads what stands.
  mark = client.messages.length;
  writeFileSync(configPath, CONFIG("claude-first"));
  const first = arm();
  const second = arm();
  reply = client.command("config.get", {});
  await until(() => first.reached, 30_000, "the first held import");
  writeFileSync(configPath, CONFIG("claude-second"));
  first.open();
  await until(() => second.reached, 30_000, "the second held import");
  writeFileSync(configPath, CONFIG("claude-third"));
  second.open();
  answer = await reply;
  assert.ok(!answer.ok && answer.error.code === "conflict" && /changed meanwhile; retry/.test(answer.error.message), JSON.stringify(answer));
  assert.equal(client.states(mark).length, 0, "nothing was published");
  assert.equal(model(await client.ok("config.get", {})), "claude-third");

  // A reload's readiness probes await too: an edit while one is held is
  // no readiness to announce; the re-read's is.
  mark = client.messages.length;
  writeFileSync(configPath, CONFIG("claude-probed"));
  const probe = arm();
  probes.push(holds.pop()!);
  reply = client.command("config.get", {});
  await until(() => probe.reached, 30_000, "the held probe");
  writeFileSync(configPath, CONFIG("claude-reprobed"));
  probe.open();
  answer = await reply;
  assert.ok(answer.ok && model(answer.result) === "claude-reprobed", JSON.stringify(answer));
  const announced = client.messages.slice(mark).filter((m) => m.type === "config.state" || m.type === "readiness.state");
  assert.deepEqual(announced.map((m) => m.type === "config.state" ? model(m.state) : m.type), ["claude-probed", "claude-reprobed", "readiness.state"]);

  // A locked entry gone is the config's missing module; restored, with
  // the lock unchanged and no reload, the next read composes it.
  const aside = `${codeModule}.aside`;
  renameSync(codeModule, aside);
  try {
    const missing = await client.ok("config.get", {});
    assert.ok(missing.status === "invalid", JSON.stringify(missing));
  } finally {
    renameSync(aside, codeModule);
  }
  assert.equal(model(await client.ok("config.get", {})), "claude-reprobed");

  // An edit's reply is the state the files stand at after its reload:
  // overtaken twice while that reload composes, never the state before.
  writeFileSync(configPath, CONFIG("claude-pre"));
  assert.equal(model(await client.ok("config.get", {})), "claude-pre");
  holdWhen = () => readFileSync(configPath, "utf8").includes("claude-edit");
  const reloaded = arm();
  const reread = arm();
  const edit = client.command("config.edit", { op: { kind: "captain.set", patch: { model: "claude-edit" } } });
  await until(() => reloaded.reached, 30_000, "the edit's held reload");
  writeFileSync(configPath, CONFIG("claude-edit-outside"));
  holdWhen = () => true;
  reloaded.open();
  await until(() => reread.reached, 30_000, "the held re-read");
  writeFileSync(configPath, CONFIG("claude-edit-latest"));
  reread.open();
  holdWhen = undefined;
  const edited = await edit;
  assert.ok(edited.ok ? model(edited.result) === "claude-edit-latest" : edited.error.code === "conflict", JSON.stringify(edited));

  // A project's composition reads its file after its environment is
  // ready and checks it after the import: an edit while the module
  // imports is what the answer reflects.
  const working = join(dir, "project");
  mkdirSync(working);
  execFileSync("git", ["init", "-q", working]);
  const project = await client.ok("project.register", { path: working });
  const projectConfig = internals.store.repository(project.id)!.configPath;
  mkdirSync(join(projectConfig, ".."), { recursive: true });
  writeFileSync(projectConfig, "playbooks:\n  code:\n    roles:\n      coder: dev.coder\n");
  assert.equal((await client.ok("config.get", { projectId: project.id })).status, "valid");
  codeModule = internals.environments.modulesFor(project.id).find("code")!.module;

  // A reload's broadcast awaits the projects' compositions: an edit while
  // one is held is no state to announce; the re-read's is.
  mark = client.messages.length;
  writeFileSync(configPath, CONFIG("claude-announced"));
  hold = arm();
  reply = client.command("config.get", {});
  await until(() => hold.reached, 30_000, "the held project composition");
  writeFileSync(configPath, CONFIG("claude-current"));
  hold.open();
  answer = await reply;
  assert.ok(answer.ok && model(answer.result) === "claude-current", JSON.stringify(answer));
  assert.deepEqual(client.states(mark).map(model), ["claude-current"]);

  hold = arm();
  const projectReply = client.command("config.get", { projectId: project.id });
  await until(() => hold.reached, 60_000, "the held project import");
  writeFileSync(projectConfig, "playbooks:\n  code:\n    roles:\n      coder: dev.absent\n");
  hold.open();
  const projectAnswer = await projectReply;
  assert.ok(projectAnswer.ok && projectAnswer.result.status === "invalid" && /dev\.absent/.test(projectAnswer.result.errors.join(" ")), JSON.stringify(projectAnswer));

  // Authoring: each turn — a Boss turn and a queued one alike — reads
  // the config as it stands when it starts; a running turn keeps its own.
  // Every later command names the session's recorded instance (storage-23).
  const { instance } = await client.ok("draft.create", { projectId: project.id, draftId: "fresh" });
  assert.ok(instance, "the new session records its instance");
  writeFileSync(configPath, CONFIG("claude-author"));
  const runs = () => stats.runs.filter((run) => run.cwd?.endsWith("fresh"));
  await client.ok("draft.send", { projectId: project.id, draftId: "fresh", instance, text: "slow first" });
  await until(() => runs().length === 1, 60_000, "the first authoring run");
  writeFileSync(configPath, CONFIG("claude-queued"));
  assert.equal((await client.ok("draft.send", { projectId: project.id, draftId: "fresh", instance, text: "then this" })).queued, true);
  await until(() => runs().length === 2, 60_000, "the queued authoring run");
  assert.deepEqual(runs().map((run) => run.model), ["claude-author", "claude-queued"]);

  // The roster a player is chosen from is the file's as it stands.
  writeFileSync(configPath, CONFIG("claude-queued", "  dev.fresh:\n    adapter: claude\n    model: claude-fresh\n"));
  const activity = () => client.messages.flatMap((m) => (m.type === "draft.state" && m.draft.id === "fresh" ? [m.draft.activity] : [])).at(-1);
  await until(() => activity() === "idle", 60_000, "the session idle");
  await client.ok("draft.player.set", { projectId: project.id, draftId: "fresh", instance, playerId: "dev.fresh" });
  await client.ok("draft.send", { projectId: project.id, draftId: "fresh", instance, text: "and now" });
  await until(() => runs().length === 3, 60_000, "the chosen player's run");
  assert.equal(runs()[2]!.model, "claude-fresh");

  // A compile runs on the answering agent as the file stands.
  await until(() => activity() === "idle", 60_000, "the session idle again");
  writeFileSync(configPath, CONFIG("claude-queued", "  dev.fresh:\n    adapter: claude\n    model: claude-compiler\n"));
  await client.ok("draft.source.write", { projectId: project.id, draftId: "fresh", instance, content: "# Fresh\n" });
  // The stub compiler fails by design; what it was handed is the point.
  await client.command("draft.compile", { projectId: project.id, draftId: "fresh", instance });
  await until(() => compilerModels.length === 1, 60_000, "the compiler");
  assert.deepEqual(compilerModels, ["claude-compiler"]);

  // A compile whose config cannot be read as standing fails, recorded at
  // the toolchain, with no compiler run.
  const compileFailed = () => client.messages.some((m) => m.type === "draft.state" && m.draft.id === "fresh" && m.draft.compile?.outcome === "failed" && m.draft.compile.phase === "toolchain" && /changed meanwhile/.test(m.draft.compile.output ?? ""));
  await until(() => activity() === "idle", 60_000, "the session idle before the refused compile");
  codeModule = ownCodeModule;
  const spawnsBefore = spawns;
  writeFileSync(configPath, CONFIG("claude-queued", "  dev.fresh:\n    adapter: claude\n    model: claude-refused-1\n"));
  const firstRead = arm();
  const secondRead = arm();
  const compile = client.command("draft.compile", { projectId: project.id, draftId: "fresh", instance });
  await until(() => firstRead.reached, 30_000, "the compile's held config read");
  writeFileSync(configPath, CONFIG("claude-queued", "  dev.fresh:\n    adapter: claude\n    model: claude-refused-2\n"));
  firstRead.open();
  await until(() => secondRead.reached, 30_000, "the compile's held re-read");
  writeFileSync(configPath, CONFIG("claude-queued", "  dev.fresh:\n    adapter: claude\n    model: claude-refused-3\n"));
  secondRead.open();
  // The Boss's compile awaits its outcome: the reply is the refusal, and
  // the session file records it, settling the marker the compile started.
  const refused = await compile;
  assert.ok(!refused.ok && refused.error.code === "invalid_request" && /changed meanwhile/.test(refused.error.message), JSON.stringify(refused));
  await until(compileFailed, 30_000, "the refused compile's record");
  assert.equal(spawns, spawnsBefore, "no compiler ran");
});
