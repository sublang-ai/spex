// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";

import { PACKAGE_LICENSE_PATTERN, parseCommand, PROTOCOL_VERSION, REPOSITORY_KEY_PATTERN } from "./protocol.js";

test("protocol version is a positive integer", () => {
  assert.ok(Number.isInteger(PROTOCOL_VERSION) && PROTOCOL_VERSION >= 1);
});

test("parseCommand accepts a valid command from JSON text", () => {
  const parsed = parseCommand(
    JSON.stringify({ type: "turn.submit", id: "c1", sessionId: "s1", text: "go" }),
  );
  assert.ok(parsed.ok);
  if (parsed.ok) {
    assert.equal(parsed.command.type, "turn.submit");
    assert.equal(parsed.command.id, "c1");
  }
});

test("parseCommand accepts subscribe with a channel", () => {
  const parsed = parseCommand({
    type: "subscribe",
    id: "c2",
    channel: { kind: "debug", sessionId: "s1" },
  });
  assert.ok(parsed.ok);
});

test("parseCommand rejects non-JSON text without a state change", () => {
  const parsed = parseCommand("{nope");
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.match(parsed.error, /JSON/);
});

test("parseCommand rejects unknown command types but recovers the id", () => {
  const parsed = parseCommand({ type: "definitely.not.a.command", id: "c3" });
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.equal(parsed.id, "c3");
});

test("parseCommand rejects missing required fields", () => {
  const parsed = parseCommand({ type: "turn.submit", id: "c4", sessionId: "s1" });
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.match(parsed.error, /text/);
});

test("parseCommand rejects empty submission text", () => {
  const parsed = parseCommand({
    type: "turn.submit",
    id: "c5",
    sessionId: "s1",
    text: "",
  });
  assert.ok(!parsed.ok);
});

test("parseCommand accepts the space commands and their optional fields", () => {
  const repository = "alice/a-spex";
  const ok = [
    { type: "space.get", id: "s1" },
    { type: "space.remote.set", id: "s3", repository, url: null },
    { type: "space.fetch", id: "s4", repository },
    { type: "space.sync", id: "s5", repository, choices: { "sessions/a": "remote" }, join: true, noticed: true },
    { type: "space.cancel", id: "s6", repository },
    { type: "space.diff", id: "s7", repository, unit: ".gitignore", path: ".gitignore", side: "mine" },
    { type: "space.tree", id: "s8", repository: "acme/platform/a-spex" },
    { type: "space.read", id: "s9", repository, path: "project.json" },
  ];
  for (const command of ok) {
    const parsed = parseCommand(command);
    assert.ok(parsed.ok, `${command.type}: ${parsed.ok ? "" : parsed.error}`);
  }
  // Every clone is a repository from creation; Initialize is gone.
  assert.ok(!parseCommand({ type: "space.init", id: "s2" }).ok);
});

