// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// approvals-9: a paid native approval stage for the fresh Desktop driver.
// Imported only; this module never launches a provider by itself.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";

export const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export async function nativeApprovalStage({page, client, inspector, scratch, profile, evidenceDir, initializeRepository, waitFor, run, at}) {
  // The fresh fixture has no grant-all or tool allowlist. A portable ask
  // cannot override an earlier native allow rule: absence of an actual
  // request is a failing proof, never an inferred or simulated approval.
  await client.command("config.edit", {op: {kind: "player.set", playerId: inspector, patch: {
    adapter: "claude", model: null, effort: null, fastMode: false, browser: false,
    permissions: {shellExecute: "ask", fileWrite: "deny", networkAccess: "deny"},
  }}});
  const capability = await client.command("agent.capabilities", {agent: {adapter: "claude", browser: false,
    permissions: {shellExecute: "ask", fileWrite: "deny", networkAccess: "deny"}}});
  assert.equal(capability.approvals?.status, "supported", "installed Claude transport must support genuine live approval");
  const observations = [];
  for (const decision of ["deny", "allow_once"]) {
    at(`fresh native Claude ${decision} request`);
    const repository = join(scratch, `approval ${decision} repository`);
    const head = initializeRepository(repository);
    const fixtureDir = join(scratch, `approval ${decision} data`);
    mkdirSync(fixtureDir);
    const file = join(fixtureDir, "reference.txt");
    const token = `APPROVAL-${randomBytes(6).toString("hex").toUpperCase()}`;
    writeFileSync(file, `${token}\n`);
    const command = `cat ${shellQuote(file)}`;
    const project = await client.command("project.register", {path: repository});
    await page.reload();
    await page.getByTestId(`sidebar-project-${project.id}`).click();
    const prompt = `/inspect Use the Bash tool to run exactly this read-only command once: ${command}\nReport the resulting reference if the operation succeeds. If permission is denied, stop and report that denial. Do not retry or use another tool to read the file. Do not change files or make a commit.`;
    assert.ok(!prompt.includes(token));
    await page.getByTestId("start-composer").fill(prompt);
    await page.getByRole("button", {name: "Send", exact: true}).click();
    const session = await waitFor(async () => (await client.command("session.list")).find((entry) => entry.projectId === project.id), 60_000, "native approval session");
    const pending = await waitFor(async () => {
      const state = await client.command("approval.list");
      const own = state.pending.filter((entry) => entry.owner.kind === "session" && entry.owner.id === session.id);
      const history = (await client.command("history.get", {sessionId: session.id})).records.map(({record}) => record);
      if (own.length) {
        assert.equal(own.length, 1);
        const request = own[0];
        assert.equal(request.actorId, inspector);
        assert.equal(request.request.toolName, "Bash");
        assert.equal(request.request.input.command, command, "review only the exact task-owned read operation");
        if (!history.some((record) => record.type === "player_event" && record.playerId === inspector && record.event.type === "approval_request" && record.event.payload.id === request.request.id)) return undefined;
        assert.ok(!history.some((record) => record.type === "player_event" && record.event.type === "tool_result" && record.event.payload.toolUseId === request.request.toolUseId), "the requested tool has not returned while approval is pending");
        return {state, request};
      }
      const current = (await client.command("session.list")).find((entry) => entry.id === session.id);
      if (!current?.turnActive) throw new Error("Native call completed without the genuine approval request required by this proof");
      return undefined;
    }, 180_000, "genuine native Bash approval");
    assert.equal(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], repository), "");
    assert.equal(readFileSync(file, "utf8"), `${token}\n`);
    assert.equal(await page.getByTestId("boss-composer").isDisabled(), true);
    await page.getByRole("button", {name: "Tool approval needed (1)", exact: true}).click();
    const inbox = page.getByRole("region", {name: "Tool approvals", exact: true});
    assert.ok((await inbox.innerText()).includes(command));
    assert.equal(await inbox.getByRole("button", {name: "Deny", exact: true}).evaluate((element) => element === document.activeElement), true);
    const pendingScreenshot = join(evidenceDir, `native-approval-${decision}-pending.png`);
    await page.screenshot({path: pendingScreenshot});
    await inbox.getByRole("button", {name: decision === "allow_once" ? "Approve once" : "Deny", exact: true}).click();
    await inbox.waitFor({state: "hidden"});
    let records = [];
    await waitFor(async () => {
      const remaining = (await client.command("approval.list")).pending.filter((entry) => entry.owner.kind === "session" && entry.owner.id === session.id);
      assert.equal(remaining.length, 0, "the fixture must not retry or ask for another operation");
      records = (await client.command("history.get", {sessionId: session.id})).records.map(({record}) => record);
      const current = (await client.command("session.list")).find((entry) => entry.id === session.id);
      return current && !current.turnActive;
    }, 12 * 60_000, "native call settlement after approval answer");
    const events = records.filter((record) => record.type === "player_event" && record.playerId === inspector && record.turnId === pending.request.turnId).map((record) => record.event);
    const responses = events.filter((event) => event.type === "approval_response" && event.payload.requestId === pending.request.request.id);
    assert.equal(responses.length, 1);
    assert.deepEqual({decision: responses[0].payload.decision, source: responses[0].payload.source}, {decision, source: "host"});
    const toolResult = events.find((event) => event.type === "tool_result" && event.payload.toolUseId === pending.request.request.toolUseId);
    if (decision === "allow_once") {
      assert.equal(toolResult?.payload.status, "success");
      assert.ok(JSON.stringify(toolResult.payload.output).includes(token), "the approved native shell must actually read the new fixture bytes");
    } else assert.notEqual(toolResult?.payload.status, "success", "denial must not be reported as execution success");
    assert.equal(run("git", ["rev-parse", "HEAD"], repository).trim(), head);
    assert.equal(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], repository), "");
    assert.equal(readFileSync(file, "utf8"), `${token}\n`);
    const store = createSessionStore({sessionsDir: join(profile, "spex-home", "sessions")});
    const stored = await waitFor(async () => { const value = await store.read(session.id); return value?.state === "settled" ? value : undefined; }, 30_000, "durable approval-call settlement");
    const boundaries = stored.effectLedger.boundaries.filter((entry) => entry.playbookId === "inspect" && entry.roleId === "inspector");
    assert.ok(boundaries.length > 0);
    assert.ok(boundaries.every((entry) => entry.physicalReceipt?.classification === "unchanged"));
    await page.reload();
    assert.ok(!(await client.command("approval.list")).pending.some((entry) => entry.owner.id === session.id));
    const reopened = (await client.command("history.get", {sessionId: session.id})).records;
    assert.ok(reopened.some(({record}) => record.type === "player_event" && record.event.type === "approval_response" && record.event.payload.requestId === pending.request.request.id));
    observations.push({adapter: "claude", sessionId: session.id, actorId: inspector, decision, requestId: pending.request.request.id,
      toolUseId: pending.request.request.toolUseId, toolName: pending.request.request.toolName, nativeResult: toolResult?.payload.status ?? "not-reported",
      observedModels: [...new Set(events.filter((event) => event.type === "init" && typeof event.payload.reportedModel === "string").map((event) => event.payload.reportedModel))],
      physicalReceipt: "unchanged", settlementStatus: stored.snapshot.lastSettlementStatus, pendingScreenshot, historyOnlyAfterReopen: true});
  }
  return observations;
}
