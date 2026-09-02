// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SET-17/18 coverage over the inline-agent ops (DR-019):
// comment-preserving merge-patch round-trips, scalar-to-block
// promotion, hand-written field survival, and launcher-parity
// rejection that leaves the file untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyConfigOp,
  editConfigFile,
  type AgentPatch,
} from "./config-edit.js";
import { templatePath, type LoadModule } from "./config.js";
import { ARTIFACT_SCHEMAS } from "./config.js";

function stubEntry(id: string, roles: string[]) {
  return {
    id,
    command: id,
    intent: `${id} stub`,
    artifactSchema: ARTIFACT_SCHEMAS[0],
    requiredRoleIds: roles,
    validateOptions: () => ({}),
    createRuntime: () => ({}),
  };
}

const stubLoader: LoadModule = async (specifier) => {
  if (specifier === "@sublang/playbook/code/registry") {
    return { default: stubEntry("code", ["coder"]) };
  }
  if (specifier === "@sublang/playbook/review/registry") {
    return { default: stubEntry("review", ["coder", "reviewer"]) };
  }
  if (specifier === "@sublang/playbook/decide/registry") {
    return { default: stubEntry("decide", ["coder", "reviewer"]) };
  }
  if (specifier === "@sublang/playbook/dev/registry") {
    return { default: stubEntry("dev", ["analyst"]) };
  }
  if (specifier === "@stub/other") {
    return { default: stubEntry("other", ["helper"]) };
  }
  throw new Error(`no module ${specifier}`);
};

function templateFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "spex-edit-"));
  const path = join(dir, "playbook.config.yaml");
  writeFileSync(path, readFileSync(templatePath(), "utf8"));
  return path;
}

/** Every comment in the text, content-level (the yaml library may
 * normalize spacing before inline comments). */
function comments(text: string): string[] {
  return text.split("\n").flatMap((line) => {
    const index = line.indexOf("#");
    return index >= 0 ? [line.slice(index).trim()] : [];
  });
}

function assertCommentsSurvive(before: string, after: string): void {
  const afterComments = new Set(comments(after));
  for (const comment of comments(before)) {
    assert.ok(afterComments.has(comment), `lost comment: ${comment}`);
  }
}

test("captain.set merge patch preserves comments and unrelated keys", async () => {
  const path = templateFile();
  const before = readFileSync(path, "utf8");
  const result = await editConfigFile(
    path,
    { kind: "captain.set", patch: { model: "claude-opus-4-9", effort: "max" } },
    stubLoader,
  );
  assert.equal(result.ok, true);
  const after = readFileSync(path, "utf8");
  // Every comment in the template survives the edit (the patched
  // captain keys carry no inline comments of their own).
  assertCommentsSurvive(before, after);
  // Only the provided keys changed; the rest of the block and every
  // unrelated key are untouched.
  assert.match(after, /captain:\n\s+adapter: claude\n\s+model: claude-opus-4-9\n\s+effort: max/);
  assert.match(after, /claude-opus-5/);
});

test("player.set merge patch swaps a lane's vendor in place", async () => {
  const path = templateFile();
  const before = readFileSync(path, "utf8");
  const result = await editConfigFile(
    path,
    {
      kind: "player.set",
      playerId: "dev.reviewer",
      patch: { adapter: "codex", model: "gpt-5.5" },
    },
    stubLoader,
  );
  assert.equal(result.ok, true);
  const after = readFileSync(path, "utf8");
  // The role's own inline comment survives on the patched pair.
  assert.match(
    after,
    /dev\.reviewer:\n\s+adapter: codex[^\n]*\n\s+model: gpt-5\.5\n\s+effort: xhigh/,
  );
  // Unrelated lanes and their comments survive, byte for byte: the
  // coder's block as the installed template wrote it.
  const coderBlock = before.slice(
    before.indexOf("  dev.coder:"),
    before.indexOf("\n\n", before.indexOf("  dev.coder:")),
  );
  assert.ok(after.includes(coderBlock), "the coder lane is untouched");
  const option = await editConfigFile(
    path,
    {
      kind: "playbook.option.set",
      playbookId: "review",
      key: "focus",
      value: "committed-phases",
    },
    stubLoader,
  );
  assert.equal(option.ok, true);
  assert.match(readFileSync(path, "utf8"), /focus: committed-phases/);
});