test("space-29, space-82, space-98, space-99: a space command names the instance it acts at by its origin, a group with its instance, a placement left or attached by its instance — an Attach with whether its notice was seen — and a sign-in the URL as the reader gave it", () => {
  const instance = "https://spex.pub";
  const repository = "@spex.pub/acme/a-spex";
  const named = [
    { type: "space.signin.start", id: "i1", url: "HTTPS://Spex.pub/" },
    { type: "space.signout", id: "i2", instance },
    { type: "space.pick", id: "i3", repository: "ada/a-spex", choice: { kind: "join", instance, hostId: "42" } },
    { type: "space.pick", id: "i4", repository: "ada/a-spex", choice: { kind: "create", instance, groupId: null, name: "a" } },
    { type: "space.join", id: "i5", instance, hostId: "42", folder: "~/code/a" },
    { type: "space.members", id: "i6", instance, group: "7" },
    { type: "space.group.create", id: "i7", instance, name: "Acme", path: "acme", parent: null },
    { type: "space.group.rename", id: "i8", instance, group: "7", name: "Acme Corp" },
    { type: "space.group.delete", id: "i9", instance, group: "7" },
    { type: "space.share", id: "i10", instance, group: "7", login: "bob", role: "30" },
    { type: "space.unshare", id: "i11", instance, group: "7", login: "bob" },
    { type: "space.members", id: "i12", repository },
    { type: "space.forget", id: "i13", instance },
    { type: "space.place", id: "i14", repository, choice: { kind: "join", instance: "https://second.example", hostId: "7" }, noticed: true },
    { type: "space.place", id: "i15", repository, choice: { kind: "create", instance: "https://second.example", groupId: null, name: "a" } },
    { type: "space.leave", id: "i16", repository, instance: "https://second.example" },
    { type: "space.leave", id: "i17", repository, instance, confirmed: true },
    { type: "space.attach", id: "i18", repository, instance: "https://second.example", noticed: true },
  ];
  for (const command of named) {
    const parsed = parseCommand(command);
    assert.ok(parsed.ok, `${command.type}: ${parsed.ok ? "" : parsed.error}`);
  }
  // A command acting at an instance names it, and a sign-in its URL:
  // none stands in for a default; an Attach says whether its notice was
  // seen.
  for (const command of [
    { type: "space.signin.start", id: "d1" },
    { type: "space.signin.start", id: "d2", url: "" },
    { type: "space.signout", id: "d3" },
    { type: "space.pick", id: "d4", repository: "ada/a-spex", choice: { kind: "join", hostId: "42" } },
    { type: "space.pick", id: "d5", repository: "ada/a-spex", choice: { kind: "create", groupId: null, name: "a" } },
    { type: "space.place", id: "d10", repository, choice: { kind: "join", hostId: "42" } },
    { type: "space.place", id: "d11", repository, choice: { kind: "create", groupId: null, name: "a" } },
    { type: "space.leave", id: "d12", repository },
    { type: "space.leave", id: "d13", repository, instance: "", confirmed: true },
    { type: "space.attach", id: "d14", repository, noticed: true },
    { type: "space.attach", id: "d15", repository, instance },
    { type: "space.join", id: "d6", hostId: "42" },
    { type: "space.group.create", id: "d7", name: "Acme", path: "acme", parent: null },
    { type: "space.group.rename", id: "d8", group: "7", name: "Acme Corp" },
    { type: "space.group.delete", id: "d9", group: "7" },
  ]) {
    const parsed = parseCommand(command);
    assert.ok(!parsed.ok, JSON.stringify(command));
    if (!parsed.ok) assert.equal(parsed.id, command.id);
  }
  // A group is named with its instance; a spex repository by its key
  // alone, which names its own.
  for (const command of [
    { type: "space.members", id: "g1", group: "7" },
    { type: "space.share", id: "g2", group: "7", login: "bob", role: "30" },
    { type: "space.unshare", id: "g3", group: "7", login: "bob" },
  ]) {
    const parsed = parseCommand(command);
    assert.ok(!parsed.ok, JSON.stringify(command));
    if (!parsed.ok) {
      assert.equal(parsed.id, command.id);
      assert.match(parsed.error, /a group is named with its instance/);
    }
  }
  for (const command of [
    { type: "space.share", id: "k1", repository, login: "bob", role: "30" },
    { type: "space.unshare", id: "k2", repository, login: "bob" },
  ]) {
    const parsed = parseCommand(command);
    assert.ok(parsed.ok, `${command.type}: ${parsed.ok ? "" : parsed.error}`);
  }
  // An instance is named by a string, never blank; nothing else names it.
  for (const command of [
    { type: "space.signout", id: "r1", instance: "" },
    { type: "space.join", id: "r2", instance: 7, hostId: "42" },
    { type: "space.signin.start", id: "r3", url: null },
    { type: "space.refresh", id: "r4", instance },
    // Forget names the instance it removes, always (space-82).
    { type: "space.forget", id: "r6" },
    { type: "space.forget", id: "r7", instance: "" },
    { type: "space.forget", id: "r8", instance, repository },
  ]) {
    assert.ok(!parseCommand(command).ok, JSON.stringify(command));
  }
});

