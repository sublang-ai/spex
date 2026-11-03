// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { compilePlaybook, defaultSpawner, type LineSpawner } from "./compile.js";
import { LINKED_ID, writeLinkedFixture } from "./testing/linked-artifact.js";
import { scratchDir } from "./testing/scratch.js";
import { stubSlcScriptedSource } from "./testing/stub-slc.js";

const slc = dirname(createRequire(import.meta.url).resolve("@sublang/slc"));
const strictCheck = pathToFileURL(join(slc, "verify-typescript.js")).href;
const nativeLoad = pathToFileURL(join(slc, "verify.js")).href;

test("generated ESM scope isolates real SLC loading and registry packaging from project module settings (playbook-library-126)", async (t) => {
  for (const scope of ["absent", "inherited-commonjs", "commonjs", "module"]) {
    await t.test(scope, async () => {
      const parent = scratchDir("spex-module-scope-");
      const project = join(parent, "用户项目 with spaces");
      mkdirSync(project);
      const projectManifest = join(project, "package.json");
      const ancestorManifest = join(parent, "package.json");
      if (scope === "inherited-commonjs") writeFileSync(ancestorManifest, '{ "type": "commonjs", "private": true }\n');
      if (scope === "commonjs" || scope === "module") writeFileSync(projectManifest, JSON.stringify({ type: scope, custom: "keep" }));
      const original = [ancestorManifest, projectManifest].map(file => existsSync(file) ? readFileSync(file) : null);
      const fixture = writeLinkedFixture(join(parent, "fixture"));
      const stub = join(parent, "slc.cjs");
      writeFileSync(stub, stubSlcScriptedSource(["ok"], "['coder', 'reviewer']", { fixtureDir: fixture }));
      const folder = join(project, "library", LINKED_ID);
      const generated = join(folder, `${LINKED_ID}.playbook`);
      const manifest = join(generated, "package.json");
      const probe = join(parent, "probe.mjs");
      writeFileSync(probe, `
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { checkFsmTypeScript } from ${JSON.stringify(strictCheck)};
import { loadFsmModule } from ${JSON.stringify(nativeLoad)};
const fsm = ${JSON.stringify(join(generated, `${LINKED_ID}.fsm.ts`))};
assert.deepEqual(await checkFsmTypeScript(fsm), []);
assert.ok(Object.keys(await loadFsmModule(fsm)).length);
assert.equal(typeof (await import(pathToFileURL(${JSON.stringify(join(generated, `${LINKED_ID}.playbook.ts`))}))).default, "function");
const invalid = ${JSON.stringify(join(generated, "invalid.fsm.ts"))};
writeFileSync(invalid, 'import { setup } from "xstate"; export default setup({ types: { context: {} as { result: string } } }).createMachine({ context: { result: 42 }, initial: "done", states: { done: { type: "final" } } });');
assert.ok((await checkFsmTypeScript(invalid)).some(line => line.includes("TS2322")));
console.log("real SLC strict checks, native FSM and linked runtime imports passed");
`);
      let compilerCalls = 0;
      const spawner: LineSpawner = async (command, args, cwd, onLine, signal, env) => {
        // The generation stub advertises a supported compiler runtime,
        // as in compile.test.ts; checking/loading below still uses real Node.
        if (args[0] === "--version") { onLine("v24.1.0"); return 0; }
        compilerCalls++;
        assert.equal(JSON.parse(readFileSync(manifest, "utf8")).type, "module", "boundary exists before compiler starts");
        const output: string[] = [];
        const code = await defaultSpawner(command, args, cwd, line => { output.push(line); onLine(line); }, signal, env);
        assert.equal(code, 0);
        assert(existsSync(join(generated, `${LINKED_ID}.fsm.ts`)), JSON.stringify({ command, args, cwd, generated, output }, null, 2));
        // Only generation is stubbed; use SLC's real checker and native
        // loader in a fresh Node so cached package scopes cannot hide bugs.
        const checked = spawnSync(process.execPath, [probe], { cwd: project, encoding: "utf8", timeout: 60_000 });
        assert.equal(checked.status, 0, checked.stderr + checked.stdout);
        return code;
      };
      const options = {
        playbookId: LINKED_ID, source: { text: readFileSync(join(fixture, `${LINKED_ID}.md`), "utf8") },
        roles: ["coder", "reviewer"], command: LINKED_ID, intent: "Review", libraryDir: join(project, "library"),
        env: {
          ...process.env,
          SPEX_SLC: `${process.execPath} ${stub}`,
          // The configured compiler is a Node script, also when this
          // integration test is driven by the signed Electron runtime.
          ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
        }, spawner,
      };
      const compiled = await compilePlaybook(options);
      assert.equal((await import(pathToFileURL(compiled.from).href)).default.id, LINKED_ID);
      assert.deepEqual(JSON.parse(readFileSync(manifest, "utf8")), { type: "module" });
      rmSync(manifest);
      await compilePlaybook({ ...options, source: {} });
      assert.equal(JSON.parse(readFileSync(manifest, "utf8")).type, "module", "old draft recompiles without editing its existing source");
      const compatible = '{\n  "private": true, "type": "module", "custom": { "keep": 1 }\n}\n';
      writeFileSync(manifest, compatible);
      await compilePlaybook(options);
      assert.equal(readFileSync(manifest, "utf8"), compatible, "compatible manifest bytes preserved on draft recompile");
      rmSync(manifest);
      const packaged = await compilePlaybook({ ...options, source: {}, skipSlc: true });
      assert.equal((await import(pathToFileURL(packaged.from).href)).default.id, LINKED_ID);
      assert.equal(JSON.parse(readFileSync(manifest, "utf8")).type, "module", "old draft repackaging repairs absent boundary");
      assert.equal(compilerCalls, 3, "repackaging runs no compiler");
      for (const [index, file] of [ancestorManifest, projectManifest].entries()) {
        assert.deepEqual(existsSync(file) ? readFileSync(file) : null, original[index], "project/ancestor configuration untouched");
      }
    });
  }
});

