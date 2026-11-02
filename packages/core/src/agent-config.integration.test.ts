// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Workshop agents in one pass (DR-200), over the protocol against real
// config files: readiness always naming Claude and Codex with
// Playbook's credential forms, faults by kind, Claude's base-URL state
// and the core's platform and shell (core-service-9, settings-14); the
// config state's revision (core-service-45); and `config.batch`
// applied all or none against it (core-service-44,
// shared-config-roundtrip-1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { WebSocket } from "ws";

import { CoreService, type CoreServiceOptions } from "./service.js";
import type { Command, CommandResults, ConfigState, ReadinessEntry, ServerMessage } from "./protocol.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import type { SignInAnswer } from "./local-credentials.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";

type Reply<T extends Command["type"]> =
  | { ok: true; result: CommandResults[T] }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

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
    await until(() => this.messages.some((m) => m.type === "reply" && m.id === id), type);
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
async function until(check: () => boolean, what = "condition", timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(10);
  }
}

/** The Workshop's first-run shape: every agent pinned to an official
 * name, one role's binding naming a model of its own, comments and
 * hand-written fields a batch must keep. */
const WORKSHOP_CONFIG = `# Written by the first run.
captain:
  adapter: claude
  model: claude-opus-5-5 # the seed's pin
  instruction: Keep replies short.
players:
  dev.coder:
    # The coder writes.
    adapter: claude
    model: claude-opus-5-5
    instruction: Hand-written, kept.
  dev.reviewer:
    adapter: codex
    model: gpt-6-sol
playbooks:
  code:
    roles:
      coder: dev.coder
  review:
    roles:
      coder:
        player: dev.coder
        model: claude-opus-5-5 # a role's own
      reviewer: dev.reviewer
`;

/** Claude's players and a Captain on Gemini; Codex referenced nowhere. */
const READINESS_CONFIG = `captain:
  adapter: gemini
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    roles:
      coder: dev.coder
  review:
    roles:
      coder: dev.coder
      reviewer: dev.coder
`;

interface Harness { service: CoreService; client: Client; configPath: string; home: string }

async function start(
  config: string,
  options: { env?: NodeJS.ProcessEnv; adapterRuntime?: CoreServiceOptions["adapterRuntime"]; agentSignIn?: CoreServiceOptions["agentSignIn"]; homeFolders?: string[]; homeFiles?: Record<string, string> } = {},
): Promise<Harness> {
  const dir = scratchDir("spex-agent-config-");
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, config);
  const home = join(dir, "user");
  mkdirSync(home);
  for (const folder of options.homeFolders ?? []) mkdirSync(join(home, folder));
  for (const [file, text] of Object.entries(options.homeFiles ?? {})) writeFileSync(join(home, file), text);
  const { imports } = fakeAdapterImports({ rules: [], fallback: { result: "reply" } });
  const service = await CoreService.start({
    token: "test", configPath, dataDir: join(dir, "state"), adapterImports: imports,
    adapterRuntime: options.adapterRuntime ?? (() => ({ usable: true })),
    // The agents' own status commands are faked, so the host's sign-ins
    // never decide a verdict.
    agentSignIn: options.agentSignIn ?? (async () => ({ state: "signed-out" })),
    env: options.env ?? {}, home, own: "tester", watchConfig: false,
    captainFactory: async () => createScriptedCaptain(async () => {}),
  });
  const client = new Client(service.port());
  await client.open();
  // The built-in environment installs at start; a config enabling its
  // playbooks composes once it stands.
  for (let attempt = 0; ; attempt += 1) {
    const state = await client.ok("config.get", {});
    if (state.status === "valid" || attempt > 600) break;
    await sleep(50);
  }
  return { service, client, configPath, home };
}

async function stop(harness: Harness): Promise<void> {
  harness.client.close();
  await harness.service.stop();
}

const byAdapter = (entries: ReadinessEntry[]) => new Map(entries.map((entry) => [entry.adapter, entry]));
const valid = (state: ConfigState) => {
  assert.equal(state.status, "valid", JSON.stringify(state));
  return state as Extract<ConfigState, { status: "valid" }>;
};

