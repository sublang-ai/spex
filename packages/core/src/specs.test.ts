// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SPECV coverage: fixture spec trees in the DR-012 packages layout
// driving parseSpecTree, path confinement for specs.read, an
// end-to-end parse of the staged Academy corpus, and one protocol
// round-trip through the service.

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

import { parseSpecTree, resolveSpecPath } from "./specs.js";
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
      "# AUTH: GitHub Login",
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
      "### AUTH-2",
      "",
      "Written first. Second sentence dropped from the digest.",
      "",
      "### AUTH-1",
      "",
      "Written second, citing [AUTH-2](#auth-2) twice —",
      "[AUTH-2](#auth-2) — plus [META-1](../../meta.md#meta-1) and a",
      "record link [DR-000](../../decisions/000-x.md) with no anchor.",
      "",
      "## Internal Behavior",
      "",
      "### AUTH-3",
      "",
      "Internal invariant.",
      "",
      "## Verification",
      "",
      "### AUTH-4",
      "",
      "Where a stub exists, the suite shall assert sign-in",
      "([AUTH-1](#auth-1), [AUTH-2](#auth-2)).",
      "",
    ].join("\n"),
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.present, true);
  assert.equal(tree.legacy, false);
  assert.equal(tree.files.length, 1);

  const auth = file(tree, "identity/auth");
  assert.equal(auth.kind, "package");
  assert.equal(auth.path, "specs/packages/identity/auth.md");
  assert.equal(auth.dir, "identity");
  assert.equal(auth.basename, "auth");
  assert.equal(auth.shortForm, "AUTH");
  assert.equal(auth.title, "GitHub Login");
  assert.equal(auth.intent, "Sign-in intent across two lines.");
  assert.deepEqual(auth.notices, []);

  // Document order, never ID order (META-12).
  assert.deepEqual(
    auth.items.map((entry) => entry.id),
    ["AUTH-2", "AUTH-1", "AUTH-3", "AUTH-4"],
  );
  assert.deepEqual(
    auth.items.map((entry) => entry.group),
    ["external", "external", "internal", "test"],
  );
  assert.equal(item(auth, "AUTH-2").section, "External Behavior");
  assert.equal(item(auth, "AUTH-3").section, "Internal Behavior");
  assert.equal(item(auth, "AUTH-4").section, "Verification");
  assert.equal(item(auth, "AUTH-2").topic, undefined);
  assert.equal(item(auth, "AUTH-2").firstLine, "Written first.");
  // Cites: ordered, unique, cross-file allowed, no-anchor links skipped.
  assert.deepEqual(item(auth, "AUTH-1").cites, ["AUTH-2", "META-1"]);
  assert.deepEqual(item(auth, "AUTH-4").cites, ["AUTH-1", "AUTH-2"]);
  assert.deepEqual(item(auth, "AUTH-2").cites, []);
});

test("composition file maps Binding/Scenario/Tests and captures topics", () => {
  const dir = fixture({
    "specs/compositions/playback.md": [
      "# PLAY: Lesson Playback",
      "",
      "## Intent",
      "",
      "The flagship journey.",
      "",
      "## Binding",
      "",
      "### Providers",
      "",
      "#### PLAY-1",
      "",
      "Where the player needs media, the deployment shall serve it",
      "via [VID-5](../packages/catalog/video.md#vid-5).",
      "",
      "## Scenario",
      "",
      "### Journeys",
      "",
      "#### PLAY-2",
      "",
      "When a visitor opens a lesson, the site shall play it",
      "([PLAY-1](#play-1)).",
      "",
      "## Tests",
      "",
      "### PLAY-3",
      "",
      "Where a fixture course exists, the suite shall assert playback",
      "([PLAY-2](#play-2), [VID-5](../packages/catalog/video.md#vid-5)).",
      "",
    ].join("\n"),
  });
  const play = file(parseSpecTree(dir), "playback");
  assert.equal(play.kind, "composition");
  assert.equal(play.path, "specs/compositions/playback.md");
  assert.equal(play.dir, "");
  assert.equal(play.basename, "playback");
  assert.equal(play.shortForm, "PLAY");
  assert.deepEqual(play.notices, []);

  const binding = item(play, "PLAY-1");
  assert.equal(binding.group, "internal");
  assert.equal(binding.section, "Binding");
  assert.equal(binding.topic, "Providers");
  assert.deepEqual(binding.cites, ["VID-5"]);

  const scenario = item(play, "PLAY-2");
  assert.equal(scenario.group, "external");
  assert.equal(scenario.section, "Scenario");
  assert.equal(scenario.topic, "Journeys");
  assert.deepEqual(scenario.cites, ["PLAY-1"]);

  const check = item(play, "PLAY-3");
  assert.equal(check.group, "test");
  assert.equal(check.section, "Tests");
  assert.equal(check.topic, undefined);
  assert.deepEqual(check.cites, ["PLAY-2", "VID-5"]);
});

