// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import type { AgentAdapter, AgentCapabilities, AgentOptions, AgentEvent } from "@sublang/cligent";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";
import { createSessionStore } from "@sublang/playbook/session-store";
import { parse as parseYaml } from "yaml";
import { CoreService } from "./service.js";
import { ApplicationMedia } from "./media.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { MEDIA_CHUNK_BYTES, type Command, type CommandResults, type MediaAsset, type MediaOwner, type ReplyMessage, type ServerMessage } from "./protocol.js";

class MediaClient {
  private readonly pending = new Map<string, (reply: ReplyMessage) => void>();
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  readonly ready: Promise<void>;
  constructor(port: number, onMessage?: (message: ServerMessage) => void) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=media-test`);
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.on("message", (bytes) => {
        const message = JSON.parse(String(bytes)) as ServerMessage;
        this.messages.push(message);
        onMessage?.(message);
        if (message.type === "hello") resolve();
        if (message.type === "reply") {
          this.pending.get(message.id)?.(message);
          this.pending.delete(message.id);
        }
      });
    });
  }
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, {type: T}>, "type" | "id">): Promise<CommandResults[T]> {
    await this.ready;
    const id = randomUUID();
    const reply = new Promise<ReplyMessage>((resolve) => this.pending.set(id, resolve));
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const result = await reply;
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.result as CommandResults[T];
  }
  close(): void { this.socket.close(); }

  async waitFor(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const deadline = Date.now() + 5000;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for protocol event: ${JSON.stringify(this.messages)}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

const SESSION_CONFIG = `
captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
    permissions:
      mode: auto
      networkAccess: deny
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`;

async function sessionFixture(worker = false, untilAborted = false) {
  const dir = await mkdtemp(join(tmpdir(), "spex-media-session-"));
  const project = join(dir, "project");
  await mkdir(project);
  execFileSync("git", ["init", "--quiet", project]);
  const configPath = join(dir, "config.yaml");
  await writeFile(configPath, SESSION_CONFIG);
  const { imports, stats } = fakeAdapterImports({ fallback: {
    result: JSON.stringify({ action: "respond", text: "What would you like me to inspect?" }),
    delayMs: 20,
    untilAborted,
  } });
  const options = {
    dataDir: join(dir, "home"), configPath, watchConfig: false, env: {}, home: dir,
    token: "media-test", adapterImports: imports, adapterRuntime: () => ({ usable: true }),
    ...(worker ? { captainFactory: async () => createScriptedCaptain(async (turn, context) => {
      await context.callPlayer("dev.coder", `browser-fixture:${turn.prompt}`);
    }) } : {}),
  };
  return { dir, project, configPath, options, stats, service: await CoreService.start(options) };
}

async function readAll(client: MediaClient, owner: MediaOwner, asset: MediaAsset): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < asset.byteLength; offset += MEDIA_CHUNK_BYTES) {
    const result = await client.command("media.read", { owner, assetId: asset.assetId, offset, length: MEDIA_CHUNK_BYTES });
    assert.equal(result.offset, offset);
    assert.deepEqual(result.asset, asset);
    chunks.push(Buffer.from(result.data, "base64"));
  }
  return Buffer.concat(chunks);
}

test("space-37: pending attachment validation excludes sync until queue and edit admission finish", {timeout: 30_000}, async () => {
  const f = await sessionFixture();
  const client = new MediaClient(f.service.port());
  const media = Reflect.get(f.service, "media") as ApplicationMedia;
  const ownerStore = media.ownerStore.bind(media);
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, {cwd, encoding: "utf8",
    env: {...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1"}}).trim();
  let release = () => {};
  let admission: Promise<unknown> | undefined;
  try {
    const project = await client.command("project.register", {path: f.project});
    const owner = {kind: "project" as const, id: project.id};
    const uploadId = randomUUID();
    await client.command("media.begin", {owner, uploadId, name: "guarded.txt", mimeType: "text/plain", byteLength: 4});
    await client.command("media.chunk", {uploadId, offset: 0, data: Buffer.from("kept").toString("base64")});
    const {asset} = await client.command("media.finish", {uploadId});
    const remote = join(f.dir, "remote.git");
    git(f.dir, "init", "--quiet", "--bare", "--initial-branch=main", remote);
    git(f.options.dataDir, "init", "--quiet", "--initial-branch=main");
    git(f.options.dataDir, "config", "user.name", "Media Fixture");
    git(f.options.dataDir, "config", "user.email", "media@example.invalid");
    git(f.options.dataDir, "config", "commit.gpgsign", "false");
    git(f.options.dataDir, "commit", "--quiet", "--allow-empty", "-m", "Fixture baseline");
    await client.command("space.remote.set", {url: remote});
    let intentId = "";
    for (const operation of ["queue", "edit"] as const) {
      let entered!: () => void;
      const validating = new Promise<void>((resolve) => { entered = resolve; });
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      let pause = true;
      // Keep the real core, asset digest verification, and Space admission.
      // Hold only the native reader close to expose the command's async gap.
      media.ownerStore = (value, write = false) => {
        const store = ownerStore(value, write);
        return value.kind === owner.kind && value.id === owner.id && !write ? {...store,
          openAsset: async (...args: Parameters<typeof store.openAsset>) => {
            const reader = await store.openAsset(...args);
            return {...reader, close: async () => {
              if (pause) { pause = false; entered(); await barrier; }
              await reader.close();
            }};
          },
        } : store;
      };
      const head = git(f.options.dataDir, "rev-parse", "HEAD");
      const submitted = operation === "queue"
        ? client.command("intent.queue", {projectId: project.id, text: "", attachments: [asset], at: "tail"})
        : client.command("intent.edit", {intentId, text: "Review these bytes", attachments: [asset]});
      admission = submitted;
      await validating;
      await assert.rejects(client.command("space.sync", {}), /busy: Wait for the media upload to finish/);
      assert.equal(git(f.options.dataDir, "rev-parse", "HEAD"), head, "refusal precedes Git mutation");
      release();
      const intent = await submitted;
      intentId = intent.id;
      assert.deepEqual(intent.attachments, [asset]);
      assert.equal(intent.text, operation === "queue" ? "" : "Review these bytes");
      media.ownerStore = ownerStore;
      assert.deepEqual(await readAll(client, owner, asset), Buffer.from("kept"));
      const after = client.messages.length;
      await client.command("space.sync", {});
      const settled = await client.waitFor((message) => client.messages.indexOf(message) >= after
        && message.type === "space.state" && ["done", "stopped"].includes(message.state.sync.phase));
      assert.ok(settled.type === "space.state");
      assert.equal(settled.state.sync.phase, "done", JSON.stringify(settled.state.sync));
      assert.equal(git(remote, "rev-parse", "main"), git(f.options.dataDir, "rev-parse", "HEAD"));
      assert.equal(f.stats.runs.length, 0);
    }
  } finally {
    release();
    await admission?.catch(() => {});
    media.ownerStore = ownerStore;
    client.close();
    await f.service.stop();
    await rm(f.dir, {recursive: true, force: true});
  }
});

test("media-18: deleting and recreating a draft invalidates completed and incomplete upload retries", {timeout: 30_000}, async () => {
  const f = await sessionFixture();
  const client = new MediaClient(f.service.port());
  const owner = {kind: "draft" as const, id: "retired-media"};
  const request = () => ({owner, uploadId: randomUUID(), name: "kept.txt", mimeType: "text/plain", byteLength: 4});
  const completed = request(), incomplete = request();
  try {
    await client.command("draft.create", {draftId: owner.id});
    for (const upload of [completed, incomplete]) {
      await client.command("media.begin", upload);
      await client.command("media.chunk", {uploadId: upload.uploadId, offset: 0, data: Buffer.from("kept").toString("base64")});
    }
    const prior = await client.command("media.finish", {uploadId: completed.uploadId});
    await client.command("media.read", {owner, assetId: prior.asset.assetId, offset: 0, length: 1});
    await client.command("draft.delete", {draftId: owner.id});
    await client.command("draft.create", {draftId: owner.id});
    for (const upload of [completed, incomplete]) {
      await assert.rejects(client.command("media.begin", upload), /canceled|expired/);
      await assert.rejects(client.command("media.finish", {uploadId: upload.uploadId}), /canceled|expired/);
    }
    await assert.rejects(client.command("media.read", {owner, assetId: prior.asset.assetId, offset: 0, length: 1}));
    const fresh = request();
    await client.command("media.begin", fresh);
    await client.command("media.chunk", {uploadId: fresh.uploadId, offset: 0, data: Buffer.from("kept").toString("base64")});
    const current = await client.command("media.finish", {uploadId: fresh.uploadId});
    assert.deepEqual(await readAll(client, owner, current.asset), Buffer.from("kept"));
  } finally { client.close(); await f.service.stop(); await rm(f.dir, {recursive: true, force: true}); }
});

test("core-service-71: session deletion rechecks liveness after draining its media owner", {timeout: 30_000}, async (t) => {
  const f = await sessionFixture(false, true);
  const client = new MediaClient(f.service.port());
  let sessionId = "";
  let entered!: () => void, release!: () => void;
  const draining = new Promise<void>((resolve) => { entered = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const original = ApplicationMedia.prototype.retireOwner;
  // Delay only the owner's final deletion boundary. The real retirement,
  // authenticated commands, session leases and scripted turn execute below.
  t.mock.method(ApplicationMedia.prototype, "retireOwner", async function<T>(this: ApplicationMedia, owner: MediaOwner, remove: () => T | Promise<T>): Promise<T> {
    return original.call(this, owner, async () => {
      if (owner.kind === "session" && owner.id === sessionId) { entered(); await barrier; }
      return remove();
    }) as Promise<T>;
  });
  try {
    const project = await client.command("project.register", {path: f.project});
    const session = await client.command("session.create", {projectId: project.id});
    sessionId = session.id;
    await client.command("subscribe", {channel: {kind: "session", sessionId}});
    await client.command("session.dispose", {sessionId});
    const refusal = assert.rejects(client.command("session.delete", {sessionId}), /busy:/);
    await draining;
    await client.command("turn.submit", {sessionId, text: "Continue while the old media owner drains"});
    await client.waitFor((event) => event.type === "record" && event.sessionId === sessionId && event.record.type === "turn_started");
    release();
    await refusal;
    assert.equal((await client.command("session.list", {})).find((entry) => entry.id === sessionId)?.live, true);
    assert.equal((await client.command("turn.abort", {sessionId})).aborted, true);
    await client.waitFor((event) => event.type === "session.state" && event.session.id === sessionId && event.session.turns === 1 && !event.session.live);
    assert.ok((await client.command("history.get", {sessionId})).records.some(({record}) => record.type === "turn_started"));
    await client.command("session.delete", {sessionId});
    assert.equal((await client.command("session.list", {})).some((entry) => entry.id === sessionId), false);
  } finally {
    release();
    if (sessionId) await client.command("turn.abort", {sessionId}).catch(() => {});
    client.close(); await f.service.stop(); await rm(f.dir, {recursive: true, force: true});
  }
});

test("media-10: a restarted core reclaims crashed uploads only after taking the home lease", {timeout: 30_000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "spex-media-crash-"));
  const projectPath = join(dir, "project");
  await mkdir(projectPath);
  execFileSync("git", ["init", "--quiet", projectPath]);
  const options = {dataDir: join(dir, "home"), configPath: join(dir, "config.yaml"), watchConfig: false, env: {}, home: dir, token: "media-test"};
  const source = `import {CoreService} from ${JSON.stringify(new URL("./service.js", import.meta.url).href)}; const service = await CoreService.start(${JSON.stringify(options)}); process.send({port:service.port()});`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {stdio: ["ignore", "ignore", "pipe", "ipc"]});
  const exited = once(child, "exit");
  let diagnostics = "";
  child.stderr?.on("data", (data: Buffer) => { diagnostics += data.toString(); });
  let client: MediaClient | undefined;
  let service: CoreService | undefined;
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Child core startup timed out: ${diagnostics}`)), 10_000);
      child.once("message", (message: unknown) => { clearTimeout(timer); resolve((message as {port: number}).port); });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Child core exited ${code}: ${diagnostics}`)); });
    });
    client = new MediaClient(port);
    const project = await client.command("project.register", {path: projectPath});
    const owner = {kind: "project" as const, id: project.id};
    const completedId = randomUUID();
    await client.command("media.begin", {uploadId: completedId, owner, name: "completed.txt", mimeType: "text/plain", byteLength: 4});
    await client.command("media.chunk", {uploadId: completedId, offset: 0, data: Buffer.from("kept").toString("base64")});
    const {asset} = await client.command("media.finish", {uploadId: completedId});
    const incompleteId = randomUUID();
    await client.command("media.begin", {uploadId: incompleteId, owner, name: "interrupted.txt", mimeType: "text/plain", byteLength: 6});
    await client.command("media.chunk", {uploadId: incompleteId, offset: 0, data: Buffer.from("abc").toString("base64")});
    const stagingRoot = join(options.dataDir, "local", "uploads");
    const [lifetime] = await readdir(stagingRoot);
    const staged = join(stagingRoot, lifetime, incompleteId);
    await assert.rejects(CoreService.start(options), /already|running|held|owner/i);
    assert.equal(await readFile(staged, "utf8"), "abc", "a rejected second core leaves the live owner's upload intact");
    child.kill("SIGKILL");
    await exited;
    client.close();
    assert.equal(await readFile(staged, "utf8"), "abc", "the abrupt exit bypassed graceful staging cleanup");
    service = await CoreService.start(options);
    client = new MediaClient(service.port());
    assert.equal((await readdir(stagingRoot)).includes(lifetime), false);
    await assert.rejects(client.command("media.finish", {uploadId: incompleteId}), /unavailable/i);
    assert.deepEqual(await readAll(client, owner, asset), Buffer.from("kept"));
    await client.command("media.begin", {uploadId: incompleteId, owner, name: "interrupted.txt", mimeType: "text/plain", byteLength: 6});
    await client.command("media.chunk", {uploadId: incompleteId, offset: 0, data: Buffer.from("abcdef").toString("base64")});
    const retried = await client.command("media.finish", {uploadId: incompleteId});
    assert.deepEqual(await readAll(client, owner, retried.asset), Buffer.from("abcdef"));
  } finally {
    client?.close();
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    await service?.stop();
    await rm(dir, {recursive: true, force: true});
  }
});

test("media-10: unsafe staging roots and lifetime links are refused without touching targets", {timeout: 30_000}, async () => {
  for (const kind of ["local", "root", "lifetime", "file"] as const) {
    const dir = await mkdtemp(join(tmpdir(), "spex-media-unsafe-"));
    const options = {dataDir: join(dir, "home"), configPath: join(dir, "config.yaml"), watchConfig: false, env: {}, home: dir, token: "media-test"};
    try {
      const first = await CoreService.start(options);
      await first.stop();
      const outside = join(dir, "outside");
      await mkdir(outside, {mode: 0o700});
      const fileId = randomUUID();
      await writeFile(join(outside, fileId), "preserve outside bytes");
      const root = join(options.dataDir, "local", "uploads");
      const lifetime = join(root, randomUUID());
      const link = kind === "local" ? join(options.dataDir, "local") : kind === "root" ? root : kind === "lifetime" ? lifetime : join(lifetime, fileId);
      if (kind === "local" || kind === "root") await rm(link, {recursive: true});
      if (kind === "file") await mkdir(lifetime, {mode: 0o700});
      await symlink(kind === "file" ? join(outside, fileId) : outside, link);
      await assert.rejects(CoreService.start(options), /Upload staging path is unsafe/);
      assert.equal(await readFile(join(outside, fileId), "utf8"), "preserve outside bytes");
      assert.deepEqual(await readdir(outside), [fileId], "startup and failed-start teardown do not traverse the link");
    } finally { await rm(dir, {recursive: true, force: true}); }
  }
});

test("media-13: file-only session copies before acknowledgement, reopens exact bytes and deletes only its owner", {timeout: 30_000}, async () => {
  const fixture = await sessionFixture();
  let service = fixture.service;
  let client = new MediaClient(service.port());
  try {
    const project = await client.command("project.register", { path: fixture.project });
    const projectOwner = { kind: "project" as const, id: project.id };
    const bytes = randomBytes(MEDIA_CHUNK_BYTES + 17);
    const uploadId = randomUUID();
    await client.command("media.begin", { uploadId, owner: projectOwner, name: "selected screen.png", mimeType: "image/png", byteLength: bytes.length });
    for (let offset = 0; offset < bytes.length; offset += MEDIA_CHUNK_BYTES)
      await client.command("media.chunk", { uploadId, offset, data: bytes.subarray(offset, offset + MEDIA_CHUNK_BYTES).toString("base64") });
    const { asset } = await client.command("media.finish", { uploadId });
    const session = await client.command("session.create", { projectId: project.id });
    const sessionOwner = { kind: "session" as const, id: session.id };
    await client.command("subscribe", { channel: { kind: "session", sessionId: session.id } });
    assert.deepEqual(await client.command("turn.submit", { sessionId: session.id, text: "", attachments: [asset] }), { accepted: true });
    // Read immediately after the acknowledgement, without waiting for the
    // agent or turn settlement. Shared storage already owns the whole file.
    assert.deepEqual(await readAll(client, sessionOwner, asset), bytes);
    assert.deepEqual(Buffer.from(await createSessionStore({ sessionsDir: join(fixture.options.dataDir, "sessions") }).readAsset(session.id, asset)), bytes);
    await client.waitFor((event) => event.type === "session.state" && event.session.id === session.id && event.session.turns === 1 && !event.session.live);
    const summary = (await client.command("session.list", {})).find((entry) => entry.id === session.id)!;
    assert.equal(summary.title, asset.name);
    assert.equal(summary.turns, 1);
    const history = await client.command("history.get", { sessionId: session.id });
    const started = history.records.find(({ record }) => record.type === "turn_started")?.record;
    assert.ok(started?.type === "turn_started");
    assert.equal(started.turn.prompt, "");
    assert.deepEqual(started.turn.attachments, [asset]);
    assert.ok(history.records.some(({ record }) => record.type === "captain_reply" && record.text === "What would you like me to do with the attached material?"), "attachment-only admission asks for intent without inventing prompt text");
    assert.equal(fixture.stats.runs.length, 0, "clarification does not require a provider call");
    client.close();
    await service.stop();
    service = await CoreService.start(fixture.options);
    client = new MediaClient(service.port());
    assert.deepEqual(await readAll(client, sessionOwner, asset), bytes);
    const reopened = (await client.command("session.list", {})).find((entry) => entry.id === session.id)!;
    assert.equal(reopened.title, asset.name);
    const replay = await client.command("history.get", { sessionId: session.id });
    assert.deepEqual(replay.records, history.records);
    await client.command("session.delete", { sessionId: session.id });
    assert.equal((await client.command("session.list", {})).some((entry) => entry.id === session.id), false);
    await assert.rejects(client.command("media.read", { owner: sessionOwner, assetId: asset.assetId, offset: 0, length: 1 }), /no session|unknown session/i);
    assert.deepEqual(await readAll(client, projectOwner, asset), bytes, "project ownership remains independent of session deletion");
  } finally {
    client.close();
    await service.stop();
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("media-19: an empty-text submission naming an attachment-only intent hands off that intent's own files", {timeout: 30_000}, async () => {
  const fixture = await sessionFixture();
  const client = new MediaClient(fixture.service.port());
  try {
    const project = await client.command("project.register", { path: fixture.project });
    const bytes = randomBytes(64);
    const uploadId = randomUUID();
    await client.command("media.begin", { uploadId, owner: { kind: "project", id: project.id }, name: "queued screen.png", mimeType: "image/png", byteLength: bytes.length });
    await client.command("media.chunk", { uploadId, offset: 0, data: bytes.toString("base64") });
    const { asset } = await client.command("media.finish", { uploadId });
    const queued = await client.command("intent.queue", { projectId: project.id, text: "", attachments: [asset], at: "tail" });
    const session = await client.command("session.create", { projectId: project.id });
    const sessionOwner = { kind: "session" as const, id: session.id };
    await client.command("subscribe", { channel: { kind: "session", sessionId: session.id } });

    // The dispatch names the intent alone; its files are not sent again.
    assert.deepEqual(await client.command("turn.submit", { sessionId: session.id, text: "", intentId: queued.id }), { accepted: true });
    assert.deepEqual(await readAll(client, sessionOwner, asset), bytes);
    await client.waitFor((event) => event.type === "session.state" && event.session.id === session.id && event.session.turns === 1 && !event.session.live);
    const history = await client.command("history.get", { sessionId: session.id });
    const started = history.records.find(({ record }) => record.type === "turn_started")?.record;
    assert.ok(started?.type === "turn_started");
    assert.equal(started.turn.prompt, "");
    assert.deepEqual(started.turn.attachments, [asset]);
    const dispatched = (await client.command("ledger.get", {})).intents.find((entry) => entry.intent.id === queued.id)!;
    assert.equal(dispatched.intent.dispatched?.sessionId, session.id);

    // Text and resolved files both empty: refused once resolved, with no turn.
    const plain = await client.command("intent.queue", { projectId: project.id, text: "Write the release notes", at: "tail" });
    await assert.rejects(client.command("turn.submit", { sessionId: session.id, text: "", intentId: plain.id }), /invalid_request: Text or an attachment is required/);
    const summary = (await client.command("session.list", {})).find((entry) => entry.id === session.id)!;
    assert.equal(summary.turns, 1);
    assert.equal(summary.live, false);
    const ledger = await client.command("ledger.get", {});
    const left = ledger.intents.find((entry) => entry.intent.id === plain.id)!;
    assert.equal(left.state, "queued");
    assert.equal(left.intent.dispatched, undefined);
  } finally {
    client.close();
    await fixture.service.stop();
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("core-service-77: rejected attachment admission releases only the runtime it opened", {timeout: 30_000}, async () => {
  const fixture = await sessionFixture();
  const client = new MediaClient(fixture.service.port());
  try {
    const project = await client.command("project.register", { path: fixture.project });
    const session = await client.command("session.create", { projectId: project.id });
    const shared = createSessionStore({ sessionsDir: join(fixture.options.dataDir, "sessions") });
    const missing: MediaAsset = { assetId: `sha256:${"a".repeat(64)}`, byteLength: 1, mimeType: "image/png", name: "missing.png" };
    const rejectSubmission = () => assert.rejects(client.command("turn.submit", {
      sessionId: session.id, text: "", attachments: [missing],
    }), /ENOENT|not found|missing/i);
    const summary = async () => (await client.command("session.list", {})).find((entry) => entry.id === session.id)!;

    // A runtime the caller already owns stays live after failed admission.
    assert.equal((await summary()).live, true);
    await rejectSubmission();
    assert.equal((await summary()).live, true);
    assert.equal((await summary()).turnActive, false);
    assert.equal(await shared.readLeaseState(session.id), "active");

    await client.command("session.dispose", { sessionId: session.id });
    assert.equal((await summary()).live, false);
    assert.equal(await shared.readLeaseState(session.id), "idle");
    const before = await client.command("history.get", { sessionId: session.id });
    // Continuation acquires the lease before validating/copying its files.
    // A refusal must finish that cleanup before acknowledging the error.
    await rejectSubmission();
    assert.equal((await summary()).live, false);
    assert.equal((await summary()).turnActive, false);
    assert.equal(await shared.readLeaseState(session.id), "idle");
    const after = await client.command("history.get", { sessionId: session.id });
    assert.deepEqual(after.records.slice(0, before.records.length), before.records);
    assert.equal(after.records.some(({ record }) => record.type === "turn_started"), false);
    assert.equal(fixture.stats.runs.length, 0, "rejected admission never invokes a provider");

    await client.command("session.delete", { sessionId: session.id });
    const next = await client.command("session.create", { projectId: project.id });
    assert.notEqual(next.id, session.id);
    await client.command("session.dispose", { sessionId: next.id });
    await client.command("session.delete", { sessionId: next.id });
  } finally {
    client.close();
    await fixture.service.stop();
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("media-14: browser configuration and session override roundtrip into next-turn worker calls while controls stay tool-free", {timeout: 30_000}, async () => {
  const fixture = await sessionFixture(true);
  let service = fixture.service;
  let client = new MediaClient(service.port());
  try {
    const project = await client.command("project.register", { path: fixture.project });
    const session = await client.command("session.create", { projectId: project.id });
    await client.command("subscribe", { channel: { kind: "session", sessionId: session.id } });
    let turns = 0;
    const turn = async (name: string, enabled: boolean) => {
      const before = fixture.stats.runs.length;
      await client.command("turn.submit", { sessionId: session.id, text: name });
      turns++;
      await client.waitFor((event) => event.type === "session.state" && event.session.id === session.id && event.session.turns === turns && !event.session.live);
      const calls = fixture.stats.runs.slice(before);
      const worker = calls.find((call) => call.prompt === `browser-fixture:${name}`);
      assert.ok(worker, "the setting is observed at the adapter boundary of a real working call");
      assert.equal(worker.browser ?? false, enabled);
      assert.equal(worker.permissions?.networkAccess, "deny", "browser selection does not weaken the configured network policy");
      const controls = calls.filter((call) => call !== worker);
      assert.ok(controls.length > 0);
      assert.ok(controls.every((call) => call.browser === false), "the actual Captain shell explicitly disables browser tools");
    };
    await turn("legacy omission", false);
    const changed = await client.command("config.edit", { op: { kind: "player.set", playerId: "dev.coder", patch: { browser: true } } });
    assert.equal(changed.status, "valid");
    if (changed.status === "valid") assert.equal(changed.summary.players.find((player) => player.id === "dev.coder")?.agent.browser, true);
    await client.command("config.edit", { op: { kind: "captain.set", patch: { browser: true } } });
    await turn("configured on", true);
    const configured = await readFile(fixture.configPath);
    const overridden = await client.command("session.agent.set", { sessionId: session.id, agentId: "dev.coder", browser: false });
    assert.equal(overridden.agentSettings?.["dev.coder"]?.browser, false);
    await turn("session off", false);
    assert.deepEqual(await readFile(fixture.configPath), configured);
    client.close();
    await service.stop();
    service = await CoreService.start(fixture.options);
    client = new MediaClient(service.port());
    await client.command("subscribe", { channel: { kind: "session", sessionId: session.id } });
    const persisted = (await client.command("session.list", {})).find((entry) => entry.id === session.id)!;
    assert.equal(persisted.agentSettings?.["dev.coder"]?.browser, false);
    const cleared = await client.command("session.agent.set", { sessionId: session.id, agentId: "dev.coder", browser: null });
    assert.equal(cleared.agentSettings?.["dev.coder"]?.browser, undefined);
    await turn("inherit configured on", true);
    await client.command("config.edit", { op: { kind: "player.set", playerId: "dev.coder", patch: { browser: null } } });
    await turn("configured omission again", false);
    const raw = parseYaml(await readFile(fixture.configPath, "utf8")) as { players: Record<string, { browser?: boolean }> };
    assert.equal(Object.hasOwn(raw.players["dev.coder"], "browser"), false);
    assert.equal((await client.command("session.list", {})).find((entry) => entry.id === session.id)?.turns, 5, "mutable browser changes continue the original session identity");
  } finally {
    client.close();
    await service.stop();
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("authenticated media bytes survive client reconnect and core restart with exact owner identity", {timeout: 30_000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "spex-media-protocol-"));
  const dataDir = join(dir, "home");
  const project = join(dir, "project");
  await mkdir(project);
  execFileSync("git", ["init", "--quiet", project]);
  const options = { dataDir, configPath: join(dir, "config.yaml"), watchConfig: false, env: {}, home: dir, token: "media-test" };
  let service = await CoreService.start(options);
  let client = new MediaClient(service.port());
  try {
    const registered = await client.command("project.register", { path: project });
    const owner = { kind: "project" as const, id: registered.id };
    const bytes = randomBytes(MEDIA_CHUNK_BYTES + 137);
    const request = { owner, uploadId: randomUUID(), name: "remote selected image.png", mimeType: "image/png", byteLength: bytes.length };
    await client.command("media.begin", request);
    await client.command("media.chunk", { uploadId: request.uploadId, offset: 0, data: bytes.subarray(0, MEDIA_CHUNK_BYTES).toString("base64") });
    client.close();
    client = new MediaClient(service.port());
    assert.equal((await client.command("media.begin", request)).offset, MEDIA_CHUNK_BYTES);
    await client.command("media.chunk", { uploadId: request.uploadId, offset: MEDIA_CHUNK_BYTES, data: bytes.subarray(MEDIA_CHUNK_BYTES).toString("base64") });
    const result = await client.command("media.finish", { uploadId: request.uploadId });
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(result.asset.assetId, `sha256:${hash}`);
    assert.deepEqual(await readFile(join(dataDir, "intents", `${owner.id}.assets`, hash)), bytes);
    await assert.rejects(client.command("media.read", { owner: { kind: "project", id: randomUUID() }, assetId: result.asset.assetId, offset: 0, length: 1 }), /no project/i);
    const first = await client.command("media.read", { owner, assetId: result.asset.assetId, offset: 0, length: MEDIA_CHUNK_BYTES });
    assert.equal(first.eof, false);
    assert.deepEqual(Buffer.from(first.data, "base64"), bytes.subarray(0, MEDIA_CHUNK_BYTES));
    client.close();
    await service.stop();
    service = await CoreService.start(options);
    client = new MediaClient(service.port());
    const second = await client.command("media.read", { owner, assetId: result.asset.assetId, offset: MEDIA_CHUNK_BYTES, length: MEDIA_CHUNK_BYTES });
    assert.equal(second.eof, true);
    assert.deepEqual(Buffer.from(second.data, "base64"), bytes.subarray(MEDIA_CHUNK_BYTES));
    assert.equal(second.asset.name, request.name);
    await client.command("media.read", { owner, assetId: result.asset.assetId, offset: 0, length: 1 });
    await writeFile(join(dataDir, "intents", `${owner.id}.assets`, hash), Buffer.alloc(bytes.length), {mode: 0o600});
    await assert.rejects(client.command("media.read", { owner, assetId: result.asset.assetId, offset: 1, length: 1 }), /changed|digest|integrity/i);
  } finally {
    client.close();
    await service.stop();
    await rm(dir, { recursive: true, force: true });
  }
});


test("browser capabilities use execution context and owned preparation cancels without saving", {timeout: 30_000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "spex-browser-protocol-"));
  const project = join(dir, "project");
  await mkdir(project);
  execFileSync("git", ["init", "--quiet", project]);
  const calls: AgentOptions<string, boolean, string, string>[] = [];
  let runs = 0;
  let block = false;
  let started: () => void = () => {};
  let aborted: () => void = () => {};
  class Adapter implements AgentAdapter<string, boolean, string, string> {
    readonly agent = "codex";
    async isAvailable() { return false; }
    async getCapabilities(options: AgentOptions<string, boolean, string, string>): Promise<AgentCapabilities> {
      calls.push(options);
      started();
      if (block) await new Promise<void>((resolve) => {
        const done = () => { aborted(); resolve(); };
        options.abortSignal?.addEventListener("abort", done, {once: true});
        if (options.abortSignal?.aborted) done();
      });
      return {browser: {status: "supported"}, attachments: {mimeTypes: ["image/png"], notes: "Fixture"}};
    }
    async *run(): AsyncGenerator<AgentEvent, void, void> { runs++; }
  }
  const adapterImports = Object.fromEntries(["claude", "codex", "gemini", "kimi", "opencode"].map((key) => [key, async () => Adapter])) as unknown as PlayerAdapterImports;
  const configPath = join(dir, "config.yaml");
  const service = await CoreService.start({dataDir: join(dir, "home"), configPath, watchConfig: false, env: {}, home: dir, token: "media-test", adapterImports});
  const progress: string[] = [];
  const client = new MediaClient(service.port(), (event) => { if (event.type === "browser.progress") progress.push(event.progress.stage); });
  try {
    const registered = await client.command("project.register", {path: project});
    const context = {kind: "project" as const, id: registered.id};
    const agent = {adapter: "codex" as const, permissions: {mode: "auto", networkAccess: "deny"}};
    const config = await readFile(configPath);
    assert.equal((await client.command("agent.capabilities", {agent, context})).browser.status, "supported");
    assert.equal(calls.at(-1)?.cwd, project);
    assert.equal(calls.at(-1)?.permissions?.networkAccess, "deny");
    assert.equal(runs, 0);
    const result = await client.command("browser.prepare", {agent, context, operationId: randomUUID()});
    assert.equal(result.status, "not-ready");
    if (result.status === "not-ready") assert.equal(result.code, "runtime-unavailable");
    assert.deepEqual(progress, ["checking"]);
    block = true;
    const operationId = randomUUID();
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const pending = client.command("browser.prepare", {agent, context, operationId});
    await entered;
    assert.deepEqual(await client.command("browser.cancel", {operationId}), {canceled: true});
    assert.deepEqual(await pending, {status: "cancelled"});
    const disconnected = new Promise<void>((resolve) => { aborted = resolve; });
    const enteredAgain = new Promise<void>((resolve) => { started = resolve; });
    void client.command("browser.prepare", {agent, context, operationId: randomUUID()});
    await enteredAgain;
    client.close();
    await disconnected;
    assert.deepEqual(await readFile(configPath), config);
    assert.equal(runs, 0);
  } finally {
    client.close();
    await service.stop();
    await rm(dir, {recursive: true, force: true});
  }
});