test("settings-19: readiness takes each credential form, always names Claude and Codex, lists faults by kind and reads the base URL by its host alone", { timeout: 300_000 }, async () => {
  const cases: {
    label: string;
    env: NodeJS.ProcessEnv;
    homeFolders?: string[];
    homeFiles?: Record<string, string>;
    unusable?: string[];
    signIn?: Partial<Record<"claude" | "codex", SignInAnswer>>;
    claude: boolean | null;
    codex: boolean | null;
    baseUrl: ReadinessEntry["baseUrl"];
  }[] = [
    { label: "token forms", env: { ANTHROPIC_AUTH_TOKEN: "sk-a", CODEX_API_KEY: "sk-c", ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic?key=sk-secret", SHELL: "/bin/zsh" }, claude: true, codex: true, baseUrl: { state: "third-party", host: "api.deepseek.com" } },
    { label: "OAuth and access tokens", env: { CLAUDE_CODE_OAUTH_TOKEN: "t", CODEX_ACCESS_TOKEN: "t", ANTHROPIC_BASE_URL: "https://api.anthropic.com", SHELL: "/usr/local/bin/bash" }, claude: true, codex: true, baseUrl: { state: "unset" } },
    { label: "API keys", env: { ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k", ANTHROPIC_BASE_URL: "not a url" }, claude: true, codex: true, baseUrl: { state: "unknown" } },
    // The runtimes make these folders on their first start: no sign-in.
    { label: "folders alone", env: {}, homeFolders: [".claude", ".claude/skills", ".codex"], claude: false, codex: false, baseUrl: { state: "unset" } },
    { label: "signed in", env: {}, homeFolders: [".claude", ".codex"], signIn: { claude: { state: "signed-in" }, codex: { state: "signed-in" } }, claude: true, codex: true, baseUrl: { state: "unset" } },
    { label: "sign-in unconfirmed", env: {}, homeFolders: [".claude", ".codex"], signIn: { claude: { state: "unconfirmed", reason: "its status command did not answer in time" }, codex: { state: "unconfirmed", reason: "its status command reported an error" } }, claude: null, codex: null, baseUrl: { state: "unset" } },
    // Claude's settings file sets variables a run applies over its own.
    { label: "Claude's settings file", env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" }, homeFolders: [".claude"], homeFiles: { ".claude/settings.json": JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic", ANTHROPIC_AUTH_TOKEN: "sk-g" } }) }, claude: true, codex: false, baseUrl: { state: "third-party", host: "open.bigmodel.cn" } },
    // No folder, no sign-in: nothing is asked, so nothing is created.
    { label: "nothing, Codex's runtime unusable", env: {}, unusable: ["codex"], claude: false, codex: false, baseUrl: { state: "unset" } },
    { label: "unconfirmed, Codex's runtime unusable", env: {}, homeFolders: [".codex"], unusable: ["codex"], signIn: { codex: { state: "unconfirmed", reason: "its status command could not start" } }, claude: false, codex: false, baseUrl: { state: "unset" } },
  ];
  for (const entry of cases) {
    const asked: { adapter: string; home: string | undefined }[] = [];
    const harness = await start(READINESS_CONFIG, {
      env: entry.env,
      ...(entry.homeFolders ? { homeFolders: entry.homeFolders } : {}),
      ...(entry.homeFiles ? { homeFiles: entry.homeFiles } : {}),
      agentSignIn: async (adapter, env) => {
        asked.push({ adapter, home: env.HOME });
        return entry.signIn?.[adapter] ?? { state: "signed-out" };
      },
      adapterRuntime: (adapter) => entry.unusable?.includes(adapter)
        ? { usable: false, requirement: `the ${adapter} runtime failed to load` }
        : { usable: true },
    });
    try {
      const entries = await harness.client.ok("readiness.get", {});
      const map = byAdapter(entries);
      // One entry per adapter; Codex stands though nothing names it
      // (settings-14).
      assert.deepEqual(entries.map((e) => e.adapter).sort(), ["claude", "codex", "gemini"], entry.label);
      assert.deepEqual(map.get("codex")?.usedBy, [], entry.label);
      // The built-ins the config names no entry for compose on their
      // default bindings too (core-service-2).
      assert.deepEqual(map.get("claude")?.usedBy, ["dev.coder (code.coder, review.coder, review.reviewer, branch.coder, decide.coder, pr.coder)"], entry.label);
      // The players those defaults name and the roster lacks stand in on
      // the Captain's block (core-service-2).
      assert.deepEqual(map.get("gemini")?.usedBy, ["captain", "dev.reviewer (decide.reviewer)", "dev.analyst (dev.analyst)", "dev.inspector (inspect.inspector)"], entry.label);
      assert.equal(map.get("claude")?.ready, entry.claude, `${entry.label}: claude`);
      assert.equal(map.get("codex")?.ready, entry.codex, `${entry.label}: codex`);
      // No preflight rule: unknown, verify yourself (settings-14).
      assert.equal(map.get("gemini")?.ready, null, entry.label);
      // The host alone: no scheme, path or key (settings-14).
      assert.deepEqual(map.get("claude")?.baseUrl, entry.baseUrl, entry.label);
      assert.ok(!JSON.stringify(entries).includes("sk-secret"), `${entry.label}: no secret`);
      assert.equal(map.get("codex")?.baseUrl, undefined, entry.label);
      for (const each of entries) {
        assert.equal(each.platform, process.platform, entry.label);
        assert.equal(each.shell, entry.env.SHELL ? entry.env.SHELL.split("/").at(-1) : undefined, entry.label);
      }
      // A credential variable needs no question; without one, the
      // agent's own status command is asked in this home (settings-14).
      for (const adapter of ["claude", "codex"] as const) {
        const variable = Object.keys(entry.env).some((name) => (adapter === "claude" ? /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN)$/ : /^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/).test(name))
          || (adapter === "claude" && Boolean(entry.homeFiles?.[".claude/settings.json"]));
        const questions = asked.filter((question) => question.adapter === adapter);
        const folder = entry.homeFolders?.includes(`.${adapter}`) ?? false;
        if (variable || !folder) assert.deepEqual(questions, [], `${entry.label}: ${adapter} asked nothing`);
        else {
          assert.ok(questions.length > 0, `${entry.label}: ${adapter} asked`);
          for (const question of questions) assert.equal(question.home, harness.home, `${entry.label}: ${adapter} asked in this home`);
        }
      }
      if (entry.claude === null) {
        // Unconfirmed: null readiness with the reason, no fault, so the
        // card asks for a re-check rather than a sign-in (settings-14).
        for (const adapter of ["claude", "codex"] as const) {
          assert.deepEqual(map.get(adapter)?.faults, [], `${entry.label}: ${adapter}`);
          assert.equal(map.get(adapter)?.unconfirmed, (entry.signIn?.[adapter] as { reason: string }).reason, `${entry.label}: ${adapter}`);
        }
        assert.equal(map.get("gemini")?.unconfirmed, undefined, "no rule is no unconfirmed sign-in");
      } else if (entry.signIn?.codex?.state === "unconfirmed") {
        // An unusable runtime decides: not ready, its fault alone.
        const codex = map.get("codex")!;
        assert.deepEqual(codex.faults?.map((f) => f.kind), ["runtime"], entry.label);
        assert.equal(codex.unconfirmed, undefined, entry.label);
      } else if (entry.claude) assert.deepEqual(map.get("claude")?.faults, [], entry.label);
      else {
        // A credential fault by its kind, beside the joined requirement.
        assert.deepEqual(map.get("claude")?.faults?.map((f) => f.kind), ["credential"]);
        assert.match(map.get("claude")?.requirement ?? "", /ANTHROPIC_API_KEY/);
        const codex = map.get("codex")!;
        if (!entry.unusable) {
          assert.deepEqual(codex.faults?.map((f) => f.kind), ["credential"], entry.label);
          assert.match(codex.requirement ?? "", /OPENAI_API_KEY/);
          continue;
        }
        // Both halves unmet: both kinds, joined in the one line.
        assert.deepEqual(codex.faults?.map((f) => f.kind), ["runtime", "credential"]);
        assert.equal(codex.requirement, codex.faults!.map((f) => f.requirement).join("; "));
        assert.match(codex.requirement ?? "", /runtime failed to load/);
        assert.match(codex.requirement ?? "", /OPENAI_API_KEY/);
      }
    } finally {
      await stop(harness);
    }
  }
});

