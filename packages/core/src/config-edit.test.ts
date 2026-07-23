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

function stubEntry(id: string, roles: string[]) {
  return {
    id,
    command: id,
    intent: `${id} stub`,
    requiredRoleIds: roles,
    validateOptions: () => ({}),
    createRuntime: () => ({}),
  };
}

const stubLoader: LoadModule = async (specifier) => {
  if (specifier === "@sublang/playbook/code/registry") {
    return { default: stubEntry("code", ["coder", "reviewer"]) };
  }
  if (specifier === "@sublang/playbook/discuss/registry") {
    return { default: stubEntry("discuss", ["host", "participant"]) };
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
  assert.deepEqual(profileReferences(text, "claude-opus"), [
    "captain",
    "playbooks.code.players.reviewer",
    "playbooks.discuss.players.host",
    "playbooks.discuss.players.participant",
  ]);
  assert.deepEqual(profileReferences(text, "claude-opus-1m"), [
    "playbooks.code.players.coder",
  ]);
  assert.deepEqual(profileReferences(text, "unused"), []);
});

test("applyConfigOp on an empty file creates the mapping", () => {
  const text = applyConfigOp("", { kind: "captain.set", ref: "claude" });
  assert.match(text, /captain: claude/);
});

test("profile.patch merges without touching other fields or comments", () => {
  const text = `profiles:
  claude-opus:
    adapter: claude
    model: claude-opus-4-8
    instruction: keep answers short  # hand-written
    permissions:
      mode: auto
      shellExecute: ask
captain: claude-opus
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    players:
      coder: claude-opus
`;
  const patched = applyConfigOp(text, {
    kind: "profile.patch",
    id: "claude-opus",
    patch: { effort: "high" },
  });
  assert.match(patched, /effort: high/);
  assert.match(patched, /instruction: keep answers short/);
  assert.match(patched, /# hand-written/);
  assert.match(patched, /shellExecute: ask/);
  assert.match(patched, /model: claude-opus-4-8/);
});

test("profile.patch with effort retires the legacy reasoningEffort key", () => {
  const text = `profiles:
  claude-opus:
    adapter: claude
    reasoningEffort: low
`;
  const patched = applyConfigOp(text, {
    kind: "profile.patch",
    id: "claude-opus",
    patch: { effort: "high" },
  });
  assert.match(patched, /effort: high/);
  assert.doesNotMatch(patched, /reasoningEffort/);
});
