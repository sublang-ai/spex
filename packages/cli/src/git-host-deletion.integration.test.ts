// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { GitHostClient, HostError } from "./lib/git-host.js";

test("git-host-19/33: normal deletion and restore use explicit safe endpoints, preserve lifecycle data, and never fall back to DELETE", async (t) => {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const active = { id: "7", full_path: "team", name: "Team", kind: "group", can: { create_subgroup: true, manage_members: true, rename: true, delete: true } };
  const pending = { ...active, full_path: "team-deleting-7", pending_deletion: true, deletion_root: "team-deleting-7", can: { create_subgroup: false, manage_members: false, rename: false, delete: false, restore: true } };
  let response: unknown = { status: "scheduled", group: pending };
  let status = 200;
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += String(chunk);
    requests.push({ method: req.method!, path: req.url!, body: raw ? JSON.parse(raw) : null });
    assert.equal(req.headers.authorization, "Bearer current-access");
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const client = new GitHostClient({
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, label: "Deletion test",
    credentials: { read: async () => ({ access: "current-access", accessExpiresAt: Date.now() + 3_600_000, refresh: "refresh" }), replace: () => true },
  });
  await assert.rejects(client.deleteGroup("7"), (error) => error instanceof HostError && error.code === "confirmation_required");
  await assert.rejects(client.deleteGroup("7", "   "), (error) => error instanceof HostError && error.code === "confirmation_required");
  assert.equal(requests.length, 0, "old callers cannot send an unconfirmed deletion");
  response = { group: active, contents: [{ kind: "records", name: "Group sessions" }, { kind: "project", name: "Website" }, { kind: "group", name: "Research" }, { kind: "server", name: "Development" }] };
  assert.deepEqual((await client.inspectGroupDeletion("7")).contents, (response as { contents: unknown }).contents);
  assert.deepEqual(requests.at(-1), { method: "GET", path: "/api/v1/host/groups/7/deletion", body: null });
  response = { status: "scheduled", group: pending };
  const scheduled = await client.deleteGroup("7", "team");
  assert.deepEqual(requests.at(-1), { method: "POST", path: "/api/v1/host/groups/7/deletion", body: { confirm_path: "team" } });
  assert.deepEqual(scheduled, { status: "scheduled", group: { id: "7", fullPath: "team-deleting-7", name: "Team", kind: "group", pendingDeletion: true, deletionRoot: "team-deleting-7", can: { createSubgroup: false, manageMembers: false, rename: false, delete: false, restore: true } } });
  response = { group: active };
  const restored = await client.restoreGroup("7");
  assert.deepEqual(requests.at(-1), { method: "POST", path: "/api/v1/host/groups/7/restore", body: {} });
  assert.equal(restored.pendingDeletion, undefined);
  assert.equal(restored.can.restore, undefined);
  assert.equal(restored.fullPath, "team");
  response = { status: "deleted" };
  assert.deepEqual(await client.deleteGroup("7", "team"), { status: "deleted" });

  // An older Space's 404 is a refusal, not permission to invoke its
  // legacy permanently destructive endpoint (DR-193).
  response = { error: { code: "not_found", message: "Unsupported operation" } };
  status = 404;
  const before = requests.length;
  await assert.rejects(client.deleteGroup("7", "team"), HostError);
  assert.equal(requests.length, before + 1);
  assert.ok(requests.every((request) => request.method !== "DELETE"));
  status = 200;
  for (const malformed of [{}, { status: "scheduled", group: active }, { status: "scheduled", group: { ...pending, id: "other" } }]) {
    response = malformed;
    await assert.rejects(client.deleteGroup("7", "team"), (error) => error instanceof HostError && error.code === "malformed_answer");
  }
  response = { group: pending };
  await assert.rejects(client.restoreGroup("7"), (error) => error instanceof HostError && error.code === "malformed_answer");
  for (const contents of [undefined, [{ kind: "other", name: "hidden" }], [{ kind: "project", name: "" }]]) {
    response = { group: active, contents };
    await assert.rejects(client.inspectGroupDeletion("7"), (error) => error instanceof HostError && error.code === "malformed_answer");
  }
});