test("core-service-23: readiness with the config missing, and again invalid, holds Claude and Codex alone with no positions", { timeout: 120_000 }, async () => {
  const harness = await start(READINESS_CONFIG, { env: { ANTHROPIC_API_KEY: "k" } });
  try {
    const before = byAdapter(await harness.client.ok("readiness.get", {}));
    assert.equal(before.get("claude")?.ready, true);
    assert.equal(before.get("codex")?.ready, false);
    assert.deepEqual(before.get("codex")?.faults?.map((f) => f.kind), ["credential"]);
    assert.match(before.get("codex")?.requirement ?? "", /OPENAI_API_KEY/);
    assert.deepEqual(before.get("codex")?.usedBy, [], "an unreferenced Codex names no position");
    assert.ok(before.has("gemini"), "a referenced adapter is reported");
    writeFileSync(harness.configPath, "captain: [\n");
    assert.equal((await harness.client.ok("config.get", {})).status, "invalid");
    const invalid = await harness.client.ok("readiness.get", {});
    assert.deepEqual(invalid.map((e) => [e.adapter, e.usedBy]), [["claude", []], ["codex", []]], "invalid: Claude and Codex alone, no earlier positions");
    assert.equal(byAdapter(invalid).get("claude")?.ready, true, "readiness stands without a config");
    rmSync(harness.configPath);
    assert.equal((await harness.client.ok("config.get", {})).status, "missing");
    const missing = await harness.client.ok("readiness.get", {});
    assert.deepEqual(missing.map((e) => [e.adapter, e.usedBy]), [["claude", []], ["codex", []]], "missing: Claude and Codex alone");
  } finally {
    await stop(harness);
  }
});

