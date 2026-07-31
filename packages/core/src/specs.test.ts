// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SPECV coverage: fixture spec trees in the packages-only layout
// (DR-012, DR-021) driving parseSpecTree, path confinement for
// specs.read, an end-to-end parse of the staged Academy corpus, and
// one protocol round-trip through the service.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

import { parseSpecFileText, parseSpecTree, resolveSpecPath } from "./specs.js";
import { CoreService } from "./service.js";
import type { SpecFileInfo, SpecItemInfo, SpecTreeState } from "./protocol.js";

const posixTest = process.platform === "win32" ? test.skip : test;

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "spex-specs-"));
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  return dir;
}

function file(tree: SpecTreeState, key: string): SpecFileInfo {
  const found = tree.files.find((entry) => entry.key === key);
  assert.ok(
    found,
    `file ${key} in ${JSON.stringify(tree.files.map((f) => f.key))}`,
  );
  return found;
}

function item(info: SpecFileInfo, id: string): SpecItemInfo {
  const found = info.items.find((entry) => entry.id === id);
  assert.ok(
    found,
    `item ${id} in ${JSON.stringify(info.items.map((i) => i.id))}`,
  );
  return found;
}

// ---------------------------------------------------------------------------
// Tree shape
// ---------------------------------------------------------------------------

test("no specs/ directory reports present: false", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-specs-"));
  const tree = parseSpecTree(dir);
  assert.equal(tree.present, false);
  assert.equal(tree.legacy, false);
  assert.deepEqual(tree.files, []);
  assert.deepEqual(tree.decisions, []);
  assert.deepEqual(tree.notices, []);
  assert.ok(tree.readAt > 0);
});