test("space-29: a sync, a diff and a move name the placement they are for, an instance's origin or null for the path placement, or omit it", () => {
  const instance = "https://spex.pub";
  const repository = "@spex.pub/acme/a-spex";
  for (const command of [
    { type: "space.sync", id: "p1", repository, placement: instance, noticed: true },
    { type: "space.sync", id: "p2", repository, placement: null, choices: { "sessions/a": "remote" } },
    { type: "space.sync", id: "p3", repository, placement: instance, join: true },
    { type: "space.sync", id: "p4", repository },
    { type: "space.diff", id: "p5", repository, unit: ".gitignore", path: ".gitignore", side: "remote", placement: instance },
    { type: "space.diff", id: "p6", repository, unit: ".gitignore", path: ".gitignore", side: "remote", placement: null },
    { type: "space.repository.move", id: "p7", repository, instance, groupId: "7" },
    { type: "space.repository.move", id: "p8", repository, groupId: null },
  ]) {
    const parsed = parseCommand(command);
    assert.ok(parsed.ok, `${command.type}: ${parsed.ok ? "" : parsed.error}`);
    if (parsed.ok && "placement" in command) assert.equal((parsed.command as { placement?: unknown }).placement, command.placement, "the placement reaches the core as sent");
    if (parsed.ok && "instance" in command) assert.equal((parsed.command as { instance?: unknown }).instance, command.instance, "the placement's instance reaches the core as sent");
  }
  // A placement is an origin, never blank, never another kind.
  for (const command of [
    { type: "space.sync", id: "q1", repository, placement: "" },
    { type: "space.sync", id: "q2", repository, placement: 7 },
    { type: "space.diff", id: "q3", repository, unit: ".gitignore", path: ".gitignore", side: "remote", placement: "" },
    { type: "space.repository.move", id: "q4", repository, instance: "", groupId: null },
    { type: "space.repository.move", id: "q5", repository, instance: null, groupId: null },
  ]) {
    assert.ok(!parseCommand(command).ok, JSON.stringify(command));
  }
});

test("space-29: a space command names its repository by key", () => {
  for (const repository of [undefined, "a-spex/", "alice/a", "../a-spex", ""]) {
    const parsed = parseCommand({ type: "space.fetch", id: "k1", ...(repository !== undefined ? { repository } : {}) });
    assert.ok(!parsed.ok, String(repository));
  }
});

test("storage: a key's segments are spelled as the host spells its paths", () => {
  // Letters of either case, digits, `.`, `_` and `-`: a host's group or
  // repository name stands as a segment unchanged.
  for (const key of ["alice/a-spex", "a-spex", "Alice/a-spex", "Acme.Corp/platform_team/web.app-spex", "_ops/x_y-spex", "acme/sub.group/a..b-spex"]) {
    assert.ok(REPOSITORY_KEY_PATTERN.test(key), key);
    assert.ok(parseCommand({ type: "space.fetch", id: "k1", repository: key }).ok, key);
  }
  // Never a segment starting with a dot or a hyphen, never an empty
  // segment, never a name without `-spex`, nothing outside the set.
  for (const key of [".hidden/a-spex", "alice/.a-spex", "alice/..-spex", "-x/a-spex", "alice/-spex", "alice//a-spex", "/alice/a-spex", "alice/a b-spex", "alice/a+b-spex", "alice/a-spex.git", "alice/a-Spex", "-spex"]) {
    assert.ok(!REPOSITORY_KEY_PATTERN.test(key), key);
    assert.ok(!parseCommand({ type: "space.fetch", id: "k1", repository: key }).ok, key);
  }
});

