// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SPECV coverage (SPECV-30..36): fixture spec trees written to temp
// project directories driving parseSpecTree, path confinement for
// specs.read, and one protocol round-trip through the service.

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
import { WebSocket } from "ws";

import { parseSpecTree, resolveSpecPath } from "./specs.js";
import { CoreService } from "./service.js";
import type { SpecPackageInfo, SpecTreeState } from "./protocol.js";

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

function pkg(tree: SpecTreeState, key: string): SpecPackageInfo {
  const found = tree.packages.find((entry) => entry.key === key);
  assert.ok(found, `package ${key} in ${JSON.stringify(tree.packages.map((p) => p.key))}`);
  return found;
}

// ---------------------------------------------------------------------------
// Tree shape (SPECV-30)
// ---------------------------------------------------------------------------

test("no specs/ directory reports present: false", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-specs-"));
  const tree = parseSpecTree(dir);
  assert.equal(tree.present, false);
  assert.deepEqual(tree.packages, []);
  assert.deepEqual(tree.decisions, []);
  assert.deepEqual(tree.notices, []);
  assert.ok(tree.readAt > 0);
});

test("groups merge under one key and items keep document order", () => {
  const dir = fixture({
    "specs/user/auth.md": [
      "# AUTH: Demo",
      "",
      "## Intent",
      "",
      "User intent.",
      "",
      "## Flow",
      "",
      "### AUTH-2",
      "",
      "Written first.",
      "",
      "### AUTH-1",
      "",
      "Written second.",
      "",
    ].join("\n"),
    "specs/dev/auth.md": "# AUTH\n\n## Impl\n\n### AUTH-10\n\nDev item.\n",
    "specs/test/auth.md":
      "# AUTH\n\n### AUTH-20\nVerifies: [AUTH-1](../user/auth.md#auth-1)\n\nWhere fixture, the suite shall check.\n",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.present, true);
  assert.equal(tree.packages.length, 1);
  const auth = pkg(tree, "auth");
  assert.equal(auth.dir, "");
  assert.equal(auth.basename, "auth");
  assert.equal(auth.shortForm, "AUTH");
  assert.deepEqual(auth.notices, []);
  // Document order, never ID order (META-12).
  assert.deepEqual(
    auth.groups.user?.items.map((item) => item.id),
    ["AUTH-2", "AUTH-1"],
  );
  assert.equal(auth.groups.user?.path, "specs/user/auth.md");
  assert.equal(auth.groups.dev?.items[0].id, "AUTH-10");
  assert.equal(auth.groups.test?.items[0].id, "AUTH-20");
});

test("nested directory package keys by path plus basename", () => {
  const dir = fixture({
    "specs/user/flows/checkout.md": "# CHK\n\n### CHK-1\n\nOne.\n",
  });
  const checkout = pkg(parseSpecTree(dir), "flows/checkout");
  assert.equal(checkout.dir, "flows");
  assert.equal(checkout.basename, "checkout");
  assert.equal(checkout.shortForm, "CHK");
});

test("group subsets keep only their present files", () => {
  const dir = fixture({
    "specs/dev/notes.md": "# NOTES\n\n### NOTES-1\n\nOnly dev.\n",
  });
  const notes = pkg(parseSpecTree(dir), "notes");
  assert.equal(notes.groups.user, undefined);
  assert.equal(notes.groups.test, undefined);
  assert.equal(notes.groups.dev?.items.length, 1);
});

test("itemless package has no short form", () => {
  const dir = fixture({
    "specs/user/empty.md": "# EMPTY\n\n## Intent\n\nNo items yet.\n",
  });
  const empty = pkg(parseSpecTree(dir), "empty");
  assert.equal(empty.shortForm, undefined);
  assert.deepEqual(empty.notices, []);
});

// ---------------------------------------------------------------------------
// Short form (SPECV-31)
// ---------------------------------------------------------------------------

test("mixed item prefixes fall back to the majority with a notice", () => {
  const dir = fixture({
    "specs/dev/run-view.md":
      "# RUN\n\n### RUN-1\n\nA.\n\n### RUN-2\n\nB.\n\n### RNU-3\n\nTypo.\n",
  });
  const run = pkg(parseSpecTree(dir), "run-view");
  assert.equal(run.shortForm, "RUN");
  assert.deepEqual(run.notices, [
    "mixed item prefixes: RUN, RNU (dev/run-view.md)",
  ]);
});

// ---------------------------------------------------------------------------
// Basename collisions (SPECV-30)
// ---------------------------------------------------------------------------

test("same basename at different dirs stays separate with mutual notices", () => {
  const dir = fixture({
    "specs/user/auth.md": "# A\n\n### AUTH-1\n\nTop.\n",
    "specs/dev/flows/auth.md": "# A\n\n### FAUTH-1\n\nNested.\n",
  });
  const tree = parseSpecTree(dir);
  assert.equal(tree.packages.length, 2);
  assert.deepEqual(pkg(tree, "auth").notices, [
    "basename also exists at flows/auth",
  ]);
  assert.deepEqual(pkg(tree, "flows/auth").notices, [
    "basename also exists at auth",
  ]);
});

// ---------------------------------------------------------------------------
// Item metadata (SPECV-32)
// ---------------------------------------------------------------------------

test("Verifies line is extracted and excluded from firstLine", () => {
  const dir = fixture({
    "specs/test/auth.md": [
      "# AUTH",
      "",
      "## Coverage",
      "",
      "### AUTH-20",
      "Verifies: [AUTH-1](../user/auth.md#auth-1), [AUTH-10](../dev/auth.md#auth-10)",
      "",
      "Where a fixture exists, the suite shall assert it. And more.",
      "",
    ].join("\n"),
  });
  const item = pkg(parseSpecTree(dir), "auth").groups.test?.items[0];
  assert.ok(item);
  assert.deepEqual(item.verifies, ["AUTH-1", "AUTH-10"]);
  assert.equal(item.firstLine, "Where a fixture exists, the suite shall assert it.");
  // The full body still carries the Verifies line.
  assert.match(item.text, /^Verifies:/);
});

test("section is the nearest ## heading, excluding Intent and References", () => {
  const dir = fixture({
    "specs/dev/foo.md": [
      "# FOO",
      "",
      "## Intent",
      "",
      "The intent.",
      "",
      "### FOO-1",
      "",
      "Under intent.",
      "",
      "## Alpha",
      "",
      "### FOO-2 {#foo-2}",
      "",
      "Alpha **bold** item. Second sentence.",
      "",
      "## References",
      "",
      "### FOO-3",
      "",
      "After references.",
      "",
    ].join("\n"),
  });
  const items = pkg(parseSpecTree(dir), "foo").groups.dev?.items ?? [];
  assert.deepEqual(items.map((item) => item.id), ["FOO-1", "FOO-2", "FOO-3"]);
  assert.equal(items[0].section, undefined);
  assert.equal(items[1].section, "Alpha");
  assert.equal(items[1].firstLine, "Alpha **bold** item.");
  assert.equal(items[2].section, undefined);
});

test("fenced ### lines start no item and stay in the body", () => {
  const dir = fixture({
    "specs/dev/fen.md": [
      "# FEN",
      "",
      "## Alpha",
      "",
      "### FEN-1",
      "",
      "Body with a fence:",
      "",
      "```text",
      "### NOT-2",
      "```",
      "",
      "Tail line.",
      "",
    ].join("\n"),
  });
  const items = pkg(parseSpecTree(dir), "fen").groups.dev?.items ?? [];
  assert.equal(items.length, 1);
  assert.match(items[0].text, /### NOT-2/);
  assert.match(items[0].text, /Tail line\./);
});

// ---------------------------------------------------------------------------
// Intent (SPECV-33)
// ---------------------------------------------------------------------------

test("intent is the first paragraph under ## Intent, joined to one line", () => {
  const dir = fixture({
    "specs/user/auth.md": [
      "# AUTH",
      "",
      "## Intent",
      "",
      "Line one",
      "line two.",
      "",
      "Second paragraph ignored.",
      "",
      "### AUTH-1",
      "",
      "One.",
      "",
    ].join("\n"),
  });
  const auth = pkg(parseSpecTree(dir), "auth");
  assert.equal(auth.groups.user?.intent, "Line one line two.");
});

// ---------------------------------------------------------------------------
// Records (SPECV-34)
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
// Degradation (SPECV-35)
// ---------------------------------------------------------------------------

test("unknown top-level entries produce one tree notice", () => {
  const dir = fixture({
    "specs/user/auth.md": "# A\n\n### AUTH-1\n\nOne.\n",
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
  assert.equal(tree.packages.length, 1);
});

posixTest("an unreadable group file degrades to a per-file error", () => {
  const dir = fixture({
    "specs/user/auth.md": "# A\n\n### AUTH-1\n\nFine.\n",
    "specs/user/broken.md": "# B\n\n### BRK-1\n\nUnreadable.\n",
  });
  chmodSync(join(dir, "specs", "user", "broken.md"), 0o000);
  const tree = parseSpecTree(dir);
  const broken = pkg(tree, "broken");
  assert.match(broken.groups.user?.error ?? "", /cannot read file/);
  assert.deepEqual(broken.groups.user?.items, []);
  // The bad file never poisons its neighbors.
  assert.equal(pkg(tree, "auth").groups.user?.items.length, 1);
  chmodSync(join(dir, "specs", "user", "broken.md"), 0o644);
});

posixTest("a symlink escaping the project is skipped with a notice", () => {
  const outside = mkdtempSync(join(tmpdir(), "spex-outside-"));
  writeFileSync(join(outside, "secret.md"), "# SECRET\n\n### SEC-1\n\nHidden.\n");
  const dir = fixture({
    "specs/user/auth.md": "# A\n\n### AUTH-1\n\nOne.\n",
  });
  symlinkSync(join(outside, "secret.md"), join(dir, "specs", "user", "evil.md"));
  const tree = parseSpecTree(dir);
  assert.equal(tree.packages.some((entry) => entry.key === "evil"), false);
  assert.ok(
    tree.notices.some((notice) =>
      notice.includes("symlink escaping the project: specs/user/evil.md"),
    ),
    JSON.stringify(tree.notices),
  );
});

// ---------------------------------------------------------------------------
// Confinement (SPECV-36)
// ---------------------------------------------------------------------------

test("resolveSpecPath confines reads to specs/", () => {
  const dir = fixture({ "specs/user/auth.md": "# AUTH\n" });
  const ok = resolveSpecPath(dir, "user/auth.md");
  assert.equal(ok.ok, true);

  for (const bad of ["../secret.md", "user/../../x.md", "/etc/hosts.md", "user/auth.txt"]) {
    const rejected = resolveSpecPath(dir, bad);
    assert.equal(rejected.ok, false, bad);
    if (!rejected.ok) assert.equal(rejected.code, "invalid_request", bad);
  }
  const missing = resolveSpecPath(dir, "user/nope.md");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "not_found");
});

posixTest("resolveSpecPath rejects a symlink escaping the project", () => {
  const outside = mkdtempSync(join(tmpdir(), "spex-outside-"));
  writeFileSync(join(outside, "secret.md"), "top secret\n");
  const dir = fixture({ "specs/user/auth.md": "# AUTH\n" });
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
    "specs/user/auth.md": "# AUTH\n\n### AUTH-1\n\nOne sentence.\n",
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
    assert.equal(state.packages[0]?.key, "auth");

    const read = await call("specs.read", { projectId, path: "user/auth.md" });
    assert.equal(read.ok, true);
    assert.match((read.result as { markdown: string }).markdown, /AUTH-1/);

    const escape = await call("specs.read", { projectId, path: "../secret.md" });
    assert.equal(escape.ok, false);
    assert.equal(escape.error?.code, "invalid_request");

    const gone = await call("specs.read", { projectId, path: "user/nope.md" });
    assert.equal(gone.ok, false);
    assert.equal(gone.error?.code, "not_found");
  } finally {
    socket.close();
    await service.stop();
  }
});