test("a scalar shorthand becomes a block on first edit", () => {
  const text = `captain: claude\nplayers:\n  dev.coder: claude\n  dev.reviewer: codex\nplaybooks:\n  code:\n    from: "@sublang/playbook/code/registry"\n    roles:\n      coder: dev.coder\n`;
  const captain = applyConfigOp(text, {
    kind: "captain.set",
    patch: { model: "claude-test" },
  });
  assert.match(captain, /captain:\n\s+adapter: claude\n\s+model: claude-test/);
  const player = applyConfigOp(captain, {
    kind: "player.set",
    playerId: "dev.coder",
    patch: { effort: "high" },
  });
  assert.match(player, /dev\.coder:\n\s+adapter: claude\n\s+effort: high/);
  // The untouched scalar stays as written.
  assert.match(player, /dev\.reviewer: codex/);
});

test("hand-written fields survive a model/effort patch", () => {
  const text = `captain:
  adapter: claude
  model: claude-opus-4-8
  instruction: keep answers short  # hand-written
  permissions:
    mode: auto
    shellExecute: ask
players:
  dev.coder: claude
  dev.reviewer: claude
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`;
  const patched = applyConfigOp(text, {
    kind: "captain.set",
    patch: { model: "claude-opus-4-9", effort: "high" },
  });
  assert.match(patched, /model: claude-opus-4-9/);
  assert.match(patched, /effort: high/);
  assert.match(patched, /instruction: keep answers short/);
  assert.match(patched, /# hand-written/);
  assert.match(patched, /shellExecute: ask/);
  assert.match(patched, /mode: auto/);
});

test("an effort patch retires the legacy reasoningEffort key", () => {
  const text = `captain:
  adapter: claude
  reasoningEffort: low
players:
  dev.coder:
    adapter: claude
    reasoningEffort: low
  dev.reviewer: claude
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`;
  const captain = applyConfigOp(text, {
    kind: "captain.set",
    patch: { effort: "high" },
  });
  assert.match(captain, /captain:\n\s+adapter: claude\n\s+effort: high/);
  const player = applyConfigOp(captain, {
    kind: "player.set",
    playerId: "dev.coder",
    patch: { effort: "xhigh" },
  });
  assert.doesNotMatch(player, /reasoningEffort/);
  assert.match(player, /dev\.coder:\n\s+adapter: claude\n\s+effort: xhigh/);
});

test("playbook.add binds its roles to session players", async () => {
  const path = templateFile();
  // A binding may only name a lane that exists, so the lane is minted
  // first — the order the compile flow uses (DR-032).
  const minted = await editConfigFile(
    path,
    { kind: "player.set", playerId: "dev.helper", patch: { adapter: "claude" } },
    stubLoader,
  );
  assert.equal(minted.ok, true);
  const result = await editConfigFile(
    path,
    {
      kind: "playbook.add",
      playbookId: "other",
      from: "@stub/other",
      roles: { helper: "dev.helper" },
      options: { committer: "helper" },
    },
    stubLoader,
  );
  assert.equal(result.ok, true);
  const after = readFileSync(path, "utf8");
  assert.match(after, /other:\n\s+from: "@stub\/other"/);
  // Enabling binds roles to lanes; the lanes live in their own map.
  assert.match(after, /roles:\n\s+helper: dev\.helper/);
  assert.match(after, /committer: helper/);
});

test("edits the launcher would reject never reach the file", async () => {
  const path = templateFile();
  const before = readFileSync(path, "utf8");

  const badAdapter = await editConfigFile(
    path,
    { kind: "captain.set", patch: { adapter: "mystery" } },
    stubLoader,
  );
  assert.equal(badAdapter.ok, false);
  assert.match(badAdapter.error ?? "", /Unknown adapter "mystery"/);
  assert.equal(readFileSync(path, "utf8"), before);

  // Effort validation is adapter-scoped at composition (DR-019): a
  // value the block's adapter refuses fails closed the same way.
  const badEffort = await editConfigFile(
    path,
    {
      kind: "player.set",
      playerId: "dev.reviewer",
      patch: { effort: "off" },
    },
    stubLoader,
  );
  assert.equal(badEffort.ok, false);
  assert.match(
    badEffort.error ?? "",
    /effort "off" is not supported by the "claude" adapter/,
  );
  assert.equal(readFileSync(path, "utf8"), before);
});

test("the retired profile key never survives an edit", async () => {
  // A hand-typed profiles-era survivor on the target block is dropped
  // by the merge patch rather than written back.
  const dir = mkdtempSync(join(tmpdir(), "spex-edit-"));
  const path = join(dir, "playbook.config.yaml");
  writeFileSync(
    path,
    `captain:
  adapter: claude
  profile: legacy-opus
players:
  dev.coder: claude
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`,
  );
  const result = await editConfigFile(
    path,
    { kind: "captain.set", patch: { model: "claude-test" } },
    stubLoader,
  );
  assert.equal(result.ok, true);
  const after = readFileSync(path, "utf8");
  assert.doesNotMatch(after, /profile:/);
  assert.match(after, /model: claude-test/);

  // A profile key smuggled into the patch input itself is stripped too.
  const smuggled = applyConfigOp(after, {
    kind: "captain.set",
    patch: { profile: "sneak", effort: "high" } as unknown as AgentPatch,
  });
  assert.doesNotMatch(smuggled, /profile:/);
  assert.match(smuggled, /effort: high/);
});

test("a fastMode patch writes the key, null removes it, comments kept (DR-038)", async () => {
  const path = templateFile();
  const before = readFileSync(path, "utf8");
  // The template's dev.coder lane runs in fast mode under a comment
  // that documents that very key.
  assert.match(before, /dev\.coder:(?:\n\s+.*)*?\n\s+fastMode: true/);
  const attached = comments(before).filter(
    (comment) =>
      comment.startsWith("# Adapter-scoped fast mode") ||
      comment.startsWith("# omitting it takes the provider default"),
  );
  assert.equal(attached.length, 2);

  // null removes the key; every comment but the two on it survives.
  const off = await editConfigFile(
    path,
    { kind: "player.set", playerId: "dev.coder", patch: { fastMode: null } },
    stubLoader,
  );
  assert.ok(off.ok, off.error ?? "edit refused");
  const afterOff = readFileSync(path, "utf8");
  assert.doesNotMatch(afterOff, /^\s+fastMode:/m);
  const survivors = new Set(comments(afterOff));
  for (const comment of comments(before)) {
    if (attached.includes(comment)) continue;
    assert.ok(survivors.has(comment), `lost comment: ${comment}`);
  }

  // true and false both write the key.
  const on = await editConfigFile(
    path,
    { kind: "captain.set", patch: { fastMode: true } },
    stubLoader,
  );
  assert.ok(on.ok, on.error ?? "edit refused");
  const literalOff = await editConfigFile(
    path,
    { kind: "player.set", playerId: "dev.reviewer", patch: { fastMode: false } },
    stubLoader,
  );
  assert.ok(literalOff.ok, literalOff.error ?? "edit refused");
  const afterOn = readFileSync(path, "utf8");
  assert.match(afterOn, /captain:(?:\n\s+.*)*?\n\s+fastMode: true/);
  assert.match(afterOn, /dev\.reviewer:(?:\n\s+.*)*?\n\s+fastMode: false/);
  assertCommentsSurvive(afterOff, afterOn);
});

test("applyConfigOp on an empty file creates the mapping", () => {
  const text = applyConfigOp("", {
    kind: "captain.set",
    patch: { adapter: "claude" },
  });
  assert.match(text, /captain:\n\s+adapter: claude/);
});

test("an explicit null unsets a pinned key (DR-019)", () => {
  const text = `captain:
  adapter: claude
  model: claude-opus-4-8
  effort: high
  instruction: keep answers short
`;
  const patched = applyConfigOp(text, {
    kind: "captain.set",
    patch: { adapter: "claude", model: null },
  });
  assert.doesNotMatch(patched, /model:/);
  // Only the nulled key goes; everything else — including the
  // hand-written instruction — survives.
  assert.match(patched, /effort: high/);
  assert.match(patched, /instruction: keep answers short/);
});
