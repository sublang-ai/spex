// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A seat's agent credentials (core-service-126, core-service-127,
// settings-48..50, storage-44, DR-132), on real cores over the fixture
// adapter, which records the environment each run starts with: the
// administrator's shared credential file reaches every run, a value
// replaced between runs reaches the next while a running agent keeps its
// own, a member's own credential displaces its agent's shared names, an
// unreadable file is reported and blocks nothing; readiness delivers each
// credential class and its phrase, a fake status command answering valid
// and expired; and `credential.set`, `credential.list` and
// `credential.remove` keep the member's credentials owner-only under
// `local/`, listing no secret, and are refused off a seat.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { codeCredentialsPath } from "./code-credentials.js";
import type { LineSpawner } from "./compile.js";
import { defaultRunCommand, type RunCommand } from "./forge.js";
import type { Command, CredentialList, ReadinessEntry } from "./protocol.js";
import { AGENT_CREDENTIAL_FORMS } from "./seat-credentials.js";
import { fakeAdapterImports, type FakeAdapterStats } from "./testing/fake-adapter.js";
import { createSpaceHarness, ownClone } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, startHome, runTurn, gitFolder } = fixture;
type Home = Awaited<ReturnType<typeof startHome>>;

// The runs inherit this process's environment: every agent's forms are
// cleared for the suite, whatever the machine running it exports, and
// put back after it.
const FORMS = Object.values(AGENT_CREDENTIAL_FORMS).flatMap((forms) => forms.names);
const saved = new Map(FORMS.map((name) => [name, process.env[name]]));
for (const name of FORMS) delete process.env[name];
test.after(async () => {
  await fixture.dispose();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const SEAT = { serverId: "srv_7f3a", serverName: "lab-1", personId: "1001" };

/** The fixture adapter, recording each run's prompt and environment;
 * a `hold:` prompt runs until its turn is aborted. */
function recordingAdapter(): { imports: ReturnType<typeof fakeAdapterImports>["imports"]; stats: FakeAdapterStats } {
  const stats: FakeAdapterStats = { constructed: 0, runs: [] };
  const { imports } = fakeAdapterImports({
    rules: [
      { match: "route:", response: { result: '{"decision":"dispatch"}' } },
      { match: "hold:", response: { deltas: ["holding"], result: "held", untilAborted: true } },
    ],
    fallback: { deltas: ["hello ", "world"], result: "hello world" },
  }, stats);
  return { imports, stats };
}

/** The administrator's file, replaced whole as an editor's save does. */
function writeShared(path: string, text: string): void {
  const next = `${path}.next`;
  writeFileSync(next, text);
  renameSync(next, path);
}

async function until<T>(read: () => T | undefined, what: string, timeoutMs = 20_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The agents' status commands answering valid, so no suite spawns a
 * real agent; everything else runs as it is. */
const validStatus: RunCommand = async (command, args, cwd, env) =>
  args.join(" ") === "auth status" || args.join(" ") === "login status"
    ? { code: 0, stdout: "", stderr: "" }
    : defaultRunCommand(command, args, cwd, env);

/** A seat on a home whose projects a core of its own registered first:
 * on a seat no command names a working folder (core-service-125). */
async function startSeat(name: string, options: {
  shared?: string;
  projects?: number;
  config?: string;
  runCommand?: RunCommand;
  imports?: ReturnType<typeof fakeAdapterImports>["imports"];
  env?: Record<string, string>;
  compileSpawner?: LineSpawner;
} = {}): Promise<{ home: Home; projects: string[] }> {
  const dataDir = mkdtempSync(join(scratch, `${name}-`));
  if (options.config !== undefined) {
    mkdirSync(join(ownClone(dataDir), "config"), { recursive: true });
    writeFileSync(join(ownClone(dataDir), "config", "playbook.config.yaml"), options.config);
  }
  const projects: string[] = [];
  if ((options.projects ?? 0) > 0) {
    const own = await startHome(`${name}-own`, { dataDir, project: false });
    try {
      for (let index = 0; index < (options.projects ?? 0); index += 1) {
        projects.push((await own.client.expectOk("project.register", { path: gitFolder(`${name}-work-${index}`) })).id);
      }
    } finally {
      await own.stop();
    }
  }
  const home = await startHome(name, {
    dataDir,
    project: false,
    ...(options.env ? { env: options.env } : {}),
    extra: {
      seat: { ...SEAT, ...(options.shared !== undefined ? { sharedCredentialFile: options.shared } : {}) },
      ...(options.imports ? { adapterImports: options.imports } : {}),
      ...(options.compileSpawner ? { compileSpawner: options.compileSpawner } : {}),
      runCommand: options.runCommand ?? validStatus,
    },
  });
  return { home, projects };
}

/** Every file under a directory holding `text`, Git data aside. */
function filesHolding(dir: string, text: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && readFileSync(full).includes(text)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

test("core-service-127, core-service-126: the shared file's forms reach every run, and a value replaced between runs reaches the next while the running one keeps its own", async (t) => {
  const shared = join(scratch, "shared-replaced.env");
  writeShared(shared, [
    "# The administrator's shared sign-ins",
    "",
    "CLAUDE_CODE_OAUTH_TOKEN=sk-shared-one",
    "CODEX_ACCESS_TOKEN=codex 'one' $HOME",
    "ANTHROPIC_AUTH_TOKEN=",
    "SOME_OTHER_NAME=ignored",
    "not a line of the format",
    "",
  ].join("\n"));
  const { imports, stats } = recordingAdapter();
  const { home, projects: [first, second] } = await startSeat("seat-replaced", { shared, projects: 2, imports });
  t.after(() => home.stop());
  assert.ok(first && second);

  // Read at start (core-service-126): only the agents' forms, as written,
  // with no quoting or expansion, an empty value kept.
  assert.equal(process.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-shared-one");
  assert.equal(process.env.CODEX_ACCESS_TOKEN, "codex 'one' $HOME");
  assert.equal(process.env.ANTHROPIC_AUTH_TOKEN, "");
  assert.equal(process.env.SOME_OTHER_NAME, undefined, "a name no agent takes is ignored");

  // A run holds while the file is replaced.
  const held = (await home.client.expectOk("session.create", { projectId: first })).id;
  await home.client.expectOk("turn.submit", { sessionId: held, text: "hold: first" });
  const holding = await until(() => stats.runs.find((run) => run.prompt === "hold: first"), "the held run");
  assert.equal(holding.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-shared-one", "the file's value reaches the run");
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=sk-shared-two\nCODEX_ACCESS_TOKEN=codex-two\n");

  // The next run, in another project, takes the replaced value with no
  // restart; a form the file no longer names leaves the environment.
  await runTurn(home, second, "next run");
  const next = stats.runs.filter((run) => run.prompt.includes("next run"));
  assert.ok(next.length > 0, "the next turn ran its agents");
  for (const run of next) {
    assert.equal(run.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-shared-two");
    assert.equal(run.env.CODEX_ACCESS_TOKEN, "codex-two");
    assert.equal(run.env.ANTHROPIC_AUTH_TOKEN, undefined);
  }

  // The held run is still running, on the value it started with.
  const sessions = await home.client.expectOk("session.list", {});
  assert.equal(sessions.find((session) => session.id === held)?.turnActive, true, "the first run still runs");
  assert.equal(holding.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-shared-one");
  const from = home.client.messages.length;
  await home.client.expectOk("turn.abort", { sessionId: held });
  await home.client.waitFor((m) => home.client.messages.indexOf(m) >= from && m.type === "session.state" && m.session.id === held && !m.session.turnActive, 20_000);

  // No value of the file is written anywhere in the home.
  assert.deepEqual(filesHolding(home.dataDir, "sk-shared-"), []);
});

test("core-service-127, core-service-126: a member's own credential displaces its agent's shared names and no other agent's", async (t) => {
  const shared = join(scratch, "shared-own.env");
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=sk-shared\nANTHROPIC_AUTH_TOKEN=auth-shared\nCODEX_ACCESS_TOKEN=codex-shared\n");
  const { imports, stats } = recordingAdapter();
  const { home, projects: [project] } = await startSeat("seat-own-credential", { shared, projects: 1, imports });
  t.after(() => home.stop());
  assert.ok(project);

  await home.client.expectOk("credential.set", { kind: "agent", name: "claude", values: { ANTHROPIC_API_KEY: "sk-mine" } });
  await runTurn(home, project, "own credential");
  const runs = stats.runs.filter((run) => run.prompt.includes("own credential"));
  assert.ok(runs.length > 0);
  for (const run of runs) {
    assert.equal(run.env.ANTHROPIC_API_KEY, "sk-mine", "the member's own is put in");
    assert.equal(run.env.CLAUDE_CODE_OAUTH_TOKEN, undefined, "the file's names for that agent are left out");
    assert.equal(run.env.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(run.env.CODEX_ACCESS_TOKEN, "codex-shared", "another agent keeps the shared form");
  }

  // Removed, the shared form returns at the next run.
  await home.client.expectOk("credential.remove", { kind: "agent", name: "claude" });
  await runTurn(home, project, "shared again");
  for (const run of stats.runs.filter((run) => run.prompt.includes("shared again"))) {
    assert.equal(run.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-shared");
    assert.equal(run.env.ANTHROPIC_API_KEY, undefined);
  }
});

test("core-service-127, core-service-126: an unreadable shared file leaves the environment as it was, is reported through readiness and blocks no run", async (t) => {
  const shared = join(scratch, "shared-unreadable.env");
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=sk-before\n");
  const { imports, stats } = recordingAdapter();
  const { home, projects: [project] } = await startSeat("seat-unreadable", { shared, projects: 1, imports });
  t.after(() => home.stop());
  assert.ok(project);

  // A path that will not read as a file, whoever runs the suite.
  rmSync(shared);
  mkdirSync(shared);
  await runTurn(home, project, "unreadable run");
  const runs = stats.runs.filter((run) => run.prompt.includes("unreadable run"));
  assert.ok(runs.length > 0, "the run is not blocked");
  for (const run of runs) assert.equal(run.env.CLAUDE_CODE_OAUTH_TOKEN, "sk-before", "the environment stays as it was");

  const claude = (await home.client.expectOk("readiness.get", {})).find((entry) => entry.adapter === "claude");
  assert.deepEqual(claude?.credential, { class: "unreadable", phrase: "This server's shared sign-in cannot be read: ask its administrator" });
});

test("core-service-127, core-service-126: a compile's agent run reads the shared file afresh, a replaced value reaching the compiler's environment", async (t) => {
  const shared = join(scratch, "shared-compile.env");
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=sk-compile-one\n");
  // The toolchain probe answered and the compiler stubbed: each slc run
  // records the environment it was spawned with, then fails.
  const slcEnvs: NodeJS.ProcessEnv[] = [];
  const compileSpawner: LineSpawner = async (_command, args, _cwd, onLine, _signal, env) => {
    if (args.length === 1 && args[0] === "--version") {
      onLine("v24.1.0");
      return 0;
    }
    slcEnvs.push({ ...(env ?? process.env) });
    return 1;
  };
  const { home, projects: [project] } = await startSeat("seat-compile", { shared, projects: 1, env: { SPEX_SLC: "stub-slc" }, compileSpawner });
  t.after(() => home.stop());
  assert.ok(project);

  // Replaced with no run or readiness between: the form's compile takes
  // the new value.
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=sk-compile-two\n");
  await home.client.expectError("compile.run", {
    playbookId: "pair",
    sourceText: "# Pair\n\nA two-player workflow.\n",
    roles: ["coder"],
    command: "pair",
    intent: "pair workflow for tests",
    bindings: { coder: "dev.coder" },
    projectId: project,
  }, "invalid_request", /slc playbook failed/);
  assert.equal(slcEnvs.length, 1, "one compiler run");
  assert.equal(slcEnvs[0]?.CLAUDE_CODE_OAUTH_TOKEN, "sk-compile-two");

  // So does a draft's compile.
  const { instance } = await home.client.expectOk("draft.create", { projectId: project, draftId: "triage", org: "acme", license: "MIT" });
  assert.ok(instance);
  await home.client.expectOk("draft.source.write", { projectId: project, draftId: "triage", instance, content: "# Triage\n\nSort what comes in.\n" });
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=sk-compile-three\n");
  await home.client.expectError("draft.compile", { projectId: project, draftId: "triage", instance }, "invalid_request");
  assert.equal(slcEnvs.length, 2, "a second compiler run");
  assert.equal(slcEnvs[1]?.CLAUDE_CODE_OAUTH_TOKEN, "sk-compile-three");
  assert.deepEqual(filesHolding(home.dataDir, "sk-compile-"), []);
});

// The captain on Codex and the coder on Claude: both agents with a
// status command take a readiness entry.
const TWO_AGENTS = `captain:
  adapter: codex
  model: gpt-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    roles:
      coder: dev.coder
`;

test("settings-50, settings-49: each credential class and phrase is delivered over the protocol, a status command answering valid and expired with the run's environment", async (t) => {
  const shared = join(scratch, "shared-classes.env");
  // The agents' status commands, faked: a value starting `expired` is
  // refused, each as its agent answers; everything else runs as it is.
  // Codex's, as the real one answers, counts only an access token: an
  // API key, valid or not, reads "Not logged in" on a failing exit.
  const status: { args: string[]; env: Record<string, string> }[] = [];
  const runCommand: RunCommand = async (command, args, cwd, env) => {
    if (args.join(" ") === "auth status" || args.join(" ") === "login status") {
      status.push({ args, env: { ...(env ?? {}) } });
      if (args[0] === "auth") {
        const expired = Object.values(env ?? {}).some((value) => value.startsWith("expired"));
        return expired
          ? { code: 1, stdout: '{"loggedIn": false, "authMethod": "none"}', stderr: "" }
          : { code: 0, stdout: '{"loggedIn": true, "authMethod": "oauth_token"}', stderr: "" };
      }
      const token = env?.CODEX_ACCESS_TOKEN;
      if (!token) return { code: 1, stdout: "", stderr: "Not logged in" };
      return token.startsWith("expired")
        ? { code: 1, stdout: "", stderr: "Error checking login status: agent identity token has expired" }
        : { code: 0, stdout: "Logged in using an agent identity token", stderr: "" };
    }
    return defaultRunCommand(command, args, cwd, env);
  };
  const { home } = await startSeat("seat-classes", { shared, config: TWO_AGENTS, runCommand });
  t.after(() => home.stop());
  const read = async (): Promise<Record<string, ReadinessEntry>> =>
    Object.fromEntries((await home.client.expectOk("readiness.get", {})).map((entry) => [entry.adapter, entry]));
  const NONE = /^sign in by setting your own credential for (claude|codex) in the Credentials section$/;

  // Absent: no form is set, and the guidance names the Credentials section.
  let entries = await read();
  for (const adapter of ["claude", "codex"]) {
    assert.equal(entries[adapter]?.ready, false);
    assert.equal(entries[adapter]?.credential?.class, "none");
    assert.match(entries[adapter]?.credential?.phrase ?? "", NONE);
    assert.match(entries[adapter]?.requirement ?? "", NONE);
  }
  assert.equal(status.length, 0, "no status command runs where no form is set");

  // Present: the shared form, its status valid.
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=sk-valid-shared\n");
  entries = await read();
  assert.deepEqual([entries.claude?.ready, entries.claude?.credential], [true, { class: "shared", phrase: "Signed in by this server's administrator" }]);
  assert.equal(entries.claude?.requirement, undefined);
  assert.equal(entries.codex?.credential?.class, "none");
  assert.deepEqual(status.at(-1), { args: ["auth", "status"], env: { CLAUDE_CODE_OAUTH_TOKEN: "sk-valid-shared" } }, "the status command runs with the run's environment");

  // Present and expired, apart from not signed in; Codex's shared API
  // key, which its status answers "Not logged in", stays shared.
  writeShared(shared, "CLAUDE_CODE_OAUTH_TOKEN=expired-shared\nCODEX_API_KEY=sk-shared-key\n");
  entries = await read();
  const sharedExpired = "This server's shared sign-in has expired: ask its administrator";
  assert.deepEqual([entries.claude?.ready, entries.claude?.credential, entries.claude?.requirement], [false, { class: "expired", phrase: sharedExpired }, sharedExpired]);
  assert.deepEqual([entries.codex?.ready, entries.codex?.credential, entries.codex?.requirement], [true, { class: "shared", phrase: "Signed in by this server's administrator" }, undefined]);
  assert.deepEqual(status.filter((call) => call.args[0] === "login").at(-1), { args: ["login", "status"], env: { CODEX_API_KEY: "sk-shared-key" } }, "Codex's status ran and said not signed in");

  // The member's own API key for Codex: "Not logged in" decides nothing,
  // whatever the key holds.
  for (const key of ["sk-valid-own", "expired-own"]) {
    await home.client.expectOk("credential.set", { kind: "agent", name: "codex", values: { OPENAI_API_KEY: key } });
    entries = await read();
    assert.deepEqual([entries.codex?.ready, entries.codex?.credential], [true, { class: "own", phrase: "Your own credential" }]);
    assert.deepEqual(status.filter((call) => call.args[0] === "login").at(-1), { args: ["login", "status"], env: { OPENAI_API_KEY: key } },
      "Codex's status command runs with the member's own credential alone");
  }
  // Its own access token, which Codex's status checks, valid and then expired.
  await home.client.expectOk("credential.set", { kind: "agent", name: "codex", values: { CODEX_ACCESS_TOKEN: "sk-valid-own" } });
  entries = await read();
  assert.deepEqual([entries.codex?.ready, entries.codex?.credential], [true, { class: "own", phrase: "Your own credential" }]);
  await home.client.expectOk("credential.set", { kind: "agent", name: "codex", values: { CODEX_ACCESS_TOKEN: "expired-own" } });
  entries = await read();
  const ownExpired = "Your own credential has expired";
  assert.deepEqual([entries.codex?.ready, entries.codex?.credential, entries.codex?.requirement], [false, { class: "expired", phrase: ownExpired }, ownExpired]);

  // Unreadable: Claude's shared sign-in is reported apart; Codex's own wins.
  await home.client.expectOk("credential.set", { kind: "agent", name: "codex", values: { CODEX_ACCESS_TOKEN: "sk-valid-own" } });
  rmSync(shared);
  mkdirSync(shared);
  entries = await read();
  const unreadable = "This server's shared sign-in cannot be read: ask its administrator";
  assert.deepEqual([entries.claude?.ready, entries.claude?.credential, entries.claude?.requirement], [false, { class: "unreadable", phrase: unreadable }, unreadable]);
  assert.deepEqual(entries.codex?.credential, { class: "own", phrase: "Your own credential" });

  // Absent again: none.
  rmSync(shared, { recursive: true });
  entries = await read();
  assert.equal(entries.claude?.credential?.class, "none");

  // A change of an agent's credential pushes readiness.state with its class.
  const from = home.client.messages.length;
  await home.client.expectOk("credential.remove", { kind: "agent", name: "codex" });
  const pushed = await home.client.waitFor((m) => home.client.messages.indexOf(m) >= from && m.type === "readiness.state" &&
    m.entries.some((entry) => entry.adapter === "codex" && entry.credential?.class === "none"));
  assert.equal(pushed.type, "readiness.state");
});

test("settings-50, storage-44: credential.set, credential.list and credential.remove write, list without a secret and remove, owner-only, the file removed with its last entry", async (t) => {
  const { home } = await startSeat("seat-commands");
  t.after(() => home.stop());
  const file = codeCredentialsPath(home.dataDir);
  const empty: CredentialList = { hosts: [], agents: [] };
  assert.deepEqual(await home.client.expectOk("credential.list", {}), empty);
  assert.equal(existsSync(file), false);

  const afterHost = await home.client.expectOk("credential.set", { kind: "host", name: "Git.Example.com:8443", values: { token: "tok-host-secret", username: "ada" } });
  assert.deepEqual(afterHost, { hosts: [{ name: "git.example.com:8443", username: "ada" }], agents: [] });
  const afterAgent = await home.client.expectOk("credential.set", { kind: "agent", name: "kimi", values: { KIMI_MODEL_API_KEY: "tok-kimi-secret", KIMI_MODEL_NAME: "kimi-k2" } });
  assert.deepEqual(afterAgent, { hosts: [{ name: "git.example.com:8443", username: "ada" }], agents: [{ name: "kimi", names: ["KIMI_MODEL_API_KEY", "KIMI_MODEL_NAME"] }] });
  const listed = await home.client.expectOk("credential.list", {});
  assert.deepEqual(listed, afterAgent);
  assert.ok(!JSON.stringify(listed).includes("secret"), "no secret is listed");

  // Exactly the format, owner-only under an owner-only local/.
  assert.deepEqual(parseYaml(readFileSync(file, "utf8")), {
    format: 1,
    hosts: { "git.example.com:8443": { token: "tok-host-secret", username: "ada" } },
    agents: { kimi: { KIMI_MODEL_API_KEY: "tok-kimi-secret", KIMI_MODEL_NAME: "kimi-k2" } },
  });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(join(home.dataDir, "local")).mode & 0o077, 0, "local/ is owner-only");

  // Every refusal comes before anything is written, and repeats no secret.
  const before = readFileSync(file);
  const refusals: [Omit<Extract<Command, { type: "credential.set" }>, "type" | "id">, RegExp][] = [
    [{ kind: "host", name: "  ", values: { token: "t" } }, /^A credential needs a name$/],
    [{ kind: "host", name: "https://ada:tok-in-url@git.example.com", values: { token: "t" } }, /^That is not a host name/],
    [{ kind: "host", name: "git.example.com/acme", values: { token: "t" } }, /^That is not a host name/],
    [{ kind: "host", name: "ada@git.example.com", values: { token: "t" } }, /^That is not a host name/],
    [{ kind: "host", name: "git example.com", values: { token: "t" } }, /^That is not a host name/],
    [{ kind: "host", name: "git.example.com:99999", values: { token: "t" } }, /^That is not a host name/],
    [{ kind: "host", name: "git.example.com", values: { token: " " } }, /^A credential's value cannot be blank$/],
    [{ kind: "host", name: "git.example.com", values: { token: "t", username: "" } }, /^A credential's value cannot be blank$/],
    [{ kind: "host", name: "git.example.com", values: { username: "ada" } }, /^A credential's value cannot be blank$/],
    [{ kind: "host", name: "git.example.com", values: { token: "t", password: "p" } }, /^A code host's credential is a token/],
    [{ kind: "host", name: "git.example.com", values: { token: "line\nbreak" } }, /^A code host's token and username are each one line of text$/],
    [{ kind: "agent", name: "", values: { ANTHROPIC_API_KEY: "k" } }, /^A credential needs a name$/],
    [{ kind: "agent", name: "copilot", values: { ANTHROPIC_API_KEY: "k" } }, /^That is not an agent: name one of claude, codex, gemini, kimi, opencode$/],
    [{ kind: "agent", name: "codex", values: { ANTHROPIC_API_KEY: "tok-wrong-secret" } }, /^codex takes only CODEX_ACCESS_TOKEN, CODEX_API_KEY, OPENAI_API_KEY$/],
    [{ kind: "agent", name: "codex", values: { CODEX_ACCESS_TOKEN: "  " } }, /^A credential's value cannot be blank$/],
    [{ kind: "agent", name: "codex", values: {} }, /^A credential's value cannot be blank$/],
  ];
  for (const [fields, pattern] of refusals) {
    const message = await home.client.expectError("credential.set", fields, "invalid_request", pattern);
    assert.ok(!message.includes("tok-"), `no secret in “${message}”`);
  }
  await home.client.expectError("credential.remove", { kind: "host", name: "not a host" }, "invalid_request", /^That is not a host name/);
  await home.client.expectError("credential.remove", { kind: "agent", name: "copilot" }, "invalid_request", /^That is not an agent/);
  assert.deepEqual(readFileSync(file), before, "nothing was written");

  // Removed one by one, the file goes with its last entry.
  assert.deepEqual(await home.client.expectOk("credential.remove", { kind: "host", name: "GIT.example.com:8443" }), { hosts: [], agents: afterAgent.agents });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(await home.client.expectOk("credential.remove", { kind: "agent", name: "kimi" }), empty);
  assert.equal(existsSync(file), false, "the file is removed with its last entry");
  assert.deepEqual(await home.client.expectOk("credential.remove", { kind: "agent", name: "kimi" }), empty, "removing what is not set changes nothing");
  assert.equal(existsSync(file), false);
});

test("storage-44: a file of another format is refused and left as it is; a malformed entry is refused by every read and write of it and reported, others kept", async (t) => {
  const { home } = await startSeat("seat-malformed");
  t.after(() => home.stop());
  const file = codeCredentialsPath(home.dataDir);
  mkdirSync(join(home.dataDir, "local"), { recursive: true, mode: 0o700 });

  const other = "format: 2\nhosts: {}\nagents: {}\n";
  writeFileSync(file, other, { mode: 0o600 });
  await home.client.expectError("credential.list", {}, "invalid_request", /unsupported format 2; preserved unchanged$/);
  await home.client.expectError("credential.set", { kind: "agent", name: "codex", values: { OPENAI_API_KEY: "k" } }, "invalid_request", /unsupported format 2/);
  assert.equal(readFileSync(file, "utf8"), other, "the file is left as it is");
  let reports = await home.client.expectOk("storage.diagnostics", {});
  assert.ok(reports.some((report) => report.file === file && /unsupported format 2/.test(report.reason)), "the file is reported");

  writeFileSync(file, "format: 1\nhosts:\n  git.example.com:\n    token: 5\nagents:\n  claude:\n    ANTHROPIC_API_KEY: sk-kept\n");
  // The malformed entry is left out of the list and refused by a write;
  // another entry is read and written beside it, which stays.
  assert.deepEqual(await home.client.expectOk("credential.list", {}), { hosts: [], agents: [{ name: "claude", names: ["ANTHROPIC_API_KEY"] }] });
  await home.client.expectError("credential.set", { kind: "host", name: "git.example.com", values: { token: "t" } }, "invalid_request", /the host entry git\.example\.com is malformed; preserved unchanged$/);
  await home.client.expectError("credential.remove", { kind: "host", name: "git.example.com" }, "invalid_request", /the host entry git\.example\.com is malformed/);
  await home.client.expectOk("credential.set", { kind: "host", name: "code.example.org", values: { token: "tok-other" } });
  const written = parseYaml(readFileSync(file, "utf8")) as { hosts: Record<string, unknown> };
  assert.deepEqual(written.hosts, { "git.example.com": { token: 5 }, "code.example.org": { token: "tok-other" } });
  reports = await home.client.expectOk("storage.diagnostics", {});
  assert.ok(reports.some((report) => report.file === file && /the host entry git\.example\.com is malformed/.test(report.reason)), "the entry is reported");
});

test("settings-48: off a seat the credential commands are refused, and readiness carries no credential class", async (t) => {
  const home = await startHome("no-seat-credentials", { project: false });
  t.after(() => home.stop());
  const OFF_SEAT = /^Credentials are kept on a server's seat$/;
  await home.client.expectError("credential.list", {}, "invalid_request", OFF_SEAT);
  await home.client.expectError("credential.set", { kind: "host", name: "git.example.com", values: { token: "t" } }, "invalid_request", OFF_SEAT);
  await home.client.expectError("credential.remove", { kind: "agent", name: "claude" }, "invalid_request", OFF_SEAT);
  assert.equal(existsSync(codeCredentialsPath(home.dataDir)), false);
  for (const entry of await home.client.expectOk("readiness.get", {})) assert.equal(entry.credential, undefined);
});