test("storage: a key may begin with its instance's folder, and only there may a segment begin with @", () => {
  // DR-127: `@<host>` in lowercase with `_<port>` where the origin
  // names one, as the key's first segment alone.
  for (const key of ["@spex.pub/acme/a-spex", "@127.0.0.1_4100/ada/x-spex", "@internal.spex.pub/acme/platform/web-spex", "@a-b.example_65535/ada/x-spex", "@h_1/acme/a-spex"]) {
    assert.ok(REPOSITORY_KEY_PATTERN.test(key), key);
    assert.ok(parseCommand({ type: "space.fetch", id: "k1", repository: key }).ok, key);
  }
  // Never a host with capitals, `@` past the first segment, an empty
  // host or port, `_` in the host, two ports, or the folder alone; never
  // a host with an empty, leading or trailing label or one starting or
  // ending with `-`, a port of 0, above 65535 or with a leading zero;
  // never a name directly under the instance's folder, with no group or
  // login before it.
  for (const key of [
    "@Spex.pub/a-spex", "acme/@h/a-spex", "@/a-spex", "@h_/a-spex", "@spex_pub/a-spex", "@h_80_1/a-spex", "@h/@g/a-spex", "@spex.pub-spex", "@spex.pub/", "@spex.pub//a-spex",
    "@spex..pub/acme/a-spex", "@.spex.pub/acme/a-spex", "@spex.pub./acme/a-spex", "@-spex.pub/acme/a-spex", "@spex-.pub/acme/a-spex",
    "@h_0/acme/a-spex", "@h_080/acme/a-spex", "@h_65536/acme/a-spex", "@h_99999/acme/a-spex",
    "@spex.pub/a-spex", "@127.0.0.1_4100/x-spex",
  ]) {
    assert.ok(!REPOSITORY_KEY_PATTERN.test(key), key);
    assert.ok(!parseCommand({ type: "space.fetch", id: "k1", repository: key }).ok, key);
  }
});

test("parseCommand rejects a space command with an unknown field or side", () => {
  const extra = parseCommand({ type: "space.get", id: "s1", verbose: true });
  assert.ok(!extra.ok);
  const side = parseCommand({
    type: "space.sync",
    id: "s2",
    repository: "alice/a-spex",
    choices: { "sessions/a": "theirs" },
  });
  assert.ok(!side.ok);
  const missing = parseCommand({ type: "space.read", id: "s3", repository: "alice/a-spex" });
  assert.ok(!missing.ok);
  if (!missing.ok) assert.match(missing.error, /path/);
});

test("core-service-42: an intent is queued with no place of its own; move and link are gone", () => {
  assert.ok(parseCommand({ type: "intent.queue", id: "q1", projectId: "alice/a-spex", text: "do it" }).ok);
  assert.ok(!parseCommand({ type: "intent.move", id: "q2", intentId: "i", afterIntentId: null }).ok);
  assert.ok(!parseCommand({ type: "intent.link", id: "q3", intentId: "i", afterIntentId: null }).ok);
});

test("media-4: media owners name a repository by key and an intent by its UUID", () => {
  const assetId = `sha256:${"a".repeat(64)}`;
  const read = (owner: unknown) => parseCommand({ type: "media.read", id: "m1", owner, assetId, offset: 0, length: 10 });
  assert.ok(read({ kind: "project", id: "alice/a-spex" }).ok);
  assert.ok(read({ kind: "intent", projectId: "alice/a-spex", intentId: "72000000-0000-4000-8000-000000000001" }).ok);
  assert.ok(read({ kind: "draft", projectId: "alice/a-spex", id: "triage", instance: "72000000-0000-4000-8000-000000000002" }).ok);
  assert.ok(!read({ kind: "draft", projectId: "alice/a-spex", id: "triage" }).ok, "a draft owner names its instance");
  assert.ok(!read({ kind: "project", id: "72000000-0000-4000-8000-000000000001" }).ok);
  assert.ok(!read({ kind: "intent", projectId: "alice/a-spex", intentId: "A" }).ok);
  assert.ok(!read({ kind: "draft", id: "triage" }).ok);
});

