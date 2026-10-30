// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDependencyClosure, resolvePackage } from "./dependency-closure.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the installed app dependency closure matches its lock and required peers", () => {
  checkDependencyClosure(root);
});

for (const shell of ["desktop", "server"]) {
  test(`${shell} compiler definitions and bundled artifact execute with the core's actual engine`, async (t) => {
    const shellEntry = join(root, "apps", shell, "dist/main.js");
    const core = resolvePackage(shellEntry, "@sublang/spex-core");
    const { moduleDirectoriesAbove, suppliedCompiler, provisionEngineLinks, bundleRegistryModule } = await import(pathToFileURL(join(core.directory, "dist/compile.js")).href);
    const modulePaths = moduleDirectoriesAbove(pathToFileURL(shellEntry).href);
    const compiler = suppliedCompiler(modulePaths);
    assert.ok(compiler, "the shell supplies its actual compiler");
    const engine = resolvePackage(core.entry, "@sublang/playbook");
    assert.equal(resolvePackage(compiler.cli, "@sublang/playbook").directory, engine.directory);
    assert.equal(resolvePackage(compiler.cli, "@sublang/playbook", "@sublang/playbook/slc/link.md").directory, engine.directory, "compiler definitions belong to the same Playbook as the engine");
    for (const name of ["@sublang/cligent", "xstate"]) {
      assert.equal(resolvePackage(compiler.cli, name).directory, resolvePackage(core.entry, name).directory, `${name} has the same identity from compiler and core`);
    }

    const directory = mkdtempSync(join(tmpdir(), `spex ${shell} artifact engine `));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const source = join(directory, "closure.registry.ts");
    writeFileSync(source, `
import * as engine from "@sublang/playbook/xstate-runtime";
import { createFailClosedHostCapabilities } from "@sublang/playbook/host-capabilities";
import { createMachine } from "xstate";
export { engine, createMachine };
const terminal: string = "complete";
const machine = createMachine({ id: "closure", initial: "ready", states: {
  ready: { tags: ["playbook.parked"], meta: { playbook: { stateId: "ready", description: "Ready." } }, on: { RUN: terminal } },
  complete: { type: "final", meta: { playbook: { stateId: terminal, description: "The engine closure ran.", terminal: "success" } } },
} });
const factory = engine.createXStatePlaybookRuntime(machine, {
  label: "closure", compat: { artifactSchema: 3, runtimeAbi: engine.RUNTIME_ABI },
  entryEvent: { type: "RUN", textField: "text" }, snapshotOptions: () => ({}),
  roleStates: {}, outcomeAuthority: { governedPlayerStates: {} },
});
export async function run(): Promise<unknown> {
  const runtime = factory({ configuredOptions: {}, hostCapabilities: createFailClosedHostCapabilities() });
  const unexpected = async () => { throw new Error("The roleless artifact must not call an agent."); };
  try {
    await runtime.init({
      sessionId: "30000000-0000-4000-8000-000000000001", rootSessionId: "30000000-0000-4000-8000-000000000001",
      playbookId: "closure", depth: 0,
      ports: { callPlayer: unexpected, callCaptain: unexpected, callJudge: unexpected, callPlaybook: unexpected,
        emitStatus: async () => {}, emitTelemetry: async () => {} },
    });
    return await runtime.handleBossInput({ text: "Run the artifact.", signal: new AbortController().signal });
  } finally {
    await runtime.dispose();
  }
}
`);
    provisionEngineLinks(directory, modulePaths);
    const output = join(directory, "closure.registry.mjs");
    writeFileSync(output, await bundleRegistryModule(source, modulePaths));
    const artifact = await import(pathToFileURL(output).href);
    const hostEngine = await import(pathToFileURL(engine.entry).href);
    const hostXstate = await import("xstate");
    assert.strictEqual(artifact.engine, hostEngine, "the emitted module imports the exact engine module loaded by the core");
    assert.strictEqual(artifact.createMachine, hostXstate.createMachine, "the emitted machine uses the app's XState instance");
    assert.equal(resolvePackage(output, "@sublang/playbook").directory, engine.directory);
    assert.equal(resolvePackage(output, "xstate").directory, resolvePackage(core.entry, "xstate").directory);
    const result = await artifact.run();
    assert.equal(result.outcome, "terminal", "the bundled TypeScript artifact executes through the actual Playbook factory");
    assert.equal(result.state.status, "done");
    assert.deepEqual(result.terminal, { stateId: "complete", kind: "success", description: "The engine closure ran." });
  });
}
