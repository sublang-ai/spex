// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Applets through a real core (applets-7, DR-161): a project whose
// environment installs, from the stand-in registry, a release holding
// an applet, and requests by path a folder of its working folder
// holding an applet of another id, with your own group's environment
// installing the first release too. `applet.open` answers each
// capability path, and real HTTP requests to the core's own endpoint
// read what the table of applets-4 serves and refuse the rest, the
// home among it where a working folder holds it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { join } from "node:path";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import type { Command, CommandResults, ServerMessage } from "./protocol.js";
import { appletPolicy } from "./applets.js";
import { APPLET_ENTRY, APPLET_ID, APPLET_PACKAGE, APPLET_SCRIPT, publishAppletRelease } from "./testing/applet-release.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";
import { makeRelease, startStandinRegistry } from "./testing/standin-registry.js";

const OWN = "tester";

const CONFIG = `captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    roles:
      coder: dev.coder
`;

class Client {
  private readonly socket: WebSocket;
  private readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => this.messages.push(JSON.parse(String(data)) as ServerMessage));
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    await this.waitFor((message) => message.type === "hello");
  }

  close(): void { this.socket.close(); }

  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">):
    Promise<{ ok: true; result: CommandResults[T] } | { ok: false; error: { code: string; message: string } }> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor((message) => message.type === "reply" && message.id === id, 120_000);
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok ? { ok: true, result: reply.result as CommandResults[T] } : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  }

  async expectError<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">, code: string): Promise<void> {
    const reply = await this.command(type, fields);
    assert.ok(!reply.ok, `${type} must be refused`);
    if (reply.ok) return;
    assert.equal(reply.error.code, code, `${type}: ${reply.error.message}`);
  }

  private async waitFor(check: (message: ServerMessage) => boolean, timeoutMs = 30_000): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.find(check);
      if (found) return found;
      if (Date.now() - start > timeoutMs) throw new Error("timeout waiting for a message");
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
}