test("a ### item between a topic and a #### item clears the topic", () => {
  const dir = fixture({
    "specs/packages/mix.md": [
      "# MIX: Mixed Levels",
      "",
      "## External Behavior",
      "",
      "### Topic A",
      "",
      "#### MIX-1",
      "",
      "Topical.",
      "",
      "### MIX-2",
      "",
      "Flat item.",
      "",
      "#### MIX-3",
      "",
      "The nearest ### above is an item, so no topic.",
      "",
    ].join("\n"),
  });
  const mix = file(parseSpecTree(dir), "mix");
  assert.equal(item(mix, "MIX-1").topic, "Topic A");
  assert.equal(item(mix, "MIX-2").topic, undefined);
  assert.equal(item(mix, "MIX-3").topic, undefined);
});

// ---------------------------------------------------------------------------
// Short form
// ---------------------------------------------------------------------------

test("H1 without the short-form pattern falls back to the majority prefix", () => {
  const dir = fixture({
    "specs/packages/run-view.md": [
      "# Run View Notes",
      "",
      "## External Behavior",
      "",
      "### RUN-1",
      "",
      "A.",
      "",
      "### RUN-2",
      "",
      "B.",
      "",
      "### RNU-3",
      "",
      "Typo prefix.",
      "",
    ].join("\n"),
  });
  const run = file(parseSpecTree(dir), "run-view");
  assert.equal(run.shortForm, "RUN");
  assert.equal(run.title, "Run View Notes");
  assert.deepEqual(run.notices, ["mixed item prefixes: RUN, RNU"]);
});

test("H1 short form disagreeing with the majority prefix adds a notice", () => {
  const dir = fixture({
    "specs/packages/settings.md":
      "# CFG: Settings\n\n## External Behavior\n\n### SET-1\n\nA.\n\n### SET-2\n\nB.\n",
  });
  const settings = file(parseSpecTree(dir), "settings");
  assert.equal(settings.shortForm, "CFG");
  assert.equal(settings.title, "Settings");
  assert.deepEqual(settings.notices, [
    "short form CFG disagrees with the majority item prefix SET",
  ]);
});

test("itemless file without a short-form H1 has no short form", () => {
  const dir = fixture({
    "specs/packages/empty.md": "# Notes only\n\n## Intent\n\nNo items yet.\n",
  });
  const empty = file(parseSpecTree(dir), "empty");
  assert.equal(empty.shortForm, undefined);
  assert.equal(empty.title, "Notes only");
  assert.deepEqual(empty.notices, []);
});

// ---------------------------------------------------------------------------
// Item metadata
// ---------------------------------------------------------------------------

test("items under unexpected sections get a notice and default group", () => {
  const dir = fixture({
    "specs/packages/odd.md": [
      "# ODD: Odd Sections",
      "",
      "## Flow",
      "",
      "### ODD-1",
      "",
      "Under an unknown section.",
      "",
      "### ODD-2",
      "",
      "Same section, one notice.",
      "",
      "## References",
      "",
      "### ODD-3",
      "",
      "References holds no items.",
      "",
    ].join("\n"),
  });
  const odd = file(parseSpecTree(dir), "odd");
  assert.deepEqual(
    odd.items.map((entry) => entry.id),
    ["ODD-1", "ODD-2", "ODD-3"],
  );
  for (const entry of odd.items) assert.equal(entry.group, "external");
  assert.equal(item(odd, "ODD-1").section, "Flow");
  assert.deepEqual(odd.notices, [
    'items under unexpected section "Flow"',
    'items under unexpected section "References"',
  ]);
});

