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
  assert.match(after, /claude-opus-4-8\[1m\]/);
  assert.match(after, /committer: coder/);
});

test("playbook.player.set merge patch swaps a role's vendor in place", async () => {
  const path = templateFile();
  const result = await editConfigFile(
    path,
    {
      kind: "playbook.player.set",
      playbookId: "code",
      role: "reviewer",
      patch: { adapter: "codex", model: "gpt-5.5" },
    },
    stubLoader,
  );
  assert.equal(result.ok, true);
  const after = readFileSync(path, "utf8");
  // The role's own inline comment survives on the patched pair.
  assert.match(after, /reviewer:\n\s+adapter: codex[^\n]*\n\s+model: gpt-5\.5\n\s+effort: xhigh/);
  // Unrelated blocks and their comments survive.
  assert.match(after, /coder:\n\s+adapter: claude\n\s+model: claude-opus-4-8\[1m\]/);
  assert.match(after, /# protected auto mode for the Claude Coder/);
  assert.match(after, /committer: coder\s+# which role commits/);
  const option = await editConfigFile(
    path,
    {
      kind: "playbook.option.set",
      playbookId: "code",
      key: "committer",
      value: "reviewer",
    },
    stubLoader,
  );
  assert.equal(option.ok, true);
  assert.match(readFileSync(path, "utf8"), /committer: reviewer/);
});

test("a scalar shorthand becomes a block on first edit", () => {
  const text = `captain: claude\nplaybooks:\n  code:\n    from: "@sublang/playbook/code/registry"\n    players:\n      coder: claude\n      reviewer: codex\n`;
  const captain = applyConfigOp(text, {
    kind: "captain.set",
    patch: { model: "claude-test" },
  });
  assert.match(captain, /captain:\n\s+adapter: claude\n\s+model: claude-test/);
  const player = applyConfigOp(captain, {
    kind: "playbook.player.set",
    playbookId: "code",
    role: "coder",
    patch: { effort: "high" },
  });
  assert.match(player, /coder:\n\s+adapter: claude\n\s+effort: high/);
  // The untouched scalar stays as written.
  assert.match(player, /reviewer: codex/);
});

test("hand-written fields survive a model/effort patch", () => {
  const text = `captain:
  adapter: claude
  model: claude-opus-4-8
  instruction: keep answers short  # hand-written
  permissions:
    mode: auto
    shellExecute: ask
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    players:
      coder: claude
      reviewer: claude
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
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    players:
      coder:
        adapter: claude
        reasoningEffort: low
      reviewer: claude
`;
  const captain = applyConfigOp(text, {
    kind: "captain.set",
    patch: { effort: "high" },
  });
  assert.match(captain, /captain:\n\s+adapter: claude\n\s+effort: high/);
  const player = applyConfigOp(captain, {
    kind: "playbook.player.set",
    playbookId: "code",
    role: "coder",
    patch: { effort: "xhigh" },
  });
  assert.doesNotMatch(player, /reasoningEffort/);
  assert.match(player, /coder:\n\s+adapter: claude\n\s+effort: xhigh/);
});

test("playbook.add registers a playbook with full agent blocks", async () => {
  const path = templateFile();
  const result = await editConfigFile(
    path,
    {
      kind: "playbook.add",
      playbookId: "other",
      from: "@stub/other",
      players: {
        helper: {
          adapter: "claude",
          model: "claude-test",
          instruction: "be brief",
          permissions: { mode: "auto" },
        },
      },
      options: { committer: "helper" },
    },
    stubLoader,
  );
  assert.equal(result.ok, true);
  const after = readFileSync(path, "utf8");
  assert.match(after, /other:\n\s+from: "@stub\/other"/);
  assert.match(after, /helper:\n\s+adapter: claude\n\s+model: claude-test/);
  // Optional hand-written fields carried by the block schema land too.
  assert.match(after, /instruction: be brief/);
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
      kind: "playbook.player.set",
      playbookId: "code",
      role: "reviewer",
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
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    players:
      coder: claude
      reviewer: claude
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
