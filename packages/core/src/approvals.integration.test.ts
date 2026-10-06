// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { CoreService } from "./service.js";
import { fakeAdapterImports, type FakeResponse } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import type { ApprovalState, Command, CommandResults, PendingApproval, ReplyMessage, ServerMessage } from "./protocol.js";

class Client {
  readonly messages: ServerMessage[] = [];
  private readonly socket: WebSocket;
  private readonly replies = new Map<string, (reply: ReplyMessage) => void>();
  readonly ready: Promise<void>;
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=approvals-test`);
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.on("message", (data) => {
        const message = JSON.parse(String(data)) as ServerMessage;
        this.messages.push(message);
        if (message.type === "hello") resolve();
        if (message.type === "reply") { this.replies.get(message.id)?.(message); this.replies.delete(message.id); }
      });
    });
  }
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, {type: T}>, "type" | "id">): Promise<CommandResults[T]> {
    await this.ready;
    const id = randomUUID();
    const reply = new Promise<ReplyMessage>((resolve) => this.replies.set(id, resolve));
    this.socket.send(JSON.stringify({type, id, ...fields}));
    const result = await reply;
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.result as CommandResults[T];
  }
  close() { this.socket.close(); }
  async pending(count = 1): Promise<ApprovalState> {
    for (let retry = 0; retry < 500; retry++) {
      const state = await this.command("approval.list", {});
      if (state.pending.length === count) return state;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} pending approvals`);
  }
  answer(state: ApprovalState, request: PendingApproval, decision: "allow_once" | "deny") {
    return this.command("approval.respond", {generation: state.generation, requestId: request.id, owner: request.owner, decision});
  }
}

async function fixture(expiresInMs = 600_000, approvalPatch: Partial<NonNullable<FakeResponse["approval"]>> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "spex-approvals-"));
  const project = join(dir, "project");
  await mkdir(project);
  execFileSync("git", ["init", "--quiet", project]);
  const configPath = join(dir, "config.yaml");
  await writeFile(configPath, `captain:\n  adapter: claude\nplayers:\n  inspector:\n    adapter: claude\nplaybooks:\n  code:\n    from: "@sublang/playbook/code/registry"\n    roles:\n      coder: inspector\n`);
  const {imports, stats} = fakeAdapterImports({rules: [{match: "approval-fixture", response: {
    result: "Approved native action completed", approval: {toolName: "desktop.inspect", input: {app: "Task-owned Example", operation: "read-window", target: "<script>untrusted</script>"}, reason: "Read this task-owned window", expiresInMs, ...approvalPatch},
    effect: (cwd) => writeFileSync(join(cwd, "approved-effect.txt"), "once"),
  }}], fallback: {result: JSON.stringify({action: "respond", text: "The working call finished."})}});
  const options = {dataDir: join(dir, "home"), configPath, home: dir, env: {}, watchConfig: false,
    token: "approvals-test", adapterImports: imports, adapterRuntime: () => ({usable: true}),
    captainFactory: async () => createScriptedCaptain(async (_turn, context) => { await context.callPlayer("inspector", "approval-fixture"); })};
  let service = await CoreService.start(options);
  const clients: Client[] = [];
  const client = () => { const value = new Client(service.port()); clients.push(value); return value; };
  const first = client();
  await first.ready;
  const registered = await first.command("project.register", {path: project});
  const session = await first.command("session.create", {projectId: registered.id});
  return {dir, project, projectId: registered.id, first, client, stats, session,
    async restart() { for (const client of clients) client.close(); await service.stop(); service = await CoreService.start(options); return client(); },
    async stop() { for (const client of clients) client.close(); await service.stop(); await rm(dir, {recursive: true, force: true}); }};
}

