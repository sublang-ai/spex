// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// PBLIB coverage: the compile pipeline with a stubbed slc that emits
// fixture artifacts, exercised through esbuild packaging to a
// runnable registry; toolchain guidance when prerequisites are
// missing (PBLIB-17/18/19).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  checkToolchain,
  compilePlaybook,
  compilerAgentEnv,
  defaultSpawner,
  deriveStateIds,
  suppliedCompiler,
  type LineSpawner,
} from "./compile.js";
import { RUNTIME_ABI } from "@sublang/playbook/xstate-runtime";

import type { RegistryEntryLike } from "./config.js";
import { ARTIFACT_SCHEMAS } from "./config.js";
import { stubSlcSource } from "./testing/stub-slc.js";

const STUB_SLC = stubSlcSource();

/** Spawner that fakes a modern node for --version and otherwise
 * delegates to the real spawner (which runs the stub slc). Records
 * each slc invocation's argv and environment when given a sink. */
interface SlcCall {
  argv: string[];
  env?: NodeJS.ProcessEnv;
}

function testSpawner(
  nodeVersion = "v24.1.0",
  slcCalls?: SlcCall[],
): LineSpawner {
  return async (command, args, cwd, onLine, signal, env) => {
    if (args[0] === "--version") {
      onLine(nodeVersion);
      return 0;
    }
    slcCalls?.push({ argv: [command, ...args], ...(env ? { env } : {}) });
    return defaultSpawner(command, args, cwd, onLine);
  };
}

test("compile pipeline: stub slc to a runnable bundled registry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-compile-"));
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, STUB_SLC);

  const progress: string[] = [];
  const slcCalls: SlcCall[] = [];
  const result = await compilePlaybook({
    playbookId: "demo",
    source: { text: "# Demo\n\nA one-player demo workflow.\n" },
    roles: ["helper"],
    command: "demo",
    intent: "demo workflow for tests",
    libraryDir: join(dir, "library"),
    env: { SPEX_SLC: `${process.execPath} ${stubPath}` },
    spawner: testSpawner("v24.1.0", slcCalls),
    onProgress: (line) => progress.push(line),
  });

  // Bare invocation (DR-019): slc >= 0.2 links against the installed
  // runtime contract by default, so the argv carries no --link.
  assert.equal(slcCalls.length, 1);
  assert.deepEqual(slcCalls[0].argv, [
    process.execPath,
    stubPath,
    "playbook",
    join(dir, "library", "demo", "demo.md"),
  ]);
  // The agent-driven phases outlast slc's ten-minute silence default, so
  // the runner grants the longer stall budget (PBLIB-12).
  assert.equal(slcCalls[0].env?.SLC_STALL_TIMEOUT, "2400");

  assert.equal(result.idleStateId, "ready");
  assert.equal(result.finalStateId, "done");
  assert.deepEqual(result.parkStateIds, ["failed", "awaitBossReply"]);
  // Derived from the slc-emitted entry verbatim: under artifact schema
  // 2 a role is a playbook-local slot a user binds to a player, not a
  // host player id, so its casing survives (DR-032).
  assert.deepEqual(result.roles, ["Helper"]);
  assert.ok(progress.some((line) => line.includes("stub slc: compiled demo")));

  const moduleValue = (await import(pathToFileURL(result.from).href)) as {
    default: RegistryEntryLike;
    spexRegistryContract?: number;
  };
  assert.equal(moduleValue.spexRegistryContract, 3);
  const entry = moduleValue.default;
  assert.equal(entry.id, "demo");
  assert.equal(entry.command, "demo");
  assert.equal(entry.intent, "demo workflow for tests");
  assert.deepEqual(entry.requiredRoleIds, ["Helper"]);
  // The manifest advertises the artifact format the shared factory
  // checks; a wrapper that dropped it would fail at construction.
  assert.equal(entry.artifactSchema, ARTIFACT_SCHEMAS[0]);

  // The wrapper hands captainOptions through the entry's own
  // validateOptions and interposes on nothing else: what the host
  // passes reaches the runtime untouched.
  const runtime = entry.createRuntime({
    captainOptions: { cwd: "/tmp/project" },
    players: [{ id: "dev.helper", adapter: "claude", model: "claude-test" }],
  }) as {
    options: Record<string, unknown>;
    init(session: unknown): Promise<void>;
    session?: { ports: { callPlayer(id: string): unknown } };
  };
  assert.equal(runtime.options.cwd, "/tmp/project");

  const seenIds: string[] = [];
  await runtime.init({
    sessionId: "s1",
    ports: {
      callPlayer: (playerId: string) => {
        seenIds.push(playerId);
        return Promise.resolve();
      },
    },
  });
  // No seam rewrites the id any more: the runtime's own call is what
  // the host port sees.
  runtime.session?.ports.callPlayer("Helper");
  assert.deepEqual(seenIds, ["Helper"]);

  assert.throws(
    () => entry.validateOptions({ mystery: 1 }),
    /unknown option "mystery"/,
  );
});

