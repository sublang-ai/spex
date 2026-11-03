// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A packaging gate, on the packaged Electron and physical dependency tree.
// Uses the same strict checker slc's gears2fsm/completion calls, not a second
// TypeScript configuration. No model, network or global Node is involved.
const { execFile } = require("node:child_process");
const { mkdtemp, writeFile, symlink, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, dirname } = require("node:path");
const { promisify } = require("node:util");

module.exports = async function afterPack(context) {
  const product = context.packager.appInfo.productFilename;
  const executableName = context.packager.executableName ?? product;
  const mac = context.electronPlatformName === "darwin";
  const app = mac ? join(context.appOutDir, `${product}.app`, "Contents") : context.appOutDir;
  const executable = mac ? join(app, "MacOS", product)
    : join(app, executableName + (context.electronPlatformName === "win32" ? ".exe" : ""));
  const modules = join(app, mac ? "Resources" : "resources", "app.asar.unpacked", "node_modules");
  const scratch = await mkdtemp(join(tmpdir(), "spex-packaged-compiler-"));
  try {
    await symlink(modules, join(scratch, "node_modules"), "junction");
    const source = `import { setup } from "xstate";
export default setup({ types: { context: {} as { result: string } } }).createMachine({
  id: "packaged-compiler", context: { result: Buffer.from(process.cwd()).toString() },
  initial: "done", states: { done: { type: "final" } }
});
`;
    await writeFile(join(scratch, "valid.fsm.ts"), source);
    await writeFile(join(scratch, "invalid.fsm.ts"), source.replace("Buffer.from(process.cwd()).toString()", "42"));
    await writeFile(join(scratch, "probe.mjs"), `
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const modules = fs.realpathSync(process.argv[2]);
const within = file => {
  const rel = relative(modules, fs.realpathSync(file));
  assert(!rel.startsWith("..") && !isAbsolute(rel), "escaped packaged modules: " + file);
};
const installed = createRequire(join(modules, "package.json"));
const slc = installed.resolve("@sublang/slc");
const fromSlc = createRequire(slc);
const tsPath = fromSlc.resolve("typescript");
const ts = fromSlc("typescript");
const nodeTypes = fromSlc.resolve("@types/node/package.json");
const dependencies = {};
for (const name of Object.keys(fromSlc(nodeTypes).dependencies ?? {})) {
  const manifest = createRequire(nodeTypes).resolve(name + "/package.json");
  const types = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const declaration = resolve(dirname(manifest), types.types ?? types.typings);
  within(declaration);
  dependencies[name] = declaration;
}
for (const file of [slc, tsPath, nodeTypes, installed.resolve("xstate")]) within(file);
const declarations = new Set();
const read = ts.sys.readFile;
ts.sys.readFile = (file, ...args) => {
  if (/\\.d\\.(?:ts|mts|cts)$/.test(file) && fs.existsSync(file)) declarations.add(fs.realpathSync(file));
  return read(file, ...args);
};
const { checkFsmTypeScript } = await import(pathToFileURL(join(dirname(slc), "verify-typescript.js")));
const valid = await checkFsmTypeScript(join(process.cwd(), "valid.fsm.ts"));
assert.deepEqual(valid, [], "valid machine failed: " + valid.join("\\n"));
const invalid = await checkFsmTypeScript(join(process.cwd(), "invalid.fsm.ts"));
assert(invalid.some(line => line.includes("TS2322")), "bad context type was accepted: " + invalid.join("\\n"));
for (const file of declarations) within(file);
for (const required of ["typescript/lib/lib.es2022.d.ts", "xstate/", "@types/node/"]) {
  assert([...declarations].some(file => file.replaceAll("\\\\", "/").includes(required)), "missing loaded declarations: " + required);
}
// Exercise the same archived core module the desktop loads: a physical
// import alone would miss esbuild trying to spawn inside app.asar.
const archivedCore = join(dirname(installed.resolve("@sublang/spex-core")), "compile.js")
  .replace("app.asar.unpacked", "app.asar");
const { bundleRegistryModule, provisionEngineLinks } = await import(pathToFileURL(archivedCore));
const artifact = join(process.cwd(), "installed playbook");
fs.mkdirSync(artifact);
const engineLinks = provisionEngineLinks(artifact);
assert.equal(engineLinks.length, 2, "default lookup did not provision both engines");
const engineTargets = engineLinks.map(file => fs.realpathSync(file));
for (const file of engineTargets) within(file);
fs.copyFileSync(join(process.cwd(), "valid.fsm.ts"), join(artifact, "valid.fsm.ts"));
const bundled = await bundleRegistryModule(join(artifact, "valid.fsm.ts"));
assert(Buffer.isBuffer(bundled) && bundled.length > 0, "packaged bundler produced no bytes");
const linked = join(artifact, "registry.mjs");
fs.writeFileSync(linked, bundled);
assert.equal((await import(pathToFileURL(linked))).default.config.id, "packaged-compiler");
console.log(JSON.stringify({ status: "passed", node: process.versions.node, arch: process.arch,
  slc, typescript: tsPath, nodeTypes, declarationDependencies: dependencies,
  strictValid: valid, strictInvalid: invalid, loadedDeclarations: [...declarations].sort(),
  archivedCoreBundler: { passed: true, bytes: bundled.length, module: archivedCore },
  defaultEngineLinks: { targets: engineTargets, registryImported: true } }));
`);
    const { NODE_PATH: _path, NODE_OPTIONS: _options, ESBUILD_BINARY_PATH: _esbuild, ...env } = process.env;
    const { stdout, stderr } = await promisify(execFile)(executable, [join(scratch, "probe.mjs"), modules], {
      cwd: scratch, env: { ...env, PATH: dirname(executable), ELECTRON_RUN_AS_NODE: "1" },
      timeout: 60_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
    const proof = JSON.parse(stdout.trim());
    if (proof.status !== "passed") throw new Error("Packaged compiler gate failed");
    const report = join(dirname(context.appOutDir), `compiler-check-${context.electronPlatformName}-${proof.arch}.json`);
    await writeFile(report, JSON.stringify({ ...proof, stderr }, null, 2) + "\n");
    console.log(`Packaged compiler: valid accepted, invalid refused; ${proof.loadedDeclarations.length} bundled declarations (${report})`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
