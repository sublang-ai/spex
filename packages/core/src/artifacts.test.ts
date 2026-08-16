// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// PBLIB-25: pipeline artifacts from both layouts, with degradation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveArtifacts } from "./artifacts.js";

const FSM = `
import { setup } from "xstate";
export const demoMachine = setup({}).createMachine({
  id: "demo",
  initial: "ready",
  states: {
    ready: { on: { GO: "work" } },
    work: { on: { DONE: "done" } },
    awaitBossReply: {},
    failed: {},
    done: { type: "final" },
  },
});
`;

function compiledLayout(id: string): { dir: string; from: string } {
  const dir = mkdtempSync(join(tmpdir(), "spex-artifacts-"));
  writeFileSync(join(dir, `${id}.md`), `# ${id} workflow\n`);
  const artifactDir = join(dir, `${id}.playbook`);
  mkdirSync(artifactDir);
  writeFileSync(join(artifactDir, `${id}.gears.md`), `## GEARS for ${id}\n`);
  writeFileSync(join(artifactDir, `${id}.fsm.ts`), FSM);
  const from = join(dir, `${id}.registry.mjs`);
  writeFileSync(from, "export default {};\n");
  return { dir, from };
}

test("artifacts resolve from the compiled library layout with state ids", async () => {
  const { from } = compiledLayout("demo");
  const artifacts = await resolveArtifacts({ id: "demo", from });
  assert.match(artifacts.source ?? "", /demo workflow/);
  assert.match(artifacts.gears ?? "", /GEARS for demo/);
  assert.match(artifacts.fsm ?? "", /createMachine/);
  assert.deepEqual(artifacts.missing, []);
  // playbook-library-36: the drawable graph rides beside the ids.
  assert.ok(artifacts.machine, "machine graph must be served");
  assert.equal(artifacts.machine?.initial, "ready");
  assert.ok((artifacts.machine?.edges.length ?? 0) > 0);
  const finals = artifacts.machine?.nodes.filter((n) => n.kind === "final");
  assert.ok((finals?.length ?? 0) > 0);
  assert.deepEqual(artifacts.stateIds, [
    "ready",
    "work",
    "awaitBossReply",
    "failed",
    "done",
  ]);
});

test("artifacts resolve from the published-package layout", async () => {
  const root = mkdtempSync(join(tmpdir(), "spex-artifacts-pkg-"));
  writeFileSync(join(root, "code.md"), "# code source\n");
  const pkgDir = join(root, "code.playbook");
  mkdirSync(pkgDir);
  writeFileSync(join(pkgDir, "code.gears.md"), "## code gears\n");
  writeFileSync(join(pkgDir, "code.fsm.ts"), FSM);
  const from = join(pkgDir, "code.registry.js");
  writeFileSync(from, "export default {};\n");

  const artifacts = await resolveArtifacts({ id: "code", from });
  assert.match(artifacts.source ?? "", /code source/);
  assert.match(artifacts.gears ?? "", /code gears/);
  assert.match(artifacts.fsm ?? "", /createMachine/);
  assert.deepEqual(artifacts.missing, []);
});

test("a removed stage is named missing while others still serve", async () => {
  const { dir, from } = compiledLayout("gone");
  rmSync(join(dir, "gone.playbook", "gone.gears.md"));
  const artifacts = await resolveArtifacts({ id: "gone", from });
  assert.equal(artifacts.gears, null);
  assert.deepEqual(artifacts.missing, ["gears"]);
  assert.match(artifacts.source ?? "", /gone workflow/);
  assert.match(artifacts.fsm ?? "", /createMachine/);
});

test("an unresolvable registry yields all stages missing", async () => {
  const artifacts = await resolveArtifacts({
    id: "nope",
    from: "@sublang/definitely-not-a-package/registry",
  });
  assert.deepEqual(artifacts.missing, ["source", "gears", "fsm"]);
  assert.equal(artifacts.stateIds, null);
});

test("served source and gears drop leading comment headers", async () => {
  const { dir, from } = compiledLayout("demo");
  writeFileSync(
    join(dir, "demo.md"),
    "<!-- SPDX-License-Identifier: Apache-2.0 -->\n<!-- Vendored from elsewhere\n     for provenance -->\n\n# demo workflow\n\n<!-- an inline note stays --> body\n",
  );
  const artifacts = await resolveArtifacts({ id: "demo", from });
  assert.ok((artifacts.source ?? "").startsWith("# demo workflow"));
  assert.match(artifacts.source ?? "", /an inline note stays/);
});

test("playbook-library-37: every built-in serves a whole machine graph", async () => {
  // The review machine targets its states by their declared ids, and
  // the extractor used to read those as machine-id-prefixed paths —
  // so every one of its edges resolved to nothing and the card drew
  // states with no transitions at all.
  const builtins = {
    code: "@sublang/playbook/code/registry",
    review: "@sublang/playbook/review/registry",
    decide: "@sublang/playbook/decide/registry",
  };

  for (const [id, from] of Object.entries(builtins)) {
    const artifacts = await resolveArtifacts({ id, from });
    const machine = artifacts.machine;
    assert.ok(machine, `${id} must serve a machine graph`);
    assert.ok(machine.edges.length > 0, `${id} must serve edges`);
    const known = new Set(machine.nodes.map((node) => node.id));
    for (const edge of machine.edges) {
      assert.ok(known.has(edge.from), `${id}: edge from ${edge.from} is a node`);
      assert.ok(known.has(edge.to), `${id}: edge to ${edge.to} is a node`);
    }
  }

  // Declared-id targets resolve: review opens into its first review
  // state and resumes from a parked boss reply.
  const review = (await resolveArtifacts({ id: "review", from: builtins.review }))
    .machine;
  assert.ok(
    review?.edges.some(
      (edge) => edge.from === "ready" && edge.to === "reviewInitial",
    ),
    "review's opening transition must resolve",
  );
  assert.ok(
    review?.edges.some(
      (edge) => edge.from === "awaitBossReply" && edge.event === "BOSS_REPLY",
    ),
    "review's boss-reply resume must resolve",
  );

  // A compound state's own done transition is the join out of its
  // regions — a real edge, previously dropped entirely.
  const decide = (await resolveArtifacts({ id: "decide", from: builtins.decide }))
    .machine;
  assert.ok(
    decide?.edges.some(
      (edge) => edge.event === "done" && edge.from === "independentProposals",
    ),
    "decide's parallel join must appear as an edge",
  );
});