test("an environment-set stall budget is left alone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-compile-"));
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, STUB_SLC);

  const slcCalls: SlcCall[] = [];
  await compilePlaybook({
    playbookId: "demo",
    source: { text: "# Demo\n\nA one-player demo workflow.\n" },
    roles: ["helper"],
    command: "demo",
    intent: "demo workflow for tests",
    libraryDir: join(dir, "library"),
    env: {
      SPEX_SLC: `${process.execPath} ${stubPath}`,
      SLC_STALL_TIMEOUT: "900",
    },
    spawner: testSpawner("v24.1.0", slcCalls),
  });

  assert.equal(slcCalls.length, 1);
  assert.equal(slcCalls[0].env?.SLC_STALL_TIMEOUT, "900");
});

test("an entry with no derived roles is refused with recompile guidance", async () => {
  // Entries compiled before slc 0.2 can declare zero roles when the
  // gears rendered Players as a heading (fixed upstream in slc 0.2).
  const dir = mkdtempSync(join(tmpdir(), "spex-compile-"));
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, stubSlcSource("[]"));

  await assert.rejects(
    compilePlaybook({
      playbookId: "demo",
      source: { text: "# Demo\n\nA zero-role workflow.\n" },
      roles: ["helper"],
      command: "demo",
      intent: "demo workflow for tests",
      libraryDir: join(dir, "library"),
      env: { SPEX_SLC: `${process.execPath} ${stubPath}` },
      spawner: testSpawner(),
    }),
    /declares no player roles; recompile with slc >= 0\.2/,
  );
});

test("toolchain guidance: old node refuses with instructions", async () => {
  const status = await checkToolchain({}, testSpawner("v20.11.0"));
  assert.equal(status.node.ok, false);
  assert.match(status.node.guidance ?? "", /Node >= 23\.6/);

  await assert.rejects(
    compilePlaybook({
      playbookId: "demo",
      source: { text: "x" },
      roles: ["r"],
      command: "demo",
      intent: "x",
      libraryDir: mkdtempSync(join(tmpdir(), "spex-compile-")),
      env: {},
      spawner: testSpawner("v20.11.0"),
    }),
    /Node >= 23\.6/,
  );
});

test("configured SPEX_SLC wins toolchain resolution", async () => {
  const status = await checkToolchain(
    { SPEX_SLC: "/opt/slc/bin/slc" },
    testSpawner(),
  );
  assert.equal(status.slc.ok, true);
  assert.deepEqual(status.slc.command, ["/opt/slc/bin/slc"]);
});

test("deriveStateIds requires initial and final states", () => {
  assert.throws(
    () => deriveStateIds({ config: { states: { a: {} } } }),
    /no initial state/,
  );
  assert.throws(
    () => deriveStateIds({ config: { initial: "a", states: { a: {} } } }),
    /no final state/,
  );
});

// --- Toolchain resolution (playbook-library-11, -18, -79, -82; DR-081) ------

/** The preload the Electron command carries, beside compile.js. */
const ELECTRON_PRELOAD = new URL("./compile-preload.js", import.meta.url).href;

/** The engine the app runs, as a fake compiler's nested engine declares it. */
const APP_ENGINE = { runtimeAbi: RUNTIME_ABI, artifactSchemas: [...ARTIFACT_SCHEMAS] };

/** A node_modules directory holding a fake `@sublang/slc`, bin and all,
 * with its own nested playbook engine — the app's by default, another
 * on request, or none at all. */