test("package file parses sections, items, and citations", () => {
  const dir = fixture({
    "specs/packages/identity/auth.md": [
      "# auth: GitHub Login",
      "",
      "## Intent",
      "",
      "Sign-in intent",
      "across two lines.",
      "",
      "Second paragraph ignored.",
      "",
      "## External Behavior",
      "",
      "### auth-2",
      "",
      "Written first. Second sentence dropped from the digest.",
      "",
      "### auth-1",
      "",
      "Written second, citing [auth-2](#auth-2) twice —",
      "[auth-2](#auth-2) — plus [meta-1](../../meta.md#meta-1) and a",
      "record link [DR-000](../../decisions/000-x.md) with no anchor.",
      "",
      "## Internal Behavior",
      "",
      "### auth-3",
      "",
      "Internal invariant.",
      "",
      "## Verification",
      "",
      "### auth-4",
      "",
      "Where a stub exists, the suite shall assert sign-in",
      "([auth-1](#auth-1), [auth-2](#auth-2)).",
      "",
    ].join("\n"),
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.present, true);
  assert.equal(tree.legacy, false);
  assert.equal(tree.files.length, 1);

  const auth = file(tree, "identity/auth");
  assert.equal(auth.path, "specs/packages/identity/auth.md");
  // The collection subdirectory is navigation only (meta-31); the
  // basename alone is the package identifier (meta-10).
  assert.equal(auth.dir, "identity");
  assert.equal(auth.basename, "auth");
  assert.equal(auth.title, "GitHub Login");
  assert.equal(auth.intent, "Sign-in intent across two lines.");
  assert.deepEqual(auth.notices, []);
  // The retired collection fields never reappear on the wire.
  assert.ok(!("kind" in auth));
  assert.ok(!("shortForm" in auth));

  // Document order, never ID order (meta-12).
  assert.deepEqual(
    auth.items.map((entry) => entry.id),
    ["auth-2", "auth-1", "auth-3", "auth-4"],
  );
  assert.deepEqual(
    auth.items.map((entry) => entry.group),
    ["external", "external", "internal", "test"],
  );
  assert.equal(item(auth, "auth-2").section, "External Behavior");
  assert.equal(item(auth, "auth-3").section, "Internal Behavior");
  assert.equal(item(auth, "auth-4").section, "Verification");
  assert.equal(item(auth, "auth-2").topic, undefined);
  assert.equal(item(auth, "auth-2").firstLine, "Written first.");
  // Cites: ordered, unique, cross-file allowed, no-anchor links skipped.
  assert.deepEqual(item(auth, "auth-1").cites, ["auth-2", "meta-1"]);
  assert.deepEqual(item(auth, "auth-4").cites, ["auth-1", "auth-2"]);
  assert.deepEqual(item(auth, "auth-2").cites, []);
});

test("digests drop enclosed citations and unwrap plain links", () => {
  const file = parseSpecFileText(
    [
      "# guard: Guard",
      "",
      "## External Behavior",
      "",
      "### guard-1",
      "",
      "Where the manager is designated admin-only [[role-3](../identity/role.md#role-3)], the manager shall hide [drafts](../catalog/course.md) from visitors.",
      "",
    ].join("\n"),
    "guard",
  );
  assert.equal(
    file.items[0].firstLine,
    "Where the manager is designated admin-only, the manager shall hide drafts from visitors.",
  );
});

test("digests strip inline-code backticks but keep the code content", () => {
  const file = parseSpecFileText(
    [
      "# guard: Guard",
      "",
      "## External Behavior",
      "",
      "### guard-1",
      "",
      "The `specs/` directory shall list ``a ` b`` under [`root`](../meta.md) only.",
      "",
    ].join("\n"),
    "guard",
  );
  assert.equal(
    file.items[0].firstLine,
    "The specs/ directory shall list a ` b under root only.",
  );
});

test("a ### item between a topic and a #### item clears the topic", () => {
  const dir = fixture({
    "specs/packages/mix.md": [
      "# mix: Mixed Levels",
      "",
      "## External Behavior",
      "",
      "### Topic A",
      "",
      "#### mix-1",
      "",
      "Topical.",
      "",
      "### mix-2",
      "",
      "Flat item.",
      "",
      "#### mix-3",
      "",
      "The nearest ### above is an item, so no topic.",
      "",
    ].join("\n"),
  });
  const mix = file(parseSpecTree(dir), "mix");
  assert.equal(item(mix, "mix-1").topic, "Topic A");
  assert.equal(item(mix, "mix-2").topic, undefined);
  assert.equal(item(mix, "mix-3").topic, undefined);
});

// ---------------------------------------------------------------------------
// Package identifier (basename; spec-view-11)
// ---------------------------------------------------------------------------

test("H1 and item-ID prefixes disagreeing with the basename are noticed", () => {
  const dir = fixture({
    "specs/packages/github-login.md": [
      "# AUTH: GitHub Login",
      "",
      "## External Behavior",
      "",
      "### AUTH-1",
      "",
      "A.",
      "",
      "### AUTH-2",
      "",
      "The same stray prefix notices once, not per item.",
      "",
      "### login-3",
      "",
      "A second stray prefix notices separately.",
      "",
    ].join("\n"),
  });
  const login = file(parseSpecTree(dir), "github-login");
  // The basename wins as the package identifier (meta-10); every
  // disagreement is named (spec-view-11).
  assert.equal(login.basename, "github-login");
  assert.equal(login.title, "GitHub Login");
  assert.equal(login.items.length, 3);
  assert.deepEqual(login.notices, [
    'H1 identifier "AUTH" disagrees with basename "github-login"',
    'item-ID prefix "AUTH" disagrees with basename "github-login"',
    'item-ID prefix "login" disagrees with basename "github-login"',
  ]);
});

test("an old-generation ALLCAPS file still parses, degraded to notices", () => {
  const dir = fixture({
    "specs/packages/auth.md": [
      "# AUTH: GitHub Login",
      "",
      "## External Behavior",
      "",
      "### AUTH-1",
      "",
      "Old ids keep parsing as items.",
      "",
      "## Verification",
      "",
      "### AUTH-2",
      "",
      "The suite shall assert sign-in ([AUTH-1](#auth-1)).",
      "",
    ].join("\n"),
  });
  const auth = file(parseSpecTree(dir), "auth");
  assert.equal(auth.title, "GitHub Login");
  assert.deepEqual(
    auth.items.map((entry) => [entry.id, entry.group]),
    [
      ["AUTH-1", "external"],
      ["AUTH-2", "test"],
    ],
  );
  assert.deepEqual(item(auth, "AUTH-2").cites, ["AUTH-1"]);
  assert.deepEqual(auth.notices, [
    'H1 identifier "AUTH" disagrees with basename "auth"',
    'item-ID prefix "AUTH" disagrees with basename "auth"',
  ]);
});

test("H1 without the identifier pattern is a plain title, not a disagreement", () => {
  const dir = fixture({
    "specs/packages/run-view.md": [
      "# Run View Notes",
      "",
      "## External Behavior",
      "",
      "### run-view-1",
      "",
      "A.",
      "",
    ].join("\n"),
  });
  const run = file(parseSpecTree(dir), "run-view");
  assert.equal(run.title, "Run View Notes");
  assert.deepEqual(run.notices, []);
});

test("an itemless file keeps its title with no notices", () => {
  const dir = fixture({
    "specs/packages/empty.md": "# Notes only\n\n## Intent\n\nNo items yet.\n",
  });
  const empty = file(parseSpecTree(dir), "empty");
  assert.equal(empty.title, "Notes only");
  assert.equal(empty.intent, "No items yet.");
  assert.deepEqual(empty.notices, []);
});

// ---------------------------------------------------------------------------
// Item metadata
// ---------------------------------------------------------------------------

test("items under unexpected sections get a notice and default group", () => {
  const dir = fixture({
    "specs/packages/odd.md": [
      "# odd: Odd Sections",
      "",
      "## Flow",
      "",
      "### odd-1",
      "",
      "Under an unknown section.",
      "",
      "### odd-2",
      "",
      "Same section, one notice.",
      "",
      "## References",
      "",
      "### odd-3",
      "",
      "References holds no items.",
      "",
    ].join("\n"),
  });
  const odd = file(parseSpecTree(dir), "odd");
  assert.deepEqual(
    odd.items.map((entry) => entry.id),
    ["odd-1", "odd-2", "odd-3"],
  );
  for (const entry of odd.items) assert.equal(entry.group, "external");
  assert.equal(item(odd, "odd-1").section, "Flow");
  assert.deepEqual(odd.notices, [
    'items under unexpected section "Flow"',
    'items under unexpected section "References"',
  ]);
});

test("fenced ### lines start no item and fenced links never cite", () => {
  const dir = fixture({
    "specs/packages/fen.md": [
      "# fen: Fences",
      "",
      "## External Behavior",
      "",
      "### fen-1",
      "",
      "Body with a fence:",
      "",
      "```text",
      "### not-2",
      "see [fen-9](#fen-9)",
      "```",
      "",
      "Tail line citing [fen-3](#fen-3).",
      "",
    ].join("\n"),
  });
  const fen = file(parseSpecTree(dir), "fen");
  assert.equal(fen.items.length, 1);
  assert.match(fen.items[0].text, /### not-2/);
  assert.match(fen.items[0].text, /Tail line/);
  assert.deepEqual(fen.items[0].cites, ["fen-3"]);
  assert.deepEqual(fen.notices, []);
});

test("first sentence digest falls back to the whole first line", () => {
  const dir = fixture({
    "specs/packages/dig.md": [
      "# dig: Digests",
      "",
      "## External Behavior",
      "",
      "### dig-1",
      "",
      "No sentence end on this line",
      "so the digest is the whole line.",
      "",
    ].join("\n"),
  });
  const dig = file(parseSpecTree(dir), "dig");
  assert.equal(dig.items[0].firstLine, "No sentence end on this line");
});

// ---------------------------------------------------------------------------
// Legacy layout detection
// ---------------------------------------------------------------------------

test("a user/dev/test directory flags the tree legacy with empty files", () => {
  const dir = fixture({
    "specs/user/auth.md": "# AUTH\n\n### AUTH-1\n\nOld layout.\n",
    "specs/packages/new.md": "# new: New\n\n## External Behavior\n\n### new-1\n\nA.\n",
    "specs/decisions/001-arch.md": "# DR-001: Architecture\n",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.present, true);
  assert.equal(tree.legacy, true);
  assert.deepEqual(tree.files, []);
  assert.deepEqual(tree.notices, []);
  // Records still parse in legacy mode.
  assert.deepEqual(tree.decisions, [
    { id: "DR-001", title: "Architecture", path: "decisions/001-arch.md" },
  ]);
});

test("a compositions/ directory flags the tree legacy with empty files", () => {
  const dir = fixture({
    "specs/compositions/playback.md":
      "# playback: Playback\n\n## Binding\n\n### playback-1\n\nRetired collection.\n",
    "specs/packages/new.md": "# new: New\n\n## External Behavior\n\n### new-1\n\nA.\n",
    "specs/decisions/001-arch.md": "# DR-001: Architecture\n",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.present, true);
  assert.equal(tree.legacy, true);
  // Nothing parses from any collection — the packages file included.
  assert.deepEqual(tree.files, []);
  assert.deepEqual(tree.notices, []);
  assert.deepEqual(tree.decisions, [
    { id: "DR-001", title: "Architecture", path: "decisions/001-arch.md" },
  ]);
});

test("a top-level file named like a legacy dir is unknown, not legacy", () => {
  const dir = fixture({
    "specs/user": "a stray file, not a directory\n",
    "specs/compositions": "a stray file, not a directory\n",
    "specs/packages/x.md": "# x: X\n\n## External Behavior\n\n### x-1\n\nA.\n",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.legacy, false);
  assert.deepEqual(tree.notices, [
    "unknown entries under specs/: compositions, user",
  ]);
  assert.equal(tree.files.length, 1);
});

// ---------------------------------------------------------------------------
// Records (decisions/, intents/)
// ---------------------------------------------------------------------------

test("decisions and intents parse id, title, and path sorted by filename", () => {
  const dir = fixture({
    "specs/decisions/011-project-workspace.md":
      "# DR-011: Project workspace\n\nBody.\n",
    "specs/decisions/002-arch.md": "# Architecture only\n",
    "specs/intents/001-first.md": "# IR-001: First intent\n",
  });
  const tree = parseSpecTree(dir);
  assert.deepEqual(tree.decisions, [
    { id: "DR-002", title: "Architecture only", path: "decisions/002-arch.md" },
    {
      id: "DR-011",
      title: "Project workspace",
      path: "decisions/011-project-workspace.md",
    },
  ]);
  assert.deepEqual(tree.intents, [
    { id: "IR-001", title: "First intent", path: "intents/001-first.md" },
  ]);
});

test("duplicate record numbers are kept and noticed", () => {
  const dir = fixture({
    "specs/decisions/001-first.md": "# DR-001: First\n",
    "specs/decisions/001-second.md": "# DR-001: Second\n",
    "specs/intents/002-current.md": "# IR-002: Current\n",
    "specs/iterations/002-legacy.md": "# IR-002: Legacy\n",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.decisions.length, 2);
  assert.equal(tree.intents.length, 2);
  assert.ok(
    tree.notices.includes(
      "duplicate record id DR-001: decisions/001-first.md and decisions/001-second.md",
    ),
    JSON.stringify(tree.notices),
  );
  assert.ok(
    tree.notices.includes(
      "duplicate record id IR-002: intents/002-current.md and iterations/002-legacy.md",
    ),
    JSON.stringify(tree.notices),
  );
});

test("intent records merge a coexisting legacy iterations directory", () => {
  const dir = fixture({
    "specs/intents/001-first.md": "# IR-001: First intent\n",
    "specs/intents/003-shadowing.md": "# IR-003: Current copy\n",
    "specs/iterations/002-left-behind.md": "# IR-002: Conflict-kept\n",
    "specs/iterations/003-shadowing.md": "# IR-003: Legacy copy\n",
  });
  const tree = parseSpecTree(dir);
  assert.deepEqual(tree.intents, [
    { id: "IR-001", title: "First intent", path: "intents/001-first.md" },
    {
      id: "IR-002",
      title: "Conflict-kept",
      path: "iterations/002-left-behind.md",
    },
    { id: "IR-003", title: "Current copy", path: "intents/003-shadowing.md" },
  ]);
  assert.deepEqual(tree.notices, [
    "legacy specs/iterations/ records coexist with specs/intents/; migrate with `spex scaffold --update`",
    "iterations/003-shadowing.md is shadowed by the same-named file under intents/",
  ]);
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

test("unknown top-level entries produce one tree notice", () => {
  const dir = fixture({
    "specs/packages/auth.md":
      "# auth: A\n\n## External Behavior\n\n### auth-1\n\nOne.\n",
    "specs/rogue.txt": "not a spec\n",
    "specs/extra.md": "# stray\n",
    "specs/scratch/x.md": "# stray dir\n",
    "specs/.DS_Store": "junk",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.notices.length, 1);
  assert.equal(
    tree.notices[0],
    "unknown entries under specs/: extra.md, rogue.txt, scratch",
  );
  assert.equal(tree.files.length, 1);
});

posixTest("an unreadable file degrades to a per-file error", () => {
  const dir = fixture({
    "specs/packages/auth.md":
      "# auth: A\n\n## External Behavior\n\n### auth-1\n\nFine.\n",
    "specs/packages/broken.md":
      "# broken: B\n\n## External Behavior\n\n### broken-1\n\nUnreadable.\n",
  });
  chmodSync(join(dir, "specs", "packages", "broken.md"), 0o000);
  const tree = parseSpecTree(dir);
  const broken = file(tree, "broken");
  assert.match(broken.error ?? "", /cannot read file/);
  assert.deepEqual(broken.items, []);
  assert.equal(broken.basename, "broken");
  // The bad file never poisons its neighbors.
  assert.equal(file(tree, "auth").items.length, 1);
  chmodSync(join(dir, "specs", "packages", "broken.md"), 0o644);
});

posixTest("a symlink escaping the project is skipped with a notice", () => {
  const outside = mkdtempSync(join(tmpdir(), "spex-outside-"));
  writeFileSync(
    join(outside, "secret.md"),
    "# secret: S\n\n## External Behavior\n\n### secret-1\n\nHidden.\n",
  );
  const dir = fixture({
    "specs/packages/auth.md":
      "# auth: A\n\n## External Behavior\n\n### auth-1\n\nOne.\n",
  });
  symlinkSync(
    join(outside, "secret.md"),
    join(dir, "specs", "packages", "evil.md"),
  );
  const tree = parseSpecTree(dir);
  assert.equal(tree.files.some((entry) => entry.key === "evil"), false);
  assert.ok(
    tree.notices.some((notice) =>
      notice.includes("symlink escaping the project: specs/packages/evil.md"),
    ),
    JSON.stringify(tree.notices),
  );
});

// ---------------------------------------------------------------------------
// Academy corpus (DR-015): the staged example tree end-to-end
// ---------------------------------------------------------------------------

test("the staged Academy corpus parses end-to-end", () => {
  const academy = fileURLToPath(new URL("../assets/academy", import.meta.url));
  const tree = parseSpecTree(academy);
  assert.equal(tree.present, true);
  assert.equal(tree.legacy, false);
  assert.deepEqual(tree.notices, []);

  // The packages-only generation (DR-021): 12 package files, each
  // identified by its basename with an agreeing H1, no notices —
  // and the retired kind/shortForm fields gone from the wire.
  assert.equal(tree.files.length, 12);
  for (const entry of tree.files) {
    assert.equal(entry.error, undefined, entry.path);
    assert.deepEqual(entry.notices, [], entry.path);
    assert.ok(entry.intent, `intent on ${entry.path}`);
    assert.ok(entry.items.length > 0, `items on ${entry.path}`);
    assert.ok(!("kind" in entry), entry.path);
    assert.ok(!("shortForm" in entry), entry.path);
  }

  // Spot-check a nested package: lowercase <pack>-<N> ids, topics
  // on #### items, cites from enclosed citations (meta-11, meta-16).
  const auth = file(tree, "identity/github-login");
  assert.equal(auth.path, "specs/packages/identity/github-login.md");
  assert.equal(auth.dir, "identity");
  assert.equal(auth.basename, "github-login");
  assert.equal(auth.title, "GitHub Login");
  assert.equal(auth.items.length, 15);
  const authCheck = item(auth, "github-login-10");
  assert.equal(authCheck.group, "test");
  assert.equal(authCheck.section, "Verification");
  assert.equal(authCheck.topic, "Sign-In Coverage");
  assert.deepEqual(authCheck.cites, [
    "github-login-1",
    "github-login-2",
    "github-login-4",
    "github-login-14",
  ]);

  // A former composition parses as a package whose items cite the
  // peer behaviors they compose (meta-14).
  const play = file(tree, "lesson-playback");
  assert.equal(play.dir, "");
  assert.equal(play.basename, "lesson-playback");
  const journey = item(play, "lesson-playback-1");
  assert.equal(journey.group, "external");
  assert.equal(journey.section, "External Behavior");
  assert.deepEqual(journey.cites, [
    "course-catalog-2",
    "course-catalog-20",
    "video-library-6",
    "github-login-2",
    "video-library-5",
  ]);

  assert.deepEqual(
    tree.decisions.map((record) => record.id),
    ["DR-000", "DR-001", "DR-002", "DR-003"],
  );
  assert.deepEqual(
    tree.intents.map((record) => record.id),
    ["IR-001", "IR-002", "IR-003"],
  );
});

// ---------------------------------------------------------------------------
// Confinement
// ---------------------------------------------------------------------------

test("resolveSpecPath confines reads to specs/", () => {
  const dir = fixture({ "specs/packages/auth.md": "# auth: A\n" });
  const ok = resolveSpecPath(dir, "packages/auth.md");
  assert.equal(ok.ok, true);

  for (const bad of [
    "../secret.md",
    "packages/../../x.md",
    "/etc/hosts.md",
    "packages/auth.txt",
  ]) {
    const rejected = resolveSpecPath(dir, bad);
    assert.equal(rejected.ok, false, bad);
    if (!rejected.ok) assert.equal(rejected.code, "invalid_request", bad);
  }
  const missing = resolveSpecPath(dir, "packages/nope.md");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "not_found");
});

posixTest("resolveSpecPath rejects a symlink escaping the project", () => {
  const outside = mkdtempSync(join(tmpdir(), "spex-outside-"));
  writeFileSync(join(outside, "secret.md"), "top secret\n");
  const dir = fixture({ "specs/packages/auth.md": "# auth: A\n" });
  symlinkSync(join(outside, "secret.md"), join(dir, "specs", "evil.md"));
  const escaped = resolveSpecPath(dir, "evil.md");
  assert.equal(escaped.ok, false);
  if (!escaped.ok) assert.equal(escaped.code, "invalid_request");
});

// ---------------------------------------------------------------------------
// Service round-trip (specs.get / specs.read over the protocol)
// ---------------------------------------------------------------------------

test("specs.get and specs.read serve over the protocol", async () => {
  const home = mkdtempSync(join(tmpdir(), "spex-specs-home-"));
  const project = fixture({
    "specs/packages/auth.md":
      "# auth: A\n\n## External Behavior\n\n### auth-1\n\nOne sentence.\n",
  });
  execFileSync("git", ["init", "-q", project]);
  const service = await CoreService.start({
    token: "test",
    watchConfig: false,
    configPath: join(home, "playbook.config.yaml"),
    dbPath: ":memory:",
    home,
    env: {},
  });
  const socket = new WebSocket(`ws://127.0.0.1:${service.port()}/?token=test`);
  const replies = new Map<string, { ok: boolean; result?: unknown; error?: { code: string } }>();
  socket.on("message", (data) => {
    const message = JSON.parse(String(data)) as {
      type: string;
      id?: string;
      ok?: boolean;
      result?: unknown;
      error?: { code: string };
    };
    if (message.type === "reply" && message.id) {
      replies.set(message.id, {
        ok: message.ok === true,
        result: message.result,
        error: message.error,
      });
    }
  });
  let sequence = 0;
  const call = async (
    type: string,
    fields: Record<string, unknown>,
  ): Promise<{ ok: boolean; result?: unknown; error?: { code: string } }> => {
    const id = `s${(sequence += 1)}`;
    socket.send(JSON.stringify({ type, id, ...fields }));
    const start = Date.now();
    while (!replies.has(id)) {
      if (Date.now() - start > 5000) throw new Error(`timeout on ${type}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const reply = replies.get(id);
    if (!reply) throw new Error("unreachable");
    return reply;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    const missing = await call("specs.get", { projectId: "nope" });
    assert.equal(missing.ok, false);
    assert.equal(missing.error?.code, "not_found");

    const registered = await call("project.register", { path: project });
    assert.equal(registered.ok, true);
    const projectId = (registered.result as { id: string }).id;

    const tree = await call("specs.get", { projectId });
    assert.equal(tree.ok, true);
    const state = tree.result as SpecTreeState;
    assert.equal(state.present, true);
    assert.equal(state.legacy, false);
    assert.equal(state.files[0]?.key, "auth");
    assert.equal(state.files[0]?.basename, "auth");

    const read = await call("specs.read", { projectId, path: "packages/auth.md" });
    assert.equal(read.ok, true);
    assert.match((read.result as { markdown: string }).markdown, /auth-1/);

    const escape = await call("specs.read", { projectId, path: "../secret.md" });
    assert.equal(escape.ok, false);
    assert.equal(escape.error?.code, "invalid_request");

    const gone = await call("specs.read", { projectId, path: "packages/nope.md" });
    assert.equal(gone.ok, false);
    assert.equal(gone.error?.code, "not_found");
  } finally {
    socket.close();
    await service.stop();
  }
});

test("localized zh sections map to groups and intent parses", () => {
  const root = mkdtempSync(join(tmpdir(), "spex-specs-zh-"));
  mkdirSync(join(root, "specs", "packages"), { recursive: true });
  writeFileSync(
    join(root, "specs", "packages", "auth.md"),
    [
      "# auth: 登录",
      "",
      "## 意图",
      "",
      "本包覆盖登录行为。",
      "",
      "## 外部行为",
      "",
      "### auth-1",
      "",
      "当用户提交凭证时，站点应开启会话。",
      "",
      "## 内部行为",
      "",
      "### auth-2",
      "",
      "会话状态应仅通过加密通道传输。",
      "",
      "## 验证",
      "",
      "### auth-3",
      "",
      "测试套件应验证 [auth-1](#auth-1)。",
      "",
    ].join("\n"),
  );
  const tree = parseSpecTree(root);
  const auth = tree.files.find((f) => f.key === "auth");
  assert.equal(auth?.title, "登录");
  assert.equal(auth?.intent, "本包覆盖登录行为。");
  assert.deepEqual(
    auth?.items.map((i) => [i.id, i.group]),
    [
      ["auth-1", "external"],
      ["auth-2", "internal"],
      ["auth-3", "test"],
    ],
  );
  assert.deepEqual(auth?.notices, []);
});