test("environments-17: a search names the spex repository whose environment's registry it asks", () => {
  assert.ok(parseCommand({ type: "environment.search", id: "e1", repository: "alice/a-spex", query: "lint" }).ok);
  assert.ok(parseCommand({ type: "environment.search", id: "e2", repository: "@spex.pub/acme/a-spex", query: "" }).ok);
  for (const fields of [{ query: "lint" }, { repository: "alice/a", query: "lint" }, { repository: "alice/a-spex" }, { repository: "alice/a-spex", query: "x".repeat(201) }]) {
    assert.ok(!parseCommand({ type: "environment.search", id: "e3", ...fields }).ok, JSON.stringify(fields));
  }
});

test("core-service-128: the server commands name a server by its instance and its id; consent is the open's alone", () => {
  assert.ok(parseCommand({ type: "server.list", id: "s1" }).ok);
  assert.ok(parseCommand({ type: "server.open", id: "s2", instance: "https://spex.pub", serverId: "srv_1", consented: true }).ok);
  // Without consent the open still parses: the core refuses it itself.
  assert.ok(parseCommand({ type: "server.open", id: "s3", instance: "https://spex.pub", serverId: "srv_1" }).ok);
  assert.ok(parseCommand({ type: "server.close", id: "s4", instance: "https://spex.pub", serverId: "srv_1" }).ok);
  for (const command of [
    { type: "server.list", id: "s5", instance: "https://spex.pub" },
    { type: "server.open", id: "s6", instance: "https://spex.pub", consented: true },
    { type: "server.open", id: "s7", instance: "https://spex.pub", serverId: "", consented: true },
    { type: "server.open", id: "s8", instance: "https://spex.pub", serverId: "srv_1", consented: "yes" },
    { type: "server.close", id: "s9", instance: "https://spex.pub", serverId: "srv_1", consented: true },
  ]) {
    assert.ok(!parseCommand(command).ok, JSON.stringify(command));
  }
});

test("projects-9: removal takes an optional confirmation; rebind names a key and no revision", () => {
  assert.ok(parseCommand({ type: "project.remove", id: "p1", projectId: "alice/a-spex", confirm: true }).ok);
  assert.ok(parseCommand({ type: "project.rebind", id: "p2", projectId: "alice/a-spex", path: "/w/a", aliases: ["/old/a"] }).ok);
  assert.ok(!parseCommand({ type: "project.rebind", id: "p3", projectId: "alice/a-spex", path: "/w/a", revision: "HEAD" }).ok);
});
// Playbook drafts (DR-058): the draft channel and the draft.* family.

test("parseCommand accepts subscribe with a draft channel", () => {
  const parsed = parseCommand({
    type: "subscribe",
    id: "d1",
    channel: { kind: "draft", draftId: "triage" },
  });
  assert.ok(parsed.ok);
});

test("parseCommand rejects a draft channel without a draft id", () => {
  const parsed = parseCommand({ type: "subscribe", id: "d2", channel: { kind: "draft" } });
  assert.ok(!parsed.ok);
});