function fakeCompilerTree(
  engine: { runtimeAbi: number; artifactSchemas: number[] } | null = APP_ENGINE,
): { modulePath: string; cli: string } {
  const modulePath = mkdtempSync(join(tmpdir(), "spex-modules-"));
  const packageDir = join(modulePath, "@sublang", "slc");
  mkdirSync(join(packageDir, "dist"), { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({ name: "@sublang/slc", bin: { slc: "dist/cli.js" } }),
  );
  const cli = join(packageDir, "dist", "cli.js");
  writeFileSync(cli, "");
  if (engine) {
    const nested = join(packageDir, "node_modules", "@sublang", "playbook");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(nested, "package.json"),
      JSON.stringify({
        name: "@sublang/playbook",
        exports: { "./xstate-runtime": { default: "./xstate-runtime.mjs" } },
      }),
    );
    writeFileSync(
      join(nested, "xstate-runtime.mjs"),
      `export const RUNTIME_ABI = ${engine.runtimeAbi};\nexport const SUPPORTED_ARTIFACT_SCHEMAS = ${JSON.stringify(engine.artifactSchemas)};\n`,
    );
  }
  return { modulePath, cli };
}

/** A probe answering each command with its own version, absent
 * commands failing as a missing executable does; every probe and the
 * environment it ran with are recorded. */
function versionSpawner(
  versions: Record<string, string>,
  probes: { command: string; env?: NodeJS.ProcessEnv }[] = [],
): LineSpawner {
  return async (command, args, _cwd, onLine, _signal, env) => {
    assert.deepEqual(args, ["--version"], "only Node is probed");
    probes.push({ command, ...(env ? { env } : {}) });
    const version = versions[command];
    if (!version) throw new Error(`${command}: not found`);
    onLine(version);
    return 0;
  };
}

test("the desktop runs the supplied compiler on its Electron as Node (playbook-library-82)", async () => {
  const { modulePath, cli } = fakeCompilerTree();
  const probes: { command: string; env?: NodeJS.ProcessEnv }[] = [];
  const status = await checkToolchain(
    { HOME: "/home/reader" },
    versionSpawner({ "/apps/Spex/Electron": "v24.18.1" }, probes),
    { execPath: "/apps/Spex/Electron", electron: true, modulePaths: [modulePath] },
  );
  assert.equal(status.node.ok, true);
  assert.equal(status.node.version, "v24.18.1");
  assert.equal(status.node.command, "/apps/Spex/Electron");
  assert.deepEqual(status.node.env, { ELECTRON_RUN_AS_NODE: "1" });
  // The probe ran the binary as Node in the caller's environment.
  assert.deepEqual(probes, [
    { command: "/apps/Spex/Electron", env: { HOME: "/home/reader", ELECTRON_RUN_AS_NODE: "1" } },
  ]);
  // The compiler runs behind the preload that drops the variable, which
  // travels with this command alone.
  assert.deepEqual(status.slc, {
    ok: true,
    command: ["/apps/Spex/Electron", "--import", ELECTRON_PRELOAD, cli],
    env: { ELECTRON_RUN_AS_NODE: "1" },
  });
});

test("an own runtime below the floor yields to a PATH node that meets it (playbook-library-82)", async () => {
  const { modulePath, cli } = fakeCompilerTree();
  const probes: { command: string; env?: NodeJS.ProcessEnv }[] = [];
  const status = await checkToolchain(
    {},
    versionSpawner({ "/usr/local/bin/node": "v22.19.0", node: "v24.1.0" }, probes),
    { execPath: "/usr/local/bin/node", electron: false, modulePaths: [modulePath] },
  );
  assert.deepEqual(
    probes.map(({ command }) => command),
    ["/usr/local/bin/node", "node"],
  );
  assert.equal(status.node.ok, true);
  assert.equal(status.node.command, "node");
  assert.equal(status.node.env, undefined);
  assert.deepEqual(status.slc.command, ["node", cli]);
});

test("a configured SPEX_NODE is the only Node probed (playbook-library-82)", async () => {
  const { modulePath, cli } = fakeCompilerTree();
  const probes: { command: string; env?: NodeJS.ProcessEnv }[] = [];
  const status = await checkToolchain(
    { SPEX_NODE: "/opt/node/bin/node" },
    versionSpawner({ "/opt/node/bin/node": "v24.0.0", "/apps/Spex/Electron": "v24.18.1" }, probes),
    { execPath: "/apps/Spex/Electron", electron: true, modulePaths: [modulePath] },
  );
  assert.deepEqual(probes, [{ command: "/opt/node/bin/node" }]);
  assert.deepEqual(status.slc.command, ["/opt/node/bin/node", cli]);
});

