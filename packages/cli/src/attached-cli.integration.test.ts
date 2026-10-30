// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PROTOCOL_VERSION } from "./generated-protocol.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CORE = resolve(ROOT, "../core");
// Repository-only fixture transport, already owned by core; never a CLI dependency.
const { WebSocketServer } = createRequire(join(CORE, "package.json"))("ws");
const SCRATCH = realpathSync(mkdtempSync(join(tmpdir(), "spex-attached-cli-")));
const PROJECT = join(SCRATCH, "project");
// A scratch home: no case here reads the reader's own.
const NO_APP_HOME = join(SCRATCH, "no-app-home");
const TOKEN = "fixture-private-access-capability";
let CLI: string;
const commands: any[] = [];
const project = { id: "private/key", name: "Fixture", path: PROJECT, repository: { key: "private/key", name: "fixture-spex", group: "own", own: true } };
const preview = { instance: { origin: "https://space.example", name: "space.example" }, name: "fixture/demo", version: "1.0.0", files: [{ path: "meta.yaml" }] };

function npm(args: string[], cwd: string): string {
  const npmPath = process.env.npm_execpath;
  const result = npmPath
    ? spawnSync(process.execPath, [npmPath, ...args], { cwd, encoding: "utf8" })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function child(args: string[], env: Record<string, string | undefined> = {}) {
  const proc = spawn(process.execPath, [CLI, ...args], { cwd: PROJECT, env: { ...process.env, SPEX_SERVER_URL: undefined, SPEX_HOME: NO_APP_HOME, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  proc.stdout.on("data", (data) => { stdout += String(data); });
  proc.stderr.on("data", (data) => { stderr += String(data); });
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    proc.on("error", reject); proc.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  return { proc, done };
}
async function fixture(handler: (message: any, socket: any) => void, hello: any = { type: "hello", protocolVersion: PROTOCOL_VERSION }) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0, verifyClient: (info: any) => new URL(info.req.url, "http://localhost").searchParams.get("token") === TOKEN });
  await once(server, "listening");
  let connections = 0;
  server.on("connection", (socket: any) => {
    connections++; socket.send(JSON.stringify(hello));
    socket.on("message", (data: Buffer) => { const message = JSON.parse(String(data)); commands.push(message); handler(message, socket); });
  });
  const url = `http://127.0.0.1:${server.address().port}/?token=${TOKEN}`;
  return { url, connections: () => connections, stop: async () => { for (const socket of server.clients) socket.terminate(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}
const reply = (socket: any, message: any, result: any) => socket.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result }));
function standard(message: any, socket: any) {
  if (message.type === "project.list") reply(socket, message, [project]);
  else if (message.type === "project.register") reply(socket, message, { ...project, path: message.path });
  else if (message.type === "environment.search") reply(socket, message, { packages: [{ name: "fixture/demo", versions: ["1.0.0"], description: "Fixture" }] });
  else if (message.type === "environment.get") reply(socket, message, { requests: { "fixture/demo": { kind: "path", path: "packages/demo" } }, packages: [{ name: "fixture/demo", version: "1.0.0", installed: true }] });
  else if (message.type === "environment.publish") reply(socket, message, message.dryRun ? { accepted: true, preview } : { completed: true, published: { ...preview, url: "https://space.example/fixture/demo/1.0.0" } });
  else reply(socket, message, { completed: true });
}

before(() => {
  mkdirSync(PROJECT); mkdirSync(NO_APP_HOME);
  // The package folder `package publish packages/demo` names.
  mkdirSync(join(PROJECT, "packages", "demo"), { recursive: true });
  writeFileSync(join(PROJECT, "packages", "demo", "meta.yaml"), "format: 2\norg: fixture\nname: demo\nversion: 1.0.0\ndescription: Fixture\nlicense: Apache-2.0\nartifacts:\n  demo:\n    kind: skill\n    language: en\n");
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", SCRATCH], ROOT))[0];
  assert(packed.files.some((f: any) => f.path === "dist/generated-protocol.js"));
  assert(!packed.files.some((f: any) => /(?:\.test\.|src\/|scripts\/)/.test(f.path)));
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  for (const forbidden of ["@sublang/spex-core", "@sublang/playbook", "@sublang/cligent", "ws"]) assert(!manifest.dependencies?.[forbidden]);
  const generated = readFileSync(join(ROOT, "dist/generated-protocol.js"), "utf8");
  assert(!/\bimport\b/.test(generated)); assert(generated.length < 1000);
  const prefix = join(SCRATCH, "prefix");
  npm(["install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", join(SCRATCH, packed.filename)], SCRATCH);
  CLI = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@sublang/spex/dist/cli.js");
});
after(() => rmSync(SCRATCH, { recursive: true, force: true }));

describe("attached packed CLI", () => {
  it("stages only unique literal canonical constants and help needs no server", async () => {
    const stage = await import(pathToFileURL(join(ROOT, "scripts/stage-protocol.mjs")).href);
    const canonical = readFileSync(join(CORE, "src/protocol.ts"), "utf8");
    assert.deepEqual(stage.protocolConstants(canonical), { PROTOCOL_VERSION });
    const valid = "export const PROTOCOL_VERSION = 28;\n";
    assert.throws(() => stage.protocolConstants(""));
    assert.throws(() => stage.protocolConstants(valid + "export const PROTOCOL_VERSION = 29;\n"));
    assert.throws(() => stage.protocolConstants(valid.replace("= 28;", "= 27 + 1;")));
    const result = await child(["--help"]).done;
    assert.equal(result.code, 0); assert.match(result.stdout, /package add.*--path/); assert.match(result.stdout, /--timeout/);
    for (const args of [["scaffold", "--agents=codex"], ["lint"]]) {
      const local = await child(args, { SPEX_SERVER_URL: "https://foreign.example/?token=must-not-connect" }).done;
      assert.equal(local.code, 0, local.stderr);
    }
  });

  it("rejects invalid options and foreign/capability URLs before connection", async () => {
    const server = await fixture(standard);
    try {
      for (const args of [
        ["package", "add", "fixture/demo"], ["package", "add", "fixture/demo", "--path", "pkg", "--version", "1.0.0"],
        ["package", "publish", "pkg", "--yes"], ["package", "status", "--dry-run"],
        ["project", "add"], ["auth", "login"], ["package", "install", "extra"],
        ["package", "status", "--timeout", "0"], ["package", "status", "--timeout", "NaN"],
        ["package", "publish", "../outside"], ["package", "status", "--project", PROJECT, "--project", PROJECT],
      ]) {
        const result = await child([...args, "--server", server.url]).done;
        assert.equal(result.code, 1, result.stderr); assert(!result.stderr.includes(TOKEN));
      }
      for (const url of [undefined, server.url.replace("127.0.0.1", "example.com"), server.url.replace("127.0.0.1", "127.1"), server.url.replace("?token=", "path?token="), server.url + "#", server.url + "&extra=1", server.url + "&token=again", server.url.replace(TOKEN, ""), server.url.replace("//127", "//user:pass@127")]) {
        const result = await child(["project", "list"], { SPEX_SERVER_URL: url }).done;
        assert.equal(result.code, 1); assert(!result.stderr.includes(TOKEN));
      }
      assert.equal(server.connections(), 0);
    } finally { await server.stop(); }
  });

  it("refuses another protocol's hello and authentication failure without sending commands", async () => {
    for (const hello of [{ type: "hello", protocolVersion: PROTOCOL_VERSION - 1 }, { type: "hello", protocolVersion: PROTOCOL_VERSION + 1 }]) {
      let sent = 0; const server = await fixture(() => { sent++; }, hello);
      try { const result = await child(["project", "list", "--server", server.url]).done; assert.equal(result.code, 1); assert.equal(sent, 0); }
      finally { await server.stop(); }
    }
    const server = await fixture(standard);
    try { const result = await child(["project", "list", "--server", server.url.replace(TOKEN, "wrong")]).done; assert.equal(result.code, 1); assert(!result.stderr.includes("wrong")); }
    finally { await server.stop(); }
  });

  it("maps project and package commands and waits for each request's terminal receipt", async () => {
    commands.length = 0; const server = await fixture(standard);
    try {
      for (const args of [
        ["project", "list"], ["project", "add", PROJECT], ["package", "search", "fixture"], ["package", "status"],
        ["package", "add", "fixture/demo", "--version", "^1.0.0"], ["package", "add", "fixture/demo", "--path", "packages/demo"],
        ["package", "remove", "fixture/demo"], ["package", "install"], ["package", "resolve"],
        ["package", "publish", "packages/demo", "--dry-run"], ["package", "publish", "packages/demo"],
      ]) {
        const result = await child([...args, "--server", server.url]).done;
        assert.equal(result.code, 0, result.stderr); assert(!result.stdout.includes(TOKEN)); assert(!result.stdout.includes("private/key"));
        if (args.includes("--dry-run")) { assert.match(result.stdout, /Would publish fixture\/demo@1.0.0/); assert.match(result.stdout, /meta.yaml/); }
      }
      const requests = commands.filter((m) => m.type === "environment.request");
      assert.deepEqual(requests.map((m) => m.request), [{ kind: "registry", version: "^1.0.0" }, { kind: "path", path: "packages/demo" }]);
      assert(commands.filter((m) => ["environment.request", "environment.remove", "environment.install", "environment.resolve"].includes(m.type)).every((m) => m.wait === true));
      const publication = commands.filter((m) => m.type === "environment.publish");
      // Published by the name the folder's manifest gives (environments-10).
      assert.deepEqual(publication.map((m) => m.name), ["fixture/demo", "fixture/demo"]); assert(publication.every((m) => m.path === undefined));
      assert.equal(publication.length, 2); assert.equal(publication[0].dryRun, true); assert.equal(publication[0].wait, undefined); assert.equal(publication[1].wait, true); assert.equal(publication[1].dryRun, undefined);
    } finally { await server.stop(); }
  });

  it("selects only an exact registered folder and never registers implicitly", async () => {
    commands.length = 0; const server = await fixture(standard);
    try {
      const result = await child(["package", "install", "--project", join(PROJECT, "nested"), "--server", server.url]).done;
      assert.equal(result.code, 1); assert.match(result.stderr, /project add/); assert.deepEqual(commands.map((m) => m.type), ["project.list"]);
    } finally { await server.stop(); }
  });

  it("uses request-specific sign-in completion, including completion before instructions", async () => {
    const server = await fixture((message, socket) => {
      if (message.type === "space.get") reply(socket, message, { instances: [{ origin: "https://space.example", name: "space.example", signedIn: true, account: { login: "reader" } }] });
      else {
        socket.send(JSON.stringify({ type: "space.signin.completed", id: "unrelated", ok: false, error: { code: "denied", message: "Other request" } }));
        socket.send(JSON.stringify({ type: "space.signin.completed", id: message.id, instance: "https://space.example", ok: true, account: { id: "1", login: "reader", displayName: null } }));
        reply(socket, message, { flow: "device", userCode: "ABCD", verificationUri: "https://space.example/approve", expiresAt: Date.now() + 1000 });
      }
    });
    try {
      const result = await child(["auth", "login", "--instance", "https://space.example", "--server", server.url]).done;
      assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /ABCD/); assert.match(result.stdout, /Signed in as @reader/); assert.match(result.stdout, /Catalog reading and Sync are separate/);
      const status = await child(["auth", "status", "--server", server.url]).done; assert.equal(status.code, 0); assert.match(status.stdout, /Signed in as @reader/);
    } finally { await server.stop(); }
  });

  it("fails request-specific denied sign-in and never accepts background acknowledgements", async () => {
    const denied = await fixture((message, socket) => {
      reply(socket, message, { flow: "browser", url: "https://space.example/login" });
      socket.send(JSON.stringify({ type: "space.signin.completed", id: message.id, instance: "https://space.example", ok: false, error: { code: "denied", message: "Approval denied" } }));
    });
    try { const result = await child(["auth", "login", "--instance", "https://space.example", "--server", denied.url]).done; assert.equal(result.code, 1); assert.match(result.stderr, /denied: Approval denied/); assert(!result.stdout.includes("Signed in as")); }
    finally { await denied.stop(); }
    const accepted = await fixture((message, socket) => {
      if (message.type === "project.list") standard(message, socket);
      else reply(socket, message, { accepted: true });
    });
    try { const result = await child(["package", "install", "--server", accepted.url]).done; assert.equal(result.code, 2); assert.match(result.stderr, /unknown/); assert(!result.stdout.includes("completed")); }
    finally { await accepted.stop(); }
  });

  it("preserves terminal refusal and redacts server capability in diagnostics", async () => {
    let mutations = 0;
    const server = await fixture((message, socket) => {
      if (message.type === "project.list") standard(message, socket);
      else { mutations++; socket.send(JSON.stringify({ type: "environment.state", state: { busy: null, error: null } })); socket.send(JSON.stringify({ type: "reply", id: message.id, ok: false, error: { code: "conflict", message: `refused ${TOKEN}` } })); }
    });
    try { const result = await child(["package", "install", "--server", server.url]).done; assert.equal(result.code, 1); assert.match(result.stderr, /conflict: refused/); assert(!result.stderr.includes(TOKEN)); assert.equal(mutations, 1); }
    finally { await server.stop(); }
  });

  it("reports unknown after disconnection or timeout without replay", async () => {
    for (const close of [true, false]) {
      let mutations = 0;
      const server = await fixture((message, socket) => {
        if (message.type === "project.list") standard(message, socket);
        else { mutations++; if (close) socket.close(); }
      });
      try { const result = await child(["package", "install", "--timeout", "1", "--server", server.url]).done; assert.equal(result.code, 2, result.stderr); assert.match(result.stderr, /unknown.*may still complete/); assert.equal(mutations, 1); assert.equal(server.connections(), 1); }
      finally { await server.stop(); }
    }
  });

  it("interrupts package observation and sends matched sign-in cancellation", { skip: process.platform === "win32" ? "Windows process.kill does not deliver a native console SIGINT; verified on POSIX." : false }, async () => {
    for (const auth of [false, true]) {
      let cancellation: any; let startId: string | undefined;
      let started!: () => void; const request = new Promise<void>((resolve) => { started = resolve; });
      const server = await fixture((message, socket) => {
        if (message.type === "project.list") standard(message, socket);
        else if (message.type === "space.signin.cancel") { cancellation = message; reply(socket, message, { stopped: true }); }
        else { startId = message.id; if (auth) reply(socket, message, { flow: "browser", url: "https://space.example/signin" }); started(); }
      });
      try {
        const running = child([...(auth ? ["auth", "login", "--instance", "https://space.example"] : ["package", "install"]), "--server", server.url]);
        await Promise.race([request, running.done.then((result) => { throw new Error(`CLI ended before request: ${result.code}: ${result.stderr}`); })]); running.proc.kill("SIGINT"); const result = await running.done;
        assert.equal(result.code, 130, result.stderr); assert.match(result.stderr, auth ? /Requested cancellation/ : /Work may still complete/);
        if (auth) assert.equal(cancellation?.startId, startId); else assert.equal(cancellation, undefined);
      } finally { await server.stop(); }
    }
  });

  it("uses real core project and package operations with an installed packed CLI", { skip: !["darwin", "linux"].includes(process.platform) ? "The Spex core host supports macOS/Linux only; packed CLI transport cases still run here." : false }, async (t) => {
    const { CoreService } = await import(pathToFileURL(join(CORE, "dist/index.js")).href);
    const { fakeAdapterImports, startStandinRegistry } = await import(pathToFileURL(join(CORE, "dist/testing/index.js")).href);
    const dir = join(SCRATCH, "real-core"); mkdirSync(dir);
    const home = join(dir, "user"); mkdirSync(home);
    const configPath = join(dir, "config.yaml");
    writeFileSync(configPath, 'captain:\n  adapter: claude\n  model: fixture\nplayers: {}\nplaybooks: {}\n');
    const folder = join(dir, "project"); mkdirSync(folder);
    execFileSync("git", ["init", "-q"], { cwd: folder });
    writeFileSync(join(folder, "README.md"), "Fixture\n");
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "add", "."], { cwd: folder });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture"], { cwd: folder });
    const packageDir = join(folder, "packages/demo"); mkdirSync(join(packageDir, "skills/en/demo"), { recursive: true });
    writeFileSync(join(packageDir, "meta.yaml"), 'format: 2\norg: fixture\nname: demo\nversion: 1.0.0\ndescription: Fixture\nlicense: Apache-2.0\nartifacts:\n  demo:\n    kind: skill\n    language: en\n');
    writeFileSync(join(packageDir, "skills/en/demo/SKILL.md"), '---\nname: demo\ndescription: Fixture\n---\n\n# Demo\n');
    const registry = await startStandinRegistry({ dir: join(dir, "registry") });
    t.after(() => registry.close());
    registry.script.setOrgs("fixture-publisher", [{ name: "fixture", path: "fixture", role: "owner" }]);
    const state = join(dir, "state"); mkdirSync(join(state, "local"), { recursive: true });
    writeFileSync(join(state, "home.yaml"), JSON.stringify({ format: 2, device: randomUUID(), origin: registry.url, instances: [{ origin: registry.url, clientId: "spex", account: { id: "1", login: "fixture", displayName: "Fixture" } }], own: "fixture", folders: [] }));
    writeFileSync(join(state, "local/credentials.yaml"), JSON.stringify({ format: 1, hosts: { [registry.url]: { access: "fixture-publisher", accessExpiresAt: Date.now() + 3_600_000, refresh: "fixture-refresh" } } }), { mode: 0o600 });
    const { imports } = fakeAdapterImports({ fallback: { result: "unused" } });
    const core = await CoreService.start({ token: TOKEN, configPath, dataDir: state, home, own: "fixture", userHome: home, env: { SPEX_HOST_URL: registry.url }, adapterImports: imports, adapterRuntime: () => ({ usable: true }), watchConfig: false, builtinPackage: null });
    const url = `http://127.0.0.1:${core.port()}/?token=${TOKEN}`;
    try {
      const run = async (args: string[]) => {
        const result = await child([...args, ...(args[0] === "package" ? ["--project", folder] : []), "--server", url]).done;
        assert.equal(result.code, 0, result.stderr);
        return result;
      };
      await run(["project", "add", folder]); await run(["project", "add", folder]);
      const auth = await run(["auth", "status"]); assert.match(auth.stdout, /Signed in as @fixture/);
      const listed = await run(["project", "list"]);
      assert.equal(listed.stdout.split(folder).length - 1, 1, "registration stays idempotent");
      await run(["package", "add", "fixture/demo", "--path", "packages/demo"]);
      const dry = await run(["package", "publish", "packages/demo", "--dry-run"]);
      assert.match(dry.stdout, /Would publish fixture\/demo@1.0.0/); assert(dry.stdout.includes(registry.url)); assert.match(dry.stdout, /meta.yaml/);
      assert.equal(registry.script.requests.filter((r: string) => r.startsWith("PUT ")).length, 0);
      // A folder other than the one the core publishes for that name — the
      // environment's request by path, else spex-packages/<org>/<pkg> — is
      // refused before anything is sent (environments-10).
      const copy = join(folder, "release/demo"); mkdirSync(copy, { recursive: true });
      writeFileSync(join(copy, "meta.yaml"), readFileSync(join(packageDir, "meta.yaml")));
      const other = await child(["package", "publish", "release/demo", "--project", folder, "--server", url]).done;
      assert.equal(other.code, 1); assert.match(other.stderr, /fixture\/demo is published from packages\/demo, not release\/demo/);
      assert.equal(registry.script.requests.filter((r: string) => r.startsWith("PUT ")).length, 0);
      const published = await run(["package", "publish", "packages/demo"]);
      assert.match(published.stdout, /Published fixture\/demo@1.0.0/);
      assert.equal(registry.script.requests.filter((r: string) => r.startsWith("PUT ")).length, 1);
      await run(["package", "add", "fixture/demo", "--version", "1.0.0"]);
      const search = await run(["package", "search", "demo"]); assert.match(search.stdout, /fixture\/demo/);
      // The project's lock stands at its working folder's root
      // (environments-26).
      const lockPath = join(folder, "spex.lock");
      const lockBefore = readFileSync(lockPath, "utf8");
      await run(["package", "install"]); assert.equal(readFileSync(lockPath, "utf8"), lockBefore, "install preserves the selected lock");
      await run(["package", "resolve"]);
      const status = await run(["package", "status"]); assert.match(status.stdout, /fixture\/demo\t1.0.0\tinstalled/);
      await run(["package", "remove", "fixture/demo"]);
      const removed = await run(["package", "status"]); assert(!removed.stdout.includes("fixture/demo"));
    } finally { await core.stop(); }
  });
});