test("parseCommand accepts every draft command", () => {
  const commands = [
    { type: "draft.list", id: "d3" },
    { type: "draft.defaults", id: "d4a", projectId: "alice/a-spex" },
    { type: "draft.create", id: "d4", projectId: "alice/a-spex", draftId: "triage", org: "acme", license: "Apache-2.0" },
    { type: "draft.open", id: "d5", projectId: "alice/a-spex", draftId: "triage", afterSeq: 4 },
    { type: "draft.send", id: "d6", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002", text: "Compile it." },
    { type: "draft.abort", id: "d7", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002" },
    { type: "draft.source.write", id: "d8", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002", content: "# Triage", baseVersion: "v1" },
    { type: "draft.source.write", id: "d9", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002", sourcePath: "/tmp/triage.md" },
    { type: "draft.compile", id: "d10", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002" },
    {
      type: "draft.register",
      id: "d11",
      projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002",
      command: "triage",
      intent: "Triage a new issue",
      bindings: { Triager: "dev.triager", Verifier: "dev.reviewer" },
      newPlayers: { "dev.triager": { adapter: "claude", model: "opus" } },
    },
    { type: "draft.player.set", id: "d12", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002", playerId: "dev.reviewer" },
    { type: "draft.player.set", id: "d13", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002", playerId: null },
    { type: "draft.delete", id: "d14", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002" },
    { type: "draft.delete", id: "d14b", projectId: "alice/a-spex", draftId: "triage", fileVersion: "ab".repeat(32) },
    { type: "draft.artifacts", id: "d15", projectId: "alice/a-spex", draftId: "triage" },
  ];
  for (const command of commands) {
    const parsed = parseCommand(command);
    assert.ok(parsed.ok, `${command.type}: ${parsed.ok ? "" : parsed.error}`);
    if (parsed.ok) assert.equal(parsed.command.type, command.type);
  }
});

test("parseCommand rejects a draft id outside the Agent Skills name rule", () => {
  for (const draftId of ["Triage", "with space", "", "a_b", "-lead", "trail-", "dou--ble", "x".repeat(65)]) {
    const parsed = parseCommand({ type: "draft.create", id: "d16", projectId: "alice/a-spex", draftId, org: "acme", license: "MIT" });
    assert.ok(!parsed.ok, draftId);
    if (!parsed.ok) assert.match(parsed.error, /draftId/);
  }
});

test("a new playbook's license holds one line, never empty or edged with spaces, and draft.create names both fields", () => {
  for (const license of ["MIT", "Apache-2.0", "MIT OR Apache-2.0", "LicenseRef-Acme"]) assert.ok(PACKAGE_LICENSE_PATTERN.test(license), license);
  for (const license of ["", " MIT", "MIT ", "MIT\nOR Apache-2.0"]) assert.ok(!PACKAGE_LICENSE_PATTERN.test(license), JSON.stringify(license));
  assert.ok(!parseCommand({ type: "draft.create", id: "d20", projectId: "alice/a-spex", draftId: "triage" }).ok, "both are required");
  assert.ok(!parseCommand({ type: "draft.create", id: "d21", projectId: "alice/a-spex", draftId: "triage", org: "acme" }).ok, "the license is required");
});

test("parseCommand rejects an empty draft message", () => {
  const parsed = parseCommand({ type: "draft.send", id: "d17", projectId: "alice/a-spex", draftId: "triage", instance: "72000000-0000-4000-8000-000000000002", text: "" });
  assert.ok(!parsed.ok);
});

test("parseCommand rejects a command on an existing draft that names no instance", () => {
  for (const command of [
    { type: "draft.send", id: "d19", projectId: "alice/a-spex", draftId: "triage", text: "x" },
    { type: "draft.abort", id: "d20", projectId: "alice/a-spex", draftId: "triage" },
    { type: "draft.compile", id: "d21", projectId: "alice/a-spex", draftId: "triage", instance: "not-a-uuid" },
  ]) assert.ok(!parseCommand(command).ok, command.type);
});

test("parseCommand rejects a draft registration missing its fields", () => {
  const parsed = parseCommand({
    type: "draft.register",
    id: "d18",
    projectId: "alice/a-spex", draftId: "triage",
    command: "triage",
    bindings: { Triager: "Not A Player" },
  });
  assert.ok(!parsed.ok);
  if (!parsed.ok) {
    assert.match(parsed.error, /intent/);
    assert.match(parsed.error, /bindings/);
  }
});