async function settle(client: Client, sessionId: string): Promise<void> {
  for (let retry = 0; retry < 500; retry++) {
    const sessions = await client.command("session.list", {});
    if (!sessions.find((session) => session.id === sessionId)?.turnActive) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Session did not settle");
}

test("approvals-7: authenticated live requests survive reconnect and deliver once across competing clients", {timeout: 30_000}, async () => {
  const f = await fixture();
  try {
    await f.first.command("turn.submit", {sessionId: f.session.id, text: "Inspect the fixture"});
    const pending = await f.first.pending();
    const request = pending.pending[0];
    assert.deepEqual(request.owner, {kind: "session", id: f.session.id});
    assert.equal(request.actorId, "inspector");
    assert.equal(request.turnId, 1);
    assert.equal(request.request.input.app, "Task-owned Example");
    assert.equal(existsSync(join(f.project, "approved-effect.txt")), false);
    f.first.close();
    const other = f.client();
    await other.ready;
    assert.deepEqual((await other.pending()).pending, pending.pending);
    await assert.rejects(other.command("approval.respond", {generation: pending.generation, requestId: request.id, owner: {kind: "draft", id: "wrong"}, decision: "allow_once"}), /not_found/);
    const second = f.client();
    const results = await Promise.allSettled([other.answer(pending, request, "allow_once"), second.answer(pending, request, "deny")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const winner = results[0].status === "fulfilled" ? "allow_once" : "deny";
    assert.deepEqual(await other.answer(pending, request, winner), {decision: winner});
    await settle(other, f.session.id);
    assert.equal(existsSync(join(f.project, "approved-effect.txt")), winner === "allow_once");
    const history = await other.command("history.get", {sessionId: f.session.id});
    const responses = history.records.filter(({record}) => record.type === "player_event" && record.event.type === "approval_response");
    assert.equal(responses.length, 1);
    assert.equal((await other.pending(0)).pending.length, 0);
    const restarted = await f.restart();
    const fresh = await restarted.pending(0);
    assert.notEqual(fresh.generation, pending.generation);
    await assert.rejects(restarted.answer(pending, request, winner), /conflict/);
  } finally { await f.stop(); }
});

test("approvals-7: deny, abort, and timeout never execute the pending action", {timeout: 30_000}, async () => {
  for (const action of ["deny", "abort", "timeout"] as const) {
    const f = await fixture(action === "timeout" ? 250 : 600_000);
    try {
      await f.first.command("turn.submit", {sessionId: f.session.id, text: action});
      const pending = await f.first.pending();
      if (action === "deny") await f.first.answer(pending, pending.pending[0], "deny");
      if (action === "abort") await f.first.command("turn.abort", {sessionId: f.session.id});
      await f.first.pending(0);
      await settle(f.first, f.session.id);
      assert.equal(existsSync(join(f.project, "approved-effect.txt")), false);
      await assert.rejects(f.first.answer(pending, pending.pending[0], "allow_once"), /not_found|conflict/);
    } finally { await f.stop(); }
  }
});

test("approvals-7: disposing the owning session invalidates its pending request", {timeout: 30_000}, async () => {
  const f = await fixture();
  try {
    await f.first.command("turn.submit", {sessionId: f.session.id, text: "Inspect, then let the session go"});
    const pending = await f.first.pending();
    const request = pending.pending[0];
    assert.deepEqual(request.owner, {kind: "session", id: f.session.id});
    await f.first.command("session.dispose", {sessionId: f.session.id});
    assert.deepEqual((await f.first.pending(0)).pending, []);
    const summary = (await f.first.command("session.list", {})).find((session) => session.id === f.session.id)!;
    assert.equal(summary.live, false);
    await assert.rejects(f.first.answer(pending, request, "allow_once"), /not_found/);
    assert.equal(existsSync(join(f.project, "approved-effect.txt")), false);
  } finally { await f.stop(); }
});

test("approvals-7: concurrent session and drafts keep reused native identities isolated", {timeout: 30_000}, async () => {
  const f = await fixture();
  try {
    await f.first.command("turn.submit", {sessionId: f.session.id, text: "session"});
    for (const draftId of ["one", "two"]) {
      await f.first.command("draft.create", {projectId: f.projectId, draftId});
      await f.first.command("draft.send", {projectId: f.projectId, draftId, text: "approval-fixture"});
    }
    const state = await f.first.pending(3);
    assert.equal(new Set(state.pending.map((request) => request.id)).size, 3);
    assert.equal(new Set(state.pending.map((request) => request.invocationId)).size, 3);
    assert.equal(new Set(state.pending.map((request) => request.request.id)).size, 1);
    const one = state.pending.find((request) => request.owner.kind === "draft" && request.owner.id === "one")!;
    await f.first.answer(state, one, "deny");
    assert.equal((await f.first.pending(2)).pending.some((request) => request.id === one.id), false);
    await f.first.command("draft.abort", {projectId: f.projectId, draftId: "two"});
    assert.equal((await f.first.pending()).pending[0].owner.kind, "session");
    const restarted = await f.restart();
    assert.deepEqual((await restarted.pending(0)).pending, []);
    for (const request of state.pending) await assert.rejects(restarted.answer(state, request, "allow_once"), /conflict/);
  } finally { await f.stop(); }
});


test("approvals-7: malformed custom native requests never become authority or perform an action", {timeout: 30_000}, async () => {
  class RewrittenAction extends Array<string> {
    toJSON() { return ["different action"]; }
  }
  // The request is depth 0 and input depth 1; this leaf reaches depth 65.
  let overDepthInput: Record<string, unknown> = {value: "too deep"};
  for (let depth = 0; depth < 63; depth++) overDepthInput = {nested: overDepthInput};
  for (const approval of [
    {id: ""}, {toolName: ""}, {choices: []},
    {input: {unreviewable: new Date()}}, {input: {unreviewable: undefined}},
    {input: {amount: NaN}}, {input: {callback: () => "lost"}},
    {input: {actions: new RewrittenAction("reviewed action")}},
    {input: {text: "x".repeat(256 * 1024)}}, {input: overDepthInput},
  ]) {
    const f = await fixture(600_000, approval);
    try {
      await f.first.command("turn.submit", {sessionId: f.session.id, text: "Reject malformed custom native request"});
      await settle(f.first, f.session.id);
      assert.deepEqual((await f.first.command("approval.list", {})).pending, []);
      assert.ok(!f.first.messages.some((message) => message.type === "approval.state" && message.state.pending.length > 0));
      assert.equal(existsSync(join(f.project, "approved-effect.txt")), false);
    } finally { await f.stop(); }
  }
});