test("no Node at the floor names the version found and starts nothing (playbook-library-18)", async () => {
  const { modulePath } = fakeCompilerTree();
  const probes: { command: string; env?: NodeJS.ProcessEnv }[] = [];
  const spawner = versionSpawner({ "/usr/local/bin/node": "v22.19.0" }, probes);
  const status = await checkToolchain({}, spawner, {
    execPath: "/usr/local/bin/node",
    electron: false,
    modulePaths: [modulePath],
  });
  assert.equal(status.node.ok, false);
  assert.match(status.node.guidance ?? "", /Node >= 23\.6 .*found v22\.19\.0/);
  assert.equal(status.slc.ok, false);
  assert.match(status.slc.guidance ?? "", /Install Node >= 23\.6 first/);
  await assert.rejects(
    compilePlaybook({
      playbookId: "demo",
      source: { text: "x" },
      roles: ["r"],
      command: "demo",
      intent: "x",
      libraryDir: mkdtempSync(join(tmpdir(), "spex-compile-")),
      env: {},
      spawner,
      runtime: { execPath: "/usr/local/bin/node", electron: false, modulePaths: [modulePath] },
    }),
    /Node >= 23\.6 .*found v22\.19\.0/,
  );
});

test("a tree without the supplied compiler is unavailable with restore guidance (playbook-library-18)", async () => {
  const empty = mkdtempSync(join(tmpdir(), "spex-modules-"));
  const probes: { command: string; env?: NodeJS.ProcessEnv }[] = [];
  const spawner = versionSpawner({ "/usr/local/bin/node": "v24.1.0" }, probes);
  const status = await checkToolchain({}, spawner, {
    execPath: "/usr/local/bin/node",
    electron: false,
    modulePaths: [empty],
  });
  assert.equal(status.node.ok, true);
  assert.equal(status.slc.ok, false);
  assert.deepEqual(status.slc.command, []);
  assert.match(status.slc.guidance ?? "", /@sublang\/slc is missing; run npm ci/);
  const before = probes.length;
  await assert.rejects(
    compilePlaybook({
      playbookId: "demo",
      source: { text: "x" },
      roles: ["r"],
      command: "demo",
      intent: "x",
      libraryDir: mkdtempSync(join(tmpdir(), "spex-compile-")),
      env: {},
      spawner,
      runtime: { execPath: "/usr/local/bin/node", electron: false, modulePaths: [empty] },
    }),
    /run npm ci/,
  );
  // Only Node was probed again; no compiler ran.
  assert.equal(probes.length, before + 1);
});

test("a compiler whose engine the app cannot run is unavailable with update guidance (playbook-library-18)", async () => {
  const probes: { command: string; env?: NodeJS.ProcessEnv }[] = [];
  const spawner = versionSpawner({ "/usr/local/bin/node": "v24.1.0" }, probes);
  const runtime = { execPath: "/usr/local/bin/node", electron: false };
  // A nested engine on another ABI, and one on the same ABI: only the
  // latter compiles.
  const other = fakeCompilerTree({ runtimeAbi: 2, artifactSchemas: [4] });
  const refused = await checkToolchain({}, spawner, { ...runtime, modulePaths: [other.modulePath] });
  assert.equal(refused.node.ok, true);
  assert.equal(refused.slc.ok, false);
  assert.match(
    refused.slc.guidance ?? "",
    new RegExp(
      `compiler targets playbook engine ABI 2, schemas 4 while the app runs ABI ${RUNTIME_ABI}, schemas ${ARTIFACT_SCHEMAS.join("/")}`,
    ),
  );
  const none = fakeCompilerTree(null);
  const unreadable = await checkToolchain({}, spawner, { ...runtime, modulePaths: [none.modulePath] });
  assert.equal(unreadable.slc.ok, false);
  assert.match(unreadable.slc.guidance ?? "", /compiler targets playbook engine unreadable while the app runs/);
  const same = fakeCompilerTree();
  const accepted = await checkToolchain({}, spawner, { ...runtime, modulePaths: [same.modulePath] });
  assert.deepEqual(accepted.slc, { ok: true, command: ["/usr/local/bin/node", same.cli] });
  const before = probes.length;
  await assert.rejects(
    compilePlaybook({
      playbookId: "demo",
      source: { text: "x" },
      roles: ["r"],
      command: "demo",
      intent: "x",
      libraryDir: mkdtempSync(join(tmpdir(), "spex-compile-")),
      env: {},
      spawner,
      runtime: { ...runtime, modulePaths: [other.modulePath] },
    }),
    /update @sublang\/slc and @sublang\/playbook together/,
  );
  assert.equal(probes.length, before + 1);
});

