// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// PBLIB coverage: the compile pipeline with a stubbed slc that emits
// fixture artifacts, exercised through esbuild packaging to a
// runnable registry; toolchain guidance when prerequisites are
// missing (PBLIB-17/18/19).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  checkToolchain,
  compilePlaybook,
  defaultSpawner,
  deriveStateIds,
  type LineSpawner,
} from "./compile.js";
import type { RegistryEntryLike } from "./config.js";
import { ARTIFACT_SCHEMAS } from "./config.js";

const STUB_SLC = stubSlcSource();

function stubSlcSource(rolesLiteral = "['Helper']"): string {
  return `
const fs = require("node:fs");
const path = require("node:path");
const src = process.argv[3];
const base = path.basename(src, ".md");
const dir = path.join(path.dirname(src), base + ".playbook");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, base + ".fsm.ts"),
  [
    'import { setup } from "xstate";',
    "export const demoMachine = setup({}).createMachine({",
    '  id: "demo",',
    '  initial: "ready",',
    "  states: {",
    "    ready: {},",
    "    working: {},",
    "    awaitBossReply: {},",
    "    failed: {},",
    '    done: { type: "final" },',
    "  },",
    "});",
  ].join("\\n"),
);
fs.writeFileSync(
  path.join(dir, base + ".playbook.ts"),
  [
    "export default function createDemoRuntime(options: unknown) {",
    "  return {",
    "    options,",
    "    async init(session: any) { this.session = session; },",
    "    async handleBossInput() {},",
    "    async dispose() {},",
    "  } as Record<string, unknown>;",
    "}",
  ].join("\\n"),
);
// The slc entry module: emitted beside the artifact dir, role ids
// verbatim from the gears (capitalized here on purpose, which schema 2
// preserves), an options allowlist with cwd, and the schema the shared
// runtime factory checks.
fs.writeFileSync(
  path.join(path.dirname(src), base + ".ts"),
  [
    "import createPlaybookRuntime from './" + base + ".playbook/" + base + ".playbook.ts';",
    "const REQUIRED_ROLE_IDS = ${rolesLiteral};",
    "const entry = {",
    "  id: '" + base + "',",
    "  command: '" + base + "',",
    "  intent: 'Stub Demo - a one-player workflow.',",
    "  artifactSchema: ${ARTIFACT_SCHEMAS[0]},",
    "  requiredRoleIds: [...REQUIRED_ROLE_IDS],",
    "  validateOptions(value) {",
    "    if (value === undefined) return {};",
    "    if (typeof value !== 'object' || value === null || Array.isArray(value)) {",
    "      throw new Error('playbook options must be an object');",
    "    }",
    "    for (const key of Object.keys(value)) {",
    "      if (key !== 'cwd') throw new Error('unknown option \\"' + key + '\\"');",
    "    }",
    "    return value;",
    "  },",
    "  createRuntime(options) {",
    "    const validated = entry.validateOptions(options.captainOptions);",
    "    return createPlaybookRuntime({ ...validated });",
    "  },",
    "};",
    "export default entry;",
  ].join("\\n"),
);
console.log("stub slc: compiled " + base);
`;
}

/** Spawner that fakes a modern node for --version and otherwise
 * delegates to the real spawner (which runs the stub slc). Records
 * each slc invocation's argv when given a sink. */
function testSpawner(
  nodeVersion = "v24.1.0",
  slcCalls?: string[][],
): LineSpawner {
  return async (command, args, cwd, onLine) => {
    if (args[0] === "--version") {
      onLine(nodeVersion);
      return 0;
    }
    slcCalls?.push([command, ...args]);
    return defaultSpawner(command, args, cwd, onLine);
  };
}

test("compile pipeline: stub slc to a runnable bundled registry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-compile-"));
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, STUB_SLC);

  const progress: string[] = [];
  const slcCalls: string[][] = [];
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
  assert.deepEqual(slcCalls[0], [
    process.execPath,
    stubPath,
    "playbook",
    join(dir, "library", "demo", "demo.md"),
  ]);

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