test("fenced ### lines start no item and fenced links never cite", () => {
  const dir = fixture({
    "specs/packages/fen.md": [
      "# FEN: Fences",
      "",
      "## External Behavior",
      "",
      "### FEN-1",
      "",
      "Body with a fence:",
      "",
      "```text",
      "### NOT-2",
      "see [FEN-9](#fen-9)",
      "```",
      "",
      "Tail line citing [FEN-3](#fen-3).",
      "",
    ].join("\n"),
  });
  const fen = file(parseSpecTree(dir), "fen");
  assert.equal(fen.items.length, 1);
  assert.match(fen.items[0].text, /### NOT-2/);
  assert.match(fen.items[0].text, /Tail line/);
  assert.deepEqual(fen.items[0].cites, ["FEN-3"]);
});

test("first sentence digest falls back to the whole first line", () => {
  const dir = fixture({
    "specs/packages/dig.md": [
      "# DIG: Digests",
      "",
      "## External Behavior",
      "",
      "### DIG-1",
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
    "specs/packages/new.md": "# NEW: New\n\n## External Behavior\n\n### NEW-1\n\nA.\n",
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

test("a top-level file named like a legacy dir is unknown, not legacy", () => {
  const dir = fixture({
    "specs/user": "a stray file, not a directory\n",
    "specs/packages/x.md": "# X: X\n\n## External Behavior\n\n### X-1\n\nA.\n",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.legacy, false);
  assert.deepEqual(tree.notices, ["unknown entries under specs/: user"]);
  assert.equal(tree.files.length, 1);
});

// ---------------------------------------------------------------------------
// Records (decisions/, iterations/)
// ---------------------------------------------------------------------------

test("decisions and iterations parse id, title, and path sorted by filename", () => {
  const dir = fixture({
    "specs/decisions/011-project-workspace.md":
      "# DR-011: Project workspace\n\nBody.\n",
    "specs/decisions/002-arch.md": "# Architecture only\n",
    "specs/iterations/001-first.md": "# IR-001: First iteration\n",
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
  assert.deepEqual(tree.iterations, [
    { id: "IR-001", title: "First iteration", path: "iterations/001-first.md" },
  ]);
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

test("unknown top-level entries produce one tree notice", () => {
  const dir = fixture({
    "specs/packages/auth.md":
      "# AUTH: A\n\n## External Behavior\n\n### AUTH-1\n\nOne.\n",
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
      "# AUTH: A\n\n## External Behavior\n\n### AUTH-1\n\nFine.\n",
    "specs/packages/broken.md":
      "# BRK: B\n\n## External Behavior\n\n### BRK-1\n\nUnreadable.\n",
  });
  chmodSync(join(dir, "specs", "packages", "broken.md"), 0o000);
  const tree = parseSpecTree(dir);
  const broken = file(tree, "broken");
  assert.match(broken.error ?? "", /cannot read file/);
  assert.deepEqual(broken.items, []);
  assert.equal(broken.kind, "package");
  // The bad file never poisons its neighbors.
  assert.equal(file(tree, "auth").items.length, 1);
  chmodSync(join(dir, "specs", "packages", "broken.md"), 0o644);
});

posixTest("a symlink escaping the project is skipped with a notice", () => {
  const outside = mkdtempSync(join(tmpdir(), "spex-outside-"));
  writeFileSync(
    join(outside, "secret.md"),
    "# SECRET: S\n\n## External Behavior\n\n### SEC-1\n\nHidden.\n",
  );
  const dir = fixture({
    "specs/packages/auth.md":
      "# AUTH: A\n\n## External Behavior\n\n### AUTH-1\n\nOne.\n",
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

  const packages = tree.files.filter((entry) => entry.kind === "package");
  const compositions = tree.files.filter(
    (entry) => entry.kind === "composition",
  );
  assert.equal(packages.length, 6);
  assert.equal(compositions.length, 6);
  for (const entry of tree.files) {
    assert.equal(entry.error, undefined, entry.path);
    assert.ok(entry.shortForm, `short form on ${entry.path}`);
    assert.ok(entry.intent, `intent on ${entry.path}`);
  }

  // Spot-check a package: topics on #### items, cites from links.
  const auth = file(tree, "identity/github-login");
  assert.equal(auth.shortForm, "AUTH");
  assert.equal(auth.title, "GitHub Login");
  const authCheck = item(auth, "AUTH-10");
  assert.equal(authCheck.group, "test");
  assert.equal(authCheck.section, "Verification");
  assert.equal(authCheck.topic, "Sign-In Coverage");
  assert.deepEqual(authCheck.cites, ["AUTH-1", "AUTH-2", "AUTH-4"]);

  // At least one composition item carries citations.
  const play = file(tree, "lesson-playback");
  assert.equal(play.kind, "composition");
  const journey = item(play, "PLAY-1");
  assert.equal(journey.group, "external");
  assert.equal(journey.section, "Scenario");
  assert.deepEqual(journey.cites, ["CAT-2", "VID-6", "AUTH-2", "VID-5"]);
  assert.ok(
    compositions.some((entry) =>
      entry.items.some((candidate) => candidate.cites.length > 0),
    ),
  );

  assert.deepEqual(
    tree.decisions.map((record) => record.id),
    ["DR-000", "DR-001", "DR-002", "DR-003"],
  );
  assert.deepEqual(
    tree.iterations.map((record) => record.id),
    ["IR-001", "IR-002", "IR-003"],
  );
});

// ---------------------------------------------------------------------------
// Confinement
// ---------------------------------------------------------------------------

test("resolveSpecPath confines reads to specs/", () => {
  const dir = fixture({ "specs/packages/auth.md": "# AUTH: A\n" });
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
  const dir = fixture({ "specs/packages/auth.md": "# AUTH: A\n" });
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
      "# AUTH: A\n\n## External Behavior\n\n### AUTH-1\n\nOne sentence.\n",
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
    assert.equal(state.files[0]?.kind, "package");

    const read = await call("specs.read", { projectId, path: "packages/auth.md" });
    assert.equal(read.ok, true);
    assert.match((read.result as { markdown: string }).markdown, /AUTH-1/);

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