test("the checkout's own compiler loads the app's agent SDK (playbook-library-79)", async () => {
  // A fresh machine's global or npx compiler fails exactly here: its
  // nested cligent cannot find the agent SDK, an optional peer nothing
  // installed. The checkout's compiler resolves the SDKs the app
  // shells declare (DR-024, DR-081).
  const supplied = suppliedCompiler();
  assert.ok(supplied, "the checkout supplies @sublang/slc");
  const { cli } = supplied;
  assert.ok(
    cli.includes(join("node_modules", "@sublang", "slc")),
    `the app's copy: ${cli}`,
  );
  // A probe answering a modern Node keeps the assertion on every lane.
  const status = await checkToolchain({}, testSpawner("v24.1.0"));
  assert.deepEqual(status.slc, { ok: true, command: [process.execPath, cli] });
  const loaded = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const adapter = await import("@sublang/cligent/adapters/claude-code"); await adapter.loadClaudeAgentSdk(); console.log("claude sdk loaded");',
    ],
    { cwd: dirname(cli), encoding: "utf8" },
  );
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /claude sdk loaded/);
});

test("a compile on Electron spawns the copy behind the preload with the variable; a configured compiler runs without it (playbook-library-82)", async () => {
  const { modulePath, cli } = fakeCompilerTree();
  const calls: SlcCall[] = [];
  const recorder: LineSpawner = async (command, args, _cwd, onLine, _signal, env) => {
    if (args[0] === "--version") {
      onLine("v24.18.1");
      return 0;
    }
    calls.push({ argv: [command, ...args], ...(env ? { env } : {}) });
    return 0;
  };
  const libraryDir = mkdtempSync(join(tmpdir(), "spex-compile-"));
  const electron = { execPath: "/apps/Spex/Electron", electron: true, modulePaths: [modulePath] };
  // The recorder runs nothing, so no artifact appears: the run stops
  // right after the spawn it recorded.
  await assert.rejects(
    compilePlaybook({
      playbookId: "demo",
      source: { text: "# Demo\n" },
      roles: ["Helper"],
      command: "demo",
      intent: "demo",
      libraryDir,
      env: { HOME: "/home/reader" },
      spawner: recorder,
      runtime: electron,
    }),
    /expected artifacts missing/,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].argv, [
    "/apps/Spex/Electron",
    "--import",
    ELECTRON_PRELOAD,
    cli,
    "playbook",
    join(libraryDir, "demo", "demo.md"),
  ]);
  assert.equal(calls[0].env?.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(calls[0].env?.HOME, "/home/reader");
  assert.equal(calls[0].env?.SLC_STALL_TIMEOUT, "2400");

  await assert.rejects(
    compilePlaybook({
      playbookId: "named",
      source: { text: "# Named\n" },
      roles: ["Helper"],
      command: "named",
      intent: "named",
      libraryDir,
      env: { HOME: "/home/reader", SPEX_SLC: "/usr/local/bin/slc" },
      spawner: recorder,
      runtime: electron,
    }),
    /expected artifacts missing/,
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].argv, ["/usr/local/bin/slc", "playbook", join(libraryDir, "named", "named.md")]);
  assert.equal(calls[1].env?.ELECTRON_RUN_AS_NODE, undefined);
});

// --- The compile's agent (playbook-library-42, -81; DR-081) ----------------

