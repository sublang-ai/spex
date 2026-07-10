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
    "    async init() {},",
    "    async handleBossInput() {},",
    "    async dispose() {},",
    "  };",
    "}",
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
  assert.ok(progress.some((line) => line.includes("stub slc: compiled demo")));

  const moduleValue = (await import(pathToFileURL(result.from).href)) as {
    default: RegistryEntryLike;
  };
  const entry = moduleValue.default;
  assert.equal(entry.id, "demo");
  assert.equal(entry.command, "demo");
  assert.deepEqual(entry.requiredRoleIds, ["helper"]);

  // createRuntime maps role identities per the link convention.
  const runtime = entry.createRuntime({
    captainOptions: { extra: 1 },
    players: [{ id: "helper", adapter: "claude", model: "claude-test" }],
  }) as { options: Record<string, unknown> };
  assert.equal(runtime.options.helperPlayer, "claude-test");
  assert.equal(runtime.options.extra, 1);

  assert.throws(
    () => entry.validateOptions([1, 2]),
    /captain\.options\.playbooks\.demo\.options must be an object/,
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