test("core-service-150: config.get, the config.state broadcast and each write's reply carry one revision for one state, a new one after any writer's change", { timeout: 120_000 }, async () => {
  const harness = await start(WORKSHOP_CONFIG);
  const { client } = harness;
  try {
    const first = valid(await client.ok("config.get", {}));
    assert.match(first.revision ?? "", /^[0-9a-f]{64}$/, "the digest of the file's bytes");
    assert.equal(valid(await client.ok("config.get", {})).revision, first.revision, "one state, one revision");

    let mark = client.messages.length;
    const edited = valid(await client.ok("config.edit", { op: { kind: "theme.set", theme: "dark" } }));
    assert.notEqual(edited.revision, first.revision, "an edit is a new state");
    await until(() => client.states(mark).length > 0, "the edit's broadcast");
    assert.equal(valid(client.states(mark).at(-1)!).revision, edited.revision, "the broadcast carries the reply's revision");
    assert.equal(valid(await client.ok("config.get", {})).revision, edited.revision);

    mark = client.messages.length;
    const batched = valid(await client.ok("config.batch", { ops: [{ kind: "captain.set", patch: { model: null } }], revision: edited.revision! }));
    assert.notEqual(batched.revision, edited.revision, "a batch is a new state");
    await until(() => client.states(mark).length > 0, "the batch's broadcast");
    assert.equal(valid(client.states(mark).at(-1)!).revision, batched.revision);
    assert.equal(valid(await client.ok("config.get", {})).revision, batched.revision);

    // Another writer: the next state's revision follows the bytes.
    writeFileSync(harness.configPath, readFileSync(harness.configPath, "utf8") + "# touched outside\n");
    const outside = valid(await client.ok("config.get", {}));
    assert.notEqual(outside.revision, batched.revision);
  } finally {
    await stop(harness);
  }
});

