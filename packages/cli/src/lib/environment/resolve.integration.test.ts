// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a lock places (environments-1, environments-3, environments-6):
// a resolution against the library's stand-in registry, and by path,
// names under `exports` only what each release provides — a support
// skill a playbook requires, a playbook's source spec and a kind its
// `provides` leaves out are selected and installed with the rest, but
// placed under no name — so two packages clash only over a name both
// place.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeRelease, startStandinRegistry, type ReleaseFixture, type StandinRegistry } from "../../testing/index.js";
import { gitSource, parseRequests, publishRelease, RegistryClient, resolve } from "./index.js";

const scratches: string[] = [];
const scratch = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratches.push(dir);
  return dir;
};

let registry: StandinRegistry;
let client: RegistryClient;
let releases = "";

function manifestOf(name: string, artifacts: Record<string, unknown>, provides?: string[]): Record<string, unknown> {
  const [org, pkg] = name.split("/");
  return { format: 2, org, name: pkg, version: "1.0.0", description: `The ${name} spec package`, license: "Apache-2.0", ...(provides ? { provides } : {}), artifacts };
}

const skillFiles = (id: string): Record<string, ReleaseFixture> => ({ [`skills/en/${id}/SKILL.md`]: `---\nname: ${id}\ndescription: The ${id} skill\n---\n\nDo ${id}.\n` });
const playbookFiles = (id: string): Record<string, ReleaseFixture> => ({ [`playbooks/en/${id}/${id}.md`]: `# ${id}\n\nRoles:\n\n- Worker\n` });
const specFiles = (pkg: string): Record<string, ReleaseFixture> => ({
  [`specs/en/${pkg}.md`]: `# ${pkg}: ${pkg}\n\n## Intent\n\nThe ${pkg}.\n\n## External Behavior\n\n### ${pkg}-1\n\nThe ${pkg} shall stand.\n\n## Verification\n\n### ${pkg}-2\n\nWhen read, the suite shall assert it stands [[${pkg}-1](#${pkg}-1)].\n`,
});

/** acme/flow: a playbook compiled from its spec, requiring a skill, a
 * peer playbook, and a spec and a skill of kinds `provides` lists. */
const FLOW = manifestOf("acme/flow", {
  flow: { kind: "spec", language: "en" },
  make: { kind: "playbook", language: "en", from: "flow", requires: ["lint", "check"] },
  check: { kind: "playbook", language: "en" },
  lint: { kind: "skill", language: "en" },
});
const FLOW_FILES = { ...specFiles("flow"), ...playbookFiles("make"), ...playbookFiles("check"), ...skillFiles("lint") };

async function publish(name: string, manifest: Record<string, unknown>, files: Record<string, ReleaseFixture>): Promise<void> {
  const dir = await makeRelease(join(releases, name.replace("/", "-")), manifest, files);
  await publishRelease(client, dir);
}

before(async () => {
  registry = await startStandinRegistry({ dir: scratch("spex-resolve-standin-") });
  client = new RegistryClient({ url: registry.url });
  releases = scratch("spex-resolve-releases-");
  await publish("acme/flow", FLOW, FLOW_FILES);
  // A skill of the support skill's name, placed by its own package.
  await publish("acme/style", manifestOf("acme/style", { lint: { kind: "skill", language: "en" } }), skillFiles("lint"));
  // The same name placed by a second package: a real clash.
  await publish("acme/other", manifestOf("acme/other", { lint: { kind: "skill", language: "en" } }), skillFiles("lint"));
  // A spec and a skill, providing the skill alone.
  await publish("acme/tips", manifestOf("acme/tips", { tips: { kind: "spec", language: "en" }, tip: { kind: "skill", language: "en" } }, ["skill"]), { ...specFiles("tips"), ...skillFiles("tip") });
});

after(async () => {
  await registry.close();
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

async function resolved(text: string, pathRoot: string | null = null) {
  const root = pathRoot ?? scratch("spex-resolve-root-");
  return resolve({ requests: parseRequests(text), requestsText: text, registry: client, pathRoot: root, git: gitSource(join(scratch("spex-resolve-cache-"), "cache")) });
}

test("environments-6: a lock names only what each release provides, so a support skill's name clashes with no package's", async () => {
  const result = await resolved("format: 1\npackages:\n  acme/flow: {\"version\":\"^1.0.0\"}\n  acme/style: {\"version\":\"^1.0.0\"}\n  acme/tips: {\"version\":\"^1.0.0\"}\n");
  if (!result.ok) assert.fail(`[environments-6] no clash over a name only one package places: ${JSON.stringify(result.conflicts)}`);
  const { packages } = result.lock;
  assert.deepEqual(packages["acme/flow"]!.exports, { check: "check", make: "make" }, "[environments-6] the provided playbooks alone: no support skill, no source spec");
  assert.deepEqual(Object.keys(packages["acme/flow"]!.artifacts).sort(), ["check", "flow", "lint", "make"], "[environments-6] every artifact selected, installed with the rest");
  assert.ok(packages["acme/flow"]!.files.some((file) => file.path === "skills/en/lint/SKILL.md"), "[environments-6] the support skill's files locked");
  assert.deepEqual(packages["acme/style"]!.exports, { lint: "lint" }, "[environments-6] the one package placing lint");
  assert.deepEqual(packages["acme/tips"]!.exports, { tip: "tip" }, "[environments-1] a spec of a kind provides does not list placed under no name");

  // Two packages placing one name are refused naming both.
  const clash = await resolved("format: 1\npackages:\n  acme/flow: {\"version\":\"^1.0.0\"}\n  acme/other: {\"version\":\"^1.0.0\"}\n  acme/style: {\"version\":\"^1.0.0\"}\n");
  assert.equal(clash.ok, false, "[environments-6] two placed skill names alike refused");
  if (!clash.ok) {
    assert.deepEqual(clash.conflicts, [{ name: "lint", requirements: [{ by: "acme/other", requirement: "skill lint" }, { by: "acme/style", requirement: "skill lint" }] }], "[environments-6] naming both, and not the playbook's support skill");
  }
});

test("environments-6: a release requested by path is read for what it provides alike", async () => {
  const root = scratch("spex-resolve-path-");
  await makeRelease(join(root, "kits", "flow"), FLOW, FLOW_FILES);
  const result = await resolved("format: 1\npackages:\n  acme/flow: {\"path\":\"kits/flow\"}\n  acme/style: {\"version\":\"^1.0.0\"}\n", root);
  if (!result.ok) assert.fail(`[environments-6] ${JSON.stringify(result.conflicts)}`);
  assert.deepEqual(result.lock.packages["acme/flow"]!.exports, { check: "check", make: "make" }, "[environments-6] the folder's provided playbooks alone");
  assert.deepEqual(result.lock.packages["acme/style"]!.exports, { lint: "lint" });
});