test("the compile's agent reaches slc unless the environment configures it (playbook-library-81)", async () => {
  const captain = { adapter: "claude", model: "claude-opus-5", effort: "high", fastMode: false };
  assert.deepEqual(compilerAgentEnv({}, captain), {
    SLC_AGENT: "claude-code",
    SLC_MODEL: "claude-opus-5",
    SLC_EFFORT: "high",
    SLC_FAST_MODE: "false",
  });
  assert.deepEqual(compilerAgentEnv({}, { adapter: "codex" }), { SLC_AGENT: "codex" });
  assert.deepEqual(compilerAgentEnv({}, { adapter: "codex", fastMode: true }), {
    SLC_AGENT: "codex",
    SLC_FAST_MODE: "true",
  });
  // An environment that configures slc at all is left alone.
  assert.deepEqual(compilerAgentEnv({ SLC_AGENT: "gemini" }, captain), {});
  assert.deepEqual(compilerAgentEnv({ SLC_MODEL: "gpt-5" }, captain), {});
  assert.deepEqual(compilerAgentEnv({ SLC_EFFORT: "low" }, captain), {});
  assert.deepEqual(compilerAgentEnv({ SLC_FAST_MODE: "true" }, captain), {});
  // An adapter slc does not drive leaves slc's own configuration to choose.
  assert.deepEqual(compilerAgentEnv({}, { adapter: "kimi", model: "k2" }), {});
  assert.deepEqual(compilerAgentEnv({}, undefined), {});

  const dir = mkdtempSync(join(tmpdir(), "spex-compile-"));
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, STUB_SLC);
  const stub = `${process.execPath} ${stubPath}`;
  const lines: string[] = [];
  const compileWith = async (
    id: string,
    env: NodeJS.ProcessEnv,
    agent: Parameters<typeof compilePlaybook>[0]["agent"],
  ): Promise<NodeJS.ProcessEnv> => {
    const slcCalls: SlcCall[] = [];
    lines.length = 0;
    await compilePlaybook({
      playbookId: id,
      source: { text: "# Demo\n" },
      roles: ["Helper"],
      command: id,
      intent: id,
      libraryDir: join(dir, "library"),
      env: { SPEX_SLC: stub, ...env },
      agent,
      spawner: testSpawner("v24.1.0", slcCalls),
      onProgress: (line) => lines.push(line),
    });
    assert.equal(slcCalls.length, 1);
    return slcCalls[0].env ?? {};
  };
  const pick = (env: NodeJS.ProcessEnv) => ({
    SLC_AGENT: env.SLC_AGENT,
    SLC_MODEL: env.SLC_MODEL,
    SLC_EFFORT: env.SLC_EFFORT,
    SLC_FAST_MODE: env.SLC_FAST_MODE,
    SLC_STALL_TIMEOUT: env.SLC_STALL_TIMEOUT,
  });
  // The block reaches the compiler: codex at medium, nothing else, the
  // log naming the agent and its source ahead of the compiler.
  assert.deepEqual(pick(await compileWith("codex", {}, { adapter: "codex", effort: "medium" })), {
    SLC_AGENT: "codex",
    SLC_MODEL: undefined,
    SLC_EFFORT: "medium",
    SLC_FAST_MODE: undefined,
    SLC_STALL_TIMEOUT: "2400",
  });
  assert.ok(
    lines.indexOf("agent: codex from the block") < lines.findIndex((line) => line.startsWith("running:")),
    lines.join("\n"),
  );
  // An environment naming an agent configures slc itself: the block stays out.
  assert.deepEqual(
    pick(await compileWith("preset", { SLC_AGENT: "gemini" }, { adapter: "codex", effort: "medium" })),
    {
      SLC_AGENT: "gemini",
      SLC_MODEL: undefined,
      SLC_EFFORT: undefined,
      SLC_FAST_MODE: undefined,
      SLC_STALL_TIMEOUT: "2400",
    },
  );
  assert.ok(lines.includes("agent: gemini from the environment"), lines.join("\n"));
  // An adapter slc does not drive is refused before the compiler runs.
  const refusedCalls: SlcCall[] = [];
  const refusedLines: string[] = [];
  await assert.rejects(
    compilePlaybook({
      playbookId: "kimi",
      source: { text: "# Demo\n" },
      roles: ["Helper"],
      command: "kimi",
      intent: "kimi",
      libraryDir: join(dir, "library"),
      env: { SPEX_SLC: stub },
      agent: { adapter: "kimi", model: "k2" },
      spawner: testSpawner("v24.1.0", refusedCalls),
      onProgress: (line) => refusedLines.push(line),
    }),
    /runs on kimi, which the compiler cannot drive; choose an agent on claude, codex, gemini or opencode, or set SLC_AGENT/,
  );
  assert.equal(refusedCalls.length, 0, "no compiler ran");
  assert.ok(!refusedLines.some((line) => line.startsWith("running:")));
  // Fast mode travels as its literal.
  assert.deepEqual(
    pick(await compileWith("fast", {}, { adapter: "claude", model: "claude-opus-5", fastMode: true })),
    {
      SLC_AGENT: "claude-code",
      SLC_MODEL: "claude-opus-5",
      SLC_EFFORT: undefined,
      SLC_FAST_MODE: "true",
      SLC_STALL_TIMEOUT: "2400",
    },
  );
});