test("core-service-151: a batch refused as a conflict, a violation or a request error leaves the file's bytes as they were", { timeout: 180_000 }, async () => {
  const harness = await start(WORKSHOP_CONFIG);
  const { client, configPath } = harness;
  try {
    const revision = (): Promise<string> => client.ok("config.get", {}).then((state) => valid(state).revision!);
    const onClaude = [
      { kind: "captain.set" as const, patch: { model: null } },
      { kind: "player.set" as const, playerId: "dev.coder", patch: { model: null } },
    ];

    // A player added on Claude after the client read the revision.
    let seen = await revision();
    writeFileSync(configPath, readFileSync(configPath, "utf8").replace("players:\n", "players:\n  dev.second:\n    adapter: claude\n    model: claude-opus-5-5\n"));
    let bytes = readFileSync(configPath, "utf8");
    let reply = await client.command("config.batch", { ops: onClaude, revision: seen });
    assert.ok(!reply.ok && reply.error.code === "conflict", JSON.stringify(reply));
    assert.equal(readFileSync(configPath, "utf8"), bytes, "a new player: nothing written");

    // A binding given a model of its own after the read.
    seen = await revision();
    writeFileSync(configPath, readFileSync(configPath, "utf8").replace("      coder: dev.coder\n  review:", "      coder:\n        player: dev.coder\n        model: opus\n  review:"));
    bytes = readFileSync(configPath, "utf8");
    reply = await client.command("config.batch", { ops: onClaude, revision: seen });
    assert.ok(!reply.ok && reply.error.code === "conflict", JSON.stringify(reply));
    assert.equal(readFileSync(configPath, "utf8"), bytes, "a binding's own model: nothing written");

    // One operation outside its adapter's vocabulary.
    seen = await revision();
    reply = await client.command("config.batch", { ops: [onClaude[0]!, { kind: "player.set", playerId: "dev.coder", patch: { effort: "ludicrous" } }], revision: seen });
    assert.ok(!reply.ok && reply.error.code === "invalid_config", JSON.stringify(reply));
    let violations = (reply.ok ? [] : reply.error.details?.violations) as { rule: string; field?: string; ops: number[] }[];
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]!.rule, "tuning");
    assert.equal(violations[0]!.field, "players.dev.coder.effort");
    assert.deepEqual(violations[0]!.ops, [1], "the operation that set it");
    assert.equal(readFileSync(configPath, "utf8"), bytes);

    // Two operations, each valid alone, violating core-service-16 together.
    const offAlone = await client.command("config.batch", { ops: [{ kind: "player.set", playerId: "dev.coder", patch: { subagentModel: false } }], revision: seen });
    assert.ok(offAlone.ok, `Off alone is valid: ${JSON.stringify(offAlone)}`);
    // Put the file back as it was, so the pair meets the same bytes.
    writeFileSync(configPath, bytes);
    seen = await revision();
    const effortAlone = await client.command("config.batch", { ops: [{ kind: "playbook.role.bind", playbookId: "code", role: "coder", playerId: "dev.coder", subagentEffort: "low" }], revision: seen });
    assert.ok(effortAlone.ok, `the effort alone is valid: ${JSON.stringify(effortAlone)}`);
    writeFileSync(configPath, bytes);
    seen = await revision();
    reply = await client.command("config.batch", {
      ops: [
        { kind: "player.set", playerId: "dev.coder", patch: { subagentModel: false } },
        { kind: "captain.set", patch: { model: null } },
        { kind: "playbook.role.bind", playbookId: "code", role: "coder", playerId: "dev.coder", subagentEffort: "low" },
      ],
      revision: seen,
    });
    assert.ok(!reply.ok && reply.error.code === "invalid_config", JSON.stringify(reply));
    violations = (reply.ok ? [] : reply.error.details?.violations) as typeof violations;
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]!.rule, "subagent-effort", JSON.stringify(violations));
    assert.match(violations[0]!.field ?? "", /subagentEffort$/);
    assert.deepEqual(violations[0]!.ops, [0, 2], "both operations, not the Captain's");
    assert.equal(readFileSync(configPath, "utf8"), bytes, "the pair wrote nothing");

    // The file changed while the batch composed: the versioned write
    // refuses it. The module load is the composition's own await.
    seen = await revision();
    const internals = harness.service as unknown as { options: { loadModule?: (specifier: string) => Promise<unknown> } };
    const original = internals.options.loadModule;
    let changed = false;
    internals.options.loadModule = async (specifier: string) => {
      if (!changed) {
        changed = true;
        writeFileSync(configPath, readFileSync(configPath, "utf8") + "# written meanwhile\n");
      }
      return original ? original(specifier) : import(isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier);
    };
    reply = await client.command("config.batch", { ops: onClaude, revision: seen });
    internals.options.loadModule = original;
    assert.ok(changed, "the composition loaded a module");
    assert.ok(!reply.ok && reply.error.code === "conflict", JSON.stringify(reply));
    assert.ok(readFileSync(configPath, "utf8").endsWith("# written meanwhile\n"), "the other writer's bytes stand");

    // Another kind, or none: a malformed command.
    bytes = readFileSync(configPath, "utf8");
    seen = await revision();
    reply = await client.command("config.batch", { ops: [{ kind: "theme.set", theme: "dark" } as never], revision: seen });
    assert.ok(!reply.ok && reply.error.code === "invalid_message", JSON.stringify(reply));
    reply = await client.command("config.batch", { ops: [], revision: seen });
    assert.ok(!reply.ok && reply.error.code === "invalid_message", JSON.stringify(reply));
    assert.equal(readFileSync(configPath, "utf8"), bytes);
  } finally {
    await stop(harness);
  }
});