test("conflicting or abnormal generated boundaries refuse compilation without overwriting files (playbook-library-126)", async (t) => {
  for (const kind of ["commonjs", "missing-type", "invalid-json", "null", "directory", "symlink", "dangling-symlink", "linked-directory"]) {
    await t.test(kind, async (caseTest) => {
      const project = scratchDir("spex-module-conflict-");
      const folder = join(project, "library", "demo");
      const generated = join(folder, "demo.playbook");
      mkdirSync(folder, { recursive: true });
      const outside = join(project, "outside");
      mkdirSync(outside);
      writeFileSync(join(outside, "package.json"), '{ "type": "module", "keep": true }');
      if (kind === "linked-directory") symlinkSync(outside, generated, process.platform === "win32" ? "junction" : "dir");
      else mkdirSync(generated);
      const manifest = join(generated, "package.json");
      const bytes = kind === "commonjs" ? '{ "type": "commonjs" }' : kind === "missing-type" ? '{}' : kind === "null" ? 'null' : '{broken';
      if (kind === "directory") mkdirSync(manifest);
      else if (kind === "symlink" || kind === "dangling-symlink") {
        // Windows file symlinks require Developer Mode or elevation; the
        // directory junction case is still exercised on ordinary Windows.
        try { symlinkSync(join(outside, kind === "symlink" ? "package.json" : "absent.json"), manifest, "file"); }
        catch (error) { if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") { caseTest.skip("file symlink privilege unavailable"); return; } throw error; }
      } else if (kind !== "linked-directory") writeFileSync(manifest, bytes);
      const before = readFileSync(join(outside, "package.json"));
      let compilerCalled = false;
      for (const skipSlc of [false, true]) {
        await assert.rejects(compilePlaybook({
          playbookId: "demo", source: { text: "source" }, roles: [], command: "demo", intent: "Demo",
          libraryDir: join(project, "library"), skipSlc,
          env: { SPEX_SLC: process.execPath },
          spawner: async (_command, args, _cwd, onLine) => {
            if (args[0] === "--version") { onLine(process.version); return 0; }
            compilerCalled = true;
            return 0;
          },
        }), /package\.json|unsafe destination parent/);
      }
      assert.equal(compilerCalled, false);
      assert.equal(existsSync(join(folder, "demo.md")), false, "refusal precedes source write");
      assert.deepEqual(readFileSync(join(outside, "package.json")), before);
      if (["commonjs", "missing-type", "invalid-json", "null"].includes(kind)) assert.equal(readFileSync(manifest, "utf8"), bytes);
      if (kind.includes("symlink")) assert.ok(lstatSync(manifest).isSymbolicLink());
      if (kind === "directory") assert.ok(lstatSync(manifest).isDirectory());
    });
  }
});
