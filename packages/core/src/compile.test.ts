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

const STUB_SLC = `
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
// The slc 0.1.0 entry module: emitted beside the artifact dir, role
// ids verbatim from the gears (capitalized here on purpose), options
// allowlist with cwd, and the canonicalizing role bind at callPlayer.
fs.writeFileSync(
  path.join(path.dirname(src), base + ".ts"),
  [
    "import createPlaybookRuntime from './" + base + ".playbook/" + base + ".playbook.ts';",
    "const REQUIRED_ROLE_IDS = ['Helper'];",
    "const BY_LOWER = new Map(REQUIRED_ROLE_IDS.map((id) => [id.toLowerCase(), id]));",
    "function bindRoleIds(session) {",
    "  const ports = session && session.ports;",
    "  if (!ports || typeof ports.callPlayer !== 'function') return session;",
    "  return { ...session, ports: { ...ports, callPlayer: (playerId, ...rest) =>",
    "    ports.callPlayer(BY_LOWER.get(playerId) ?? playerId, ...rest) } };",
    "}",
    "const entry = {",
    "  id: '" + base + "',",
    "  command: '" + base + "',",
    "  intent: 'Stub Demo - a one-player workflow.',",
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
    "    const runtime = createPlaybookRuntime({ ...validated });",
    "    return new Proxy(runtime, { get(target, property, receiver) {",
    "      const value = Reflect.get(target, property, receiver);",
    "      if (property === 'init' && typeof value === 'function') {",
    "        return (session, ...rest) => value.call(target, bindRoleIds(session), ...rest);",
    "      }",
    "      return value;",
    "    } });",
    "  },",
    "};",
    "export default entry;",
  ].join("\\n"),
);
console.log("stub slc: compiled " + base);
`;

/** Spawner that fakes a modern node for --version and otherwise
 * delegates to the real spawner (which runs the stub slc). */
function testSpawner(nodeVersion = "v24.1.0"): LineSpawner {
  return async (command, args, cwd, onLine) => {
    if (args[0] === "--version") {
      onLine(nodeVersion);
      return 0;
    }
    return defaultSpawner(command, args, cwd, onLine);
  };
}

test("compile pipeline: stub slc to a runnable bundled registry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-compile-"));
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, STUB_SLC);

  const progress: string[] = [];
  const result = await compilePlaybook({
    playbookId: "demo",
    source: { text: "# Demo\n\nA one-player demo workflow.\n" },
    roles: ["helper"],
    command: "demo",
    intent: "demo workflow for tests",
    libraryDir: join(dir, "library"),
    env: { SPEX_SLC: `${process.execPath} ${stubPath}` },
    spawner: testSpawner(),
    onProgress: (line) => progress.push(line),
  });

  assert.equal(result.idleStateId, "ready");
  assert.equal(result.finalStateId, "done");
  assert.deepEqual(result.parkStateIds, ["failed", "awaitBossReply"]);
  // Derived from the slc-emitted entry ('Helper'), lowercased for the
  // host boundary — the user's typed roles are not the source.
  assert.deepEqual(result.roles, ["helper"]);
  assert.ok(progress.some((line) => line.includes("stub slc: compiled demo")));

  const moduleValue = (await import(pathToFileURL(result.from).href)) as {
    default: RegistryEntryLike;
    spexRegistryContract?: number;
  };
  assert.equal(moduleValue.spexRegistryContract, 2);
  const entry = moduleValue.default;
  assert.equal(entry.id, "demo");
  assert.equal(entry.command, "demo");
  assert.equal(entry.intent, "demo workflow for tests");
  assert.deepEqual(entry.requiredRoleIds, ["helper"]);

  // The wrapper hands captainOptions through the entry's own
  // validateOptions and re-cases role ids at the port seam: the
  // runtime sees the entry's canonical 'Helper', the host port gets
  // back the lowercase host role.
  const runtime = entry.createRuntime({
    captainOptions: { cwd: "/tmp/project" },
    players: [{ id: "helper", adapter: "claude", model: "claude-test" }],
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
  // The stub runtime saved the (doubly shimmed) session; a call with
  // the entry's canonical id must reach the host port lowercased.
  runtime.session?.ports.callPlayer("Helper");
  runtime.session?.ports.callPlayer("helper");
  assert.deepEqual(seenIds, ["helper", "helper"]);

  assert.throws(
    () => entry.validateOptions({ mystery: 1 }),
    /unknown option "mystery"/,
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
