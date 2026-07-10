// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SET-17/18 coverage: comment-preserving round-trips and
// launcher-parity rejection that leaves the file untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyConfigOp, editConfigFile, profileReferences } from "./config-edit.js";
import { templatePath, type LoadModule } from "./config.js";

const stubLoader: LoadModule = async (specifier) => {
  if (specifier === "@sublang/playbook/code/registry") {
    return {
      default: {
        id: "code",
        command: "code",
        intent: "coding",
        requiredRoleIds: ["coder", "reviewer"],
        idleStateId: "ready",
        finalStateId: "done",
        parkStateIds: [],
        validateOptions: () => ({}),
        createRuntime: () => ({}),
      },
    };
  }
  throw new Error(`no module ${specifier}`);
};

function templateFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "spex-edit-"));
  const path = join(dir, "playbook.config.yaml");
  writeFileSync(path, readFileSync(templatePath(), "utf8"));
  return path;
}

test("profile.save preserves comments and unrelated keys", async () => {
  const path = templateFile();
  const before = readFileSync(path, "utf8");
  const result = await editConfigFile(
    path,
    {
      kind: "profile.save",
      id: "gemini-flash",
      profile: { adapter: "gemini", model: "gemini-3-flash" },
    },
    stubLoader,
  );
  assert.equal(result.ok, true);
  const after = readFileSync(path, "utf8");
  // Every comment in the template survives the edit (content-level;
  // the yaml library may normalize spacing before inline comments).
  const comments = (text: string): string[] =>
    text
      .split("\n")
      .flatMap((line) => {
        const index = line.indexOf("#");
        return index >= 0 ? [line.slice(index).trim()] : [];
      });
  const afterComments = new Set(comments(after));
  for (const comment of comments(before)) {
    assert.ok(afterComments.has(comment), `lost comment: ${comment}`);
  }
  // Unrelated keys and values are untouched.
  assert.match(after, /claude-opus-4-8\[1m\]/);
  assert.match(after, /committer: coder/);
  assert.match(after, /gemini-flash:\n\s+adapter: gemini/);
});

test("edits the launcher would reject never reach the file", async () => {
  const path = templateFile();
  const before = readFileSync(path, "utf8");
  const result = await editConfigFile(
    path,
    { kind: "captain.set", ref: "no-such-profile" },
    stubLoader,
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Unknown adapter "no-such-profile"/);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("profile collision with adapter shorthand is rejected", async () => {
  const path = templateFile();
  const result = await editConfigFile(
    path,
    { kind: "profile.save", id: "claude", profile: { adapter: "claude" } },
    stubLoader,
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /collides with the "claude" adapter shorthand/);
});

test("player mapping and option edits round-trip", async () => {
  const path = templateFile();
  const setPlayer = await editConfigFile(
    path,
    {
      kind: "playbook.player.set",
      playbookId: "code",
      role: "reviewer",
      ref: "claude-opus",
    },
    stubLoader,
  );
  assert.equal(setPlayer.ok, true);
  const setOption = await editConfigFile(
    path,
    {
      kind: "playbook.option.set",
      playbookId: "code",
      key: "committer",
      value: "reviewer",
    },
    stubLoader,
  );
  assert.equal(setOption.ok, true);
  const text = readFileSync(path, "utf8");
  assert.match(text, /reviewer: claude-opus/);
  assert.match(text, /committer: reviewer/);
});

test("profileReferences finds captain and player references", () => {
  const text = readFileSync(templatePath(), "utf8");
  assert.deepEqual(profileReferences(text, "claude-opus"), ["captain"]);
  assert.deepEqual(profileReferences(text, "codex-gpt"), [
    "playbooks.code.players.reviewer",
  ]);
  assert.deepEqual(profileReferences(text, "unused"), []);
});

test("applyConfigOp on an empty file creates the mapping", () => {
  const text = applyConfigOp("", { kind: "captain.set", ref: "claude" });
  assert.match(text, /captain: claude/);
});