interface Answer {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** One real HTTP request to the core's endpoint, its path sent as it is
 * written, unnormalized. */
function fetchRaw(port: number, path: string, options: { method?: string; host?: string } = {}): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path,
      method: options.method ?? "GET",
      headers: { host: options.host ?? `127.0.0.1:${port}`, connection: "close" },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/** A WebSocket handshake under `path`: the status it was refused with,
 * and the refusal's body. */
function handshake(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    socket.on("open", () => {
      socket.close();
      reject(new Error(`a handshake under ${path} opened`));
    });
    socket.on("unexpected-response", (_req, res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    socket.on("error", () => { /* the unexpected response carries the answer */ });
  });
}

function gitFolder(path: string): string {
  mkdirSync(path, { recursive: true });
  execFileSync("git", ["init", "-q", path]);
  return path;
}

const CAPABILITY_PATH = /^\/applets\/[A-Za-z0-9_-]{43}\/$/;

test("applets-7: applet.open answers each capability, the core's endpoint serves the applet and the working folder by the table, refuses the rest, and stops serving once the package leaves", { timeout: 240_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-applets-registry-") });
  t.after(() => registry.close());
  const releaseDir = await publishAppletRelease(join(scratchDir("spex-applets-release-"), "report-kit"), registry.url);

  const dir = scratchDir("spex-applets-");
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, CONFIG);
  const { imports } = fakeAdapterImports({ rules: [], fallback: { result: "done" } });
  const captain = createScriptedCaptain(async () => {});
  mkdirSync(join(dir, "user", ".claude"), { recursive: true });
  const service = await CoreService.start({
    token: "test", configPath, dataDir: join(dir, "state"), adapterImports: imports, adapterRuntime: () => ({ usable: true }),
    env: { SPEX_HOST_URL: registry.url }, home: join(dir, "user"), own: OWN, watchConfig: false,
    captainFactory: async () => captain,
  });
  t.after(() => service.stop());
  const port = service.port();
  const client = new Client(port);
  t.after(() => client.close());
  await client.open();

  // The project's working folder: a README, a folder, a link leading
  // out of it, and a spec package under development holding an applet
  // of another id, requested by path.
  const working = gitFolder(join(dir, "project"));
  const readme = "# Demo\n\nHello from the working folder.\n";
  writeFileSync(join(working, "README.md"), readme);
  mkdirSync(join(working, "docs"));
  writeFileSync(join(working, "docs", "guide.md"), "A guide.\n");
  writeFileSync(join(dir, "secret.txt"), "outside the working folder\n");
  symlinkSync(join(dir, "secret.txt"), join(working, "outside"));
  const notesDir = join(working, "spex-packages", "notes-view");
  const notesEntry = "<!doctype html>\n<title>Notes</title>\n<p>first</p>\n";
  await makeRelease(notesDir, {
    format: 2, org: "acme", name: "notes-view", version: "0.1.0", description: "Notes", license: "Apache-2.0",
    artifacts: { notes: { kind: "applet" } },
  }, { "applets/notes/index.html": notesEntry });
  const { id: key } = await client.expectOk("project.register", { path: working });
  const own = `${OWN}/${OWN}-spex`;
  await client.expectOk("environment.request", { repository: key, name: APPLET_PACKAGE, request: { kind: "registry", version: "^1.0.0" }, wait: true });
  await client.expectOk("environment.request", { repository: key, name: "acme/notes-view", request: { kind: "path", path: "spex-packages/notes-view" }, wait: true });
  await client.expectOk("environment.request", { repository: own, name: APPLET_PACKAGE, request: { kind: "registry", version: "^1.0.0" }, wait: true });

  // applet.open: one capability per applet and project, the same on a
  // second ask, refused where nothing is known (applets-3).
  const { path } = await client.expectOk("applet.open", { repository: key, applet: APPLET_ID, project: key });
  assert.match(path, CAPABILITY_PATH, "[applets-3] /applets/<43 base64url characters>/");
  assert.equal((await client.expectOk("applet.open", { repository: key, applet: APPLET_ID, project: key })).path, path, "[applets-3] the same ask answers the same path");
  const ownPath = (await client.expectOk("applet.open", { repository: own, applet: APPLET_ID, project: key })).path;
  assert.match(ownPath, CAPABILITY_PATH);
  assert.notEqual(ownPath, path, "[applets-3] your own group's applet of the same id has a capability of its own");
  await client.expectError("applet.open", { repository: key, applet: "absent", project: key }, "not_found");
  await client.expectError("applet.open", { repository: "nobody/none-spex", applet: APPLET_ID, project: key }, "not_found");
  // Your own group's spex repository pairs no working folder here.
  await client.expectError("applet.open", { repository: key, applet: APPLET_ID, project: own }, "not_found");

  // Served by the table, with the policy naming the request's own
  // scheme and Host (applets-4, applets-5).
  const served = async (at: string, bytes: Buffer | string, type: string, host?: string): Promise<Answer> => {
    const answer = await fetchRaw(port, at, host ? { host } : {});
    assert.equal(answer.status, 200, `[applets-4] ${at}`);
    assert.ok(answer.body.equals(Buffer.from(bytes)), `[applets-4] ${at} serves its bytes`);
    assert.equal(answer.headers["content-type"], type, `[applets-4] ${at}'s content type`);
    assert.equal(answer.headers["cache-control"], "no-store", "[applets-4] no-store");
    assert.equal(answer.headers["x-content-type-options"], "nosniff", "[applets-4] nosniff");
    assert.equal(answer.headers["access-control-allow-origin"], "*", "[applets-4] the opaque page reads its own paths");
    assert.equal(answer.headers["content-security-policy"], appletPolicy(`http://${host ?? `127.0.0.1:${port}`}`), "[applets-5] the policy names the request's scheme and Host");
    return answer;
  };
  const entry = await served(path, APPLET_ENTRY, "text/html; charset=utf-8");
  assert.match(String(entry.headers["content-security-policy"]), new RegExp(`^default-src http://127\\.0\\.0\\.1:${port}; script-src http://127\\.0\\.0\\.1:${port} 'unsafe-inline';`));
  await served(`${path}index.html`, APPLET_ENTRY, "text/html; charset=utf-8");
  await served(`${path}report.js`, APPLET_SCRIPT, "text/javascript; charset=utf-8");
  await served(`${path}~/README.md`, readme, "application/octet-stream");
  await served(`${path}?r=2`, APPLET_ENTRY, "text/html; charset=utf-8", `localhost:${port}`);
  const listing = await fetchRaw(port, `${path}~/`);
  assert.equal(listing.status, 200);
  assert.equal(listing.headers["content-type"], "application/json");
  assert.equal(listing.headers["cache-control"], "no-store");
  assert.equal(listing.headers["x-content-type-options"], "nosniff");
  assert.equal(listing.headers["access-control-allow-origin"], "*", "[applets-4] the listing reads across origins");
  assert.equal(listing.headers["content-security-policy"], appletPolicy(`http://127.0.0.1:${port}`));
  const { entries } = JSON.parse(listing.body.toString("utf8")) as { entries: { name: string; kind: string; size: number; modified: number }[] };
  const named = (name: string) => entries.find((item) => item.name === name);
  assert.deepEqual(named("README.md"), { name: "README.md", kind: "file", size: Buffer.byteLength(readme), modified: named("README.md")!.modified });
  assert.ok(Number.isInteger(named("README.md")!.modified) && named("README.md")!.modified > 0, "[applets-4] modified in Unix milliseconds");
  assert.equal(named("docs")?.kind, "folder", "[applets-4] a folder is listed");
  assert.equal(named("outside"), undefined, "[applets-4] a link is left out");
  const inner = JSON.parse((await fetchRaw(port, `${path}~/docs/`)).body.toString("utf8")) as { entries: { name: string }[] };
  assert.deepEqual(inner.entries.map((item) => item.name), ["guide.md"]);
  // HEAD: the same headers, no body.
  const head = await fetchRaw(port, path, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0, "[applets-4] HEAD sends no body");
  for (const header of ["content-type", "cache-control", "x-content-type-options", "content-security-policy", "content-length"]) {
    assert.equal(head.headers[header], entry.headers[header], `[applets-4] HEAD's ${header} is GET's`);
  }

  // Refused as the table says, each with an empty body (applets-4).
  const refused = async (at: string, status: number, method?: string): Promise<void> => {
    const answer = await fetchRaw(port, at, method ? { method } : {});
    assert.equal(answer.status, status, `[applets-4] ${method ?? "GET"} ${at} is refused ${status}`);
    assert.equal(answer.body.length, 0, `[applets-4] ${at}'s refusal has an empty body`);
    // The opaque page reads a refusal as one, not as a failed read.
    assert.equal(answer.headers["access-control-allow-origin"], "*", `[applets-4] ${at}'s refusal reads across origins`);
  };
  await refused(`${path}../index.html`, 404);
  await refused(`${path}../../meta.yaml`, 404);
  await refused(`${path}%2e%2e/%2e%2e/meta.yaml`, 404);
  await refused(`${path}~/%2E%2E/secret.txt`, 404);
  await refused(`${path}~/outside`, 404);
  await refused(`${path}~/.git/HEAD`, 404);
  await refused(`${path}~/.GIT/HEAD`, 404);
  await refused(`${path}~/docs/.git/config`, 404);
  await refused(`${path}~/docs`, 404);
  await refused(`${path}~`, 404);
  await refused(`${path}~/absent.md`, 404);
  await refused(`${path}~/README.md/`, 404);
  await refused(path.slice(0, -1), 404);
  await refused(`/applets/${"A".repeat(43)}/`, 404);
  await refused(`/applets/${"A".repeat(43)}/index.html`, 404);
  await refused(path, 405, "POST");
  await refused(`${path}~/README.md`, 405, "PUT");
  const upgrade = await handshake(port, `${path}?token=test`);
  assert.deepEqual(upgrade, { status: 404, body: "" }, "[applets-4] a WebSocket handshake under the path is refused 404, empty");
  // The endpoint's token admits nothing under the path.
  await refused(`/applets/${"A".repeat(43)}/?token=test`, 404);
  await refused(`/applets/test/?token=test`, 404);
  await refused(`${path}~/.git/HEAD?token=test`, 404);
  await refused(`${path}~/outside?token=test`, 404);
  // Any other path of the core's own endpoint answers nothing.
  for (const at of ["/", "/index.html?token=test"]) {
    const answer = await fetchRaw(port, at);
    assert.equal(answer.status, 404, `${at} answers nothing`);
    assert.equal(answer.body.length, 0);
  }

  // A working folder holding the home opens no window on it
  // (applets-4): the scratch root, which holds this core's home at
  // `state/`, is a project too, your own group's applet shown for it.
  symlinkSync(join(dir, "state"), join(dir, "home-link"));
  const { id: outerKey } = await client.expectOk("project.register", { path: gitFolder(dir) });
  const outerPath = (await client.expectOk("applet.open", { repository: own, applet: APPLET_ID, project: outerKey })).path;
  assert.match(outerPath, CAPABILITY_PATH);
  assert.ok(readFileSync(join(dir, "state", "home.yaml")).length > 0, "the home's home.yaml stands");
  await served(`${outerPath}~/project/README.md`, readme, "application/octet-stream");
  await refused(`${outerPath}~/state/home.yaml`, 404);
  // A volume that ignores case reads `STATE` as `state`.
  await refused(`${outerPath}~/STATE/home.yaml`, 404);
  await refused(`${outerPath}~/state/`, 404);
  await refused(`${outerPath}~/home-link/home.yaml`, 404);
  await refused(`${outerPath}~/home-link/`, 404);

  // The path source's applet serves the working folder's bytes, an
  // edit read on the next request (applets-4).
  const notesPath = (await client.expectOk("applet.open", { repository: key, applet: "notes", project: key })).path;
  assert.match(notesPath, CAPABILITY_PATH);
  assert.notEqual(notesPath, path);
  await served(notesPath, notesEntry, "text/html; charset=utf-8");
  const edited = notesEntry.replace("first", "second");
  writeFileSync(join(notesDir, "applets", "notes", "index.html"), edited);
  await served(notesPath, edited, "text/html; charset=utf-8");
  // Its folder removed, its files are not on this device (applets-3),
  // and its capability serves nothing.
  rmSync(notesDir, { recursive: true, force: true });
  await client.expectError("applet.open", { repository: key, applet: "notes", project: key }, "invalid_request");
  await refused(notesPath, 404);

  // Once environment.remove and its install took the release away,
  // its capability answers 404; your own group's still serves
  // (applets-4). The missing path source goes first: a resolution
  // stops at it.
  await client.expectOk("environment.remove", { repository: key, name: "acme/notes-view", wait: true });
  await served(path, APPLET_ENTRY, "text/html; charset=utf-8");
  await client.expectOk("environment.remove", { repository: key, name: APPLET_PACKAGE, wait: true });
  await refused(path, 404);
  await refused(`${path}~/README.md`, 404);
  await client.expectError("applet.open", { repository: key, applet: APPLET_ID, project: key }, "not_found");
  await served(ownPath, APPLET_ENTRY, "text/html; charset=utf-8");
  assert.ok(readFileSync(join(releaseDir, "applets", APPLET_ID, "index.html")).equals(Buffer.from(APPLET_ENTRY)));
});