test("core-service-152: one batch sets the Captain, a player and a binding to Provider default, keeping comments and hand-written fields", { timeout: 120_000 }, async () => {
  const harness = await start(WORKSHOP_CONFIG);
  const { client, configPath } = harness;
  try {
    const before = valid(await client.ok("config.get", {}));
    const state = valid(await client.ok("config.batch", {
      ops: [
        { kind: "captain.set", patch: { model: null } },
        { kind: "player.set", playerId: "dev.coder", patch: { model: null } },
        { kind: "playbook.role.bind", playbookId: "review", role: "coder", playerId: "dev.coder", model: false },
      ],
      revision: before.revision!,
    }));
    const text = readFileSync(configPath, "utf8");
    const parsed = parseYaml(text) as {
      captain: Record<string, unknown>;
      players: Record<string, Record<string, unknown>>;
      playbooks: { review: { roles: { coder: Record<string, unknown> } } };
    };
    assert.equal("model" in parsed.captain, false, "the Captain's model removed");
    assert.equal("model" in parsed.players["dev.coder"]!, false, "the player's model removed");
    assert.equal(parsed.playbooks.review.roles.coder.model, false, "the binding takes Provider default");
    assert.equal(parsed.players["dev.reviewer"]!.model, "gpt-6-sol", "Codex untouched");
    for (const kept of ["# Written by the first run.", "# The coder writes.", "Keep replies short.", "Hand-written, kept.", "# a role's own"]) {
      assert.ok(text.includes(kept), `kept: ${kept}`);
    }
    // The reply is the reloaded state: every Claude agent on the
    // provider's default.
    assert.equal(state.summary.captain.model, undefined);
    assert.equal(state.summary.players.find((p) => p.id === "dev.coder")?.agent.model, undefined);
    const review = state.summary.playbooks.find((p) => p.id === "review")!;
    assert.equal(review.roles.coder?.model, false);
    const code = state.summary.playbooks.find((p) => p.id === "code")!;
    assert.equal(code.roles.coder?.model, undefined, "inherits the player's provider default");
    assert.deepEqual(valid(await client.ok("config.get", {})).summary, state.summary);
  } finally {
    await stop(harness);
  }
});

test("shared-config-roundtrip-3: one batch lands as one write the core reloads, comments kept; an outdated revision is refused with the bytes unchanged", { timeout: 120_000 }, async () => {
  const harness = await start(WORKSHOP_CONFIG);
  const { client, configPath } = harness;
  try {
    const seen = valid(await client.ok("config.get", {})).revision!;
    const state = valid(await client.ok("config.batch", {
      ops: [
        { kind: "captain.set", patch: { model: "deepseek-flash" } },
        { kind: "player.set", playerId: "dev.coder", patch: { model: "deepseek-flash" } },
        { kind: "playbook.role.bind", playbookId: "review", role: "coder", playerId: "dev.coder", model: false },
      ],
      revision: seen,
    }));
    // The core's own reload of the written file validates it.
    assert.equal(state.summary.captain.model, "deepseek-flash");
    const reloaded = valid(await client.ok("config.get", {}));
    assert.equal(reloaded.revision, state.revision);
    const text = readFileSync(configPath, "utf8");
    assert.ok(text.includes("# The coder writes.") && text.includes("# Written by the first run."), "comments survive the batch");
    // The revision read before that write is outdated now.
    const reply = await client.command("config.batch", { ops: [{ kind: "captain.set", patch: { model: null } }], revision: seen });
    assert.ok(!reply.ok && reply.error.code === "conflict", JSON.stringify(reply));
    assert.equal(readFileSync(configPath, "utf8"), text, "refused, unchanged");
  } finally {
    await stop(harness);
  }
});

test("shared-config-roundtrip-4: a batch whose operations violate a rule together is refused naming it, the bytes unchanged", { timeout: 120_000 }, async () => {
  const harness = await start(WORKSHOP_CONFIG);
  const { client, configPath } = harness;
  try {
    const bytes = readFileSync(configPath, "utf8");
    const reply = await client.command("config.batch", {
      ops: [
        { kind: "player.set", playerId: "dev.coder", patch: { subagentModel: false } },
        { kind: "playbook.role.bind", playbookId: "code", role: "coder", playerId: "dev.coder", subagentEffort: "low" },
      ],
      revision: valid(await client.ok("config.get", {})).revision!,
    });
    assert.ok(!reply.ok && reply.error.code === "invalid_config", JSON.stringify(reply));
    assert.match(reply.ok ? "" : reply.error.message, /subagentEffort/, "the rule's field named");
    assert.equal(readFileSync(configPath, "utf8"), bytes);
  } finally {
    await stop(harness);
  }
});
