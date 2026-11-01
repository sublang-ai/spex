// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The manifest's `provides` (environments-1, DR-174): the field read,
// refused and written back in the format's order, a release naming it
// read from a folder and from the archive the registry checks, and the
// artifacts a release provides — those of the kinds it lists, every
// kind where it lists none, never a sibling's support.

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeRelease } from "../../testing/index.js";
import { packRelease, unpackRelease } from "./archive.js";
import { parseManifest, parseManifestText, providedArtifacts, readRelease, serializeManifest, type Manifest } from "./format.js";

const scratches: string[] = [];
after(() => {
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

function manifestOf(artifacts: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { format: 2, org: "acme", name: "widgets", version: "1.0.0", ...extra, artifacts };
}

/** A parsed manifest, failing the test with its issues if refused. */
function parsed(raw: Record<string, unknown>): Manifest {
  const { manifest, issues } = parseManifest(raw);
  assert.ok(manifest, JSON.stringify(issues));
  return manifest;
}

const PLAYBOOK_AND_SKILL = { build: { kind: "playbook", language: "en" }, tip: { kind: "skill", language: "en" } };

describe("provides", () => {
  it("is accepted and written back between dependencies and artifacts", () => {
    const manifest = parsed(manifestOf(PLAYBOOK_AND_SKILL, { dependencies: { "acme/base": "^1.0.0" }, provides: ["playbook", "skill"] }));
    assert.deepEqual(manifest.provides, ["playbook", "skill"]);
    const text = serializeManifest(manifest);
    const keys = text.split("\n").filter((line) => /^[a-z]/.test(line)).map((line) => line.split(":")[0]);
    assert.deepEqual(keys, ["format", "org", "name", "version", "dependencies", "provides", "artifacts"]);
    const again = parseManifestText(text);
    assert.deepEqual(again.issues, []);
    assert.deepEqual(again.manifest, manifest);
  });

  it("is absent from a manifest without it, and from the text written back", () => {
    const manifest = parsed(manifestOf(PLAYBOOK_AND_SKILL));
    assert.equal("provides" in manifest, false);
    assert.doesNotMatch(serializeManifest(manifest), /provides/);
  });

  it("refuses a non-list, an unknown kind and a duplicate, naming the rule", () => {
    const cases: { label: string; provides: unknown; message: RegExp }[] = [
      { label: "a kind alone", provides: "spec", message: /provides is not a list of artifact kinds/ },
      { label: "a mapping", provides: { spec: true }, message: /provides is not a list of artifact kinds/ },
      { label: "an empty value", provides: null, message: /provides is not a list of artifact kinds/ },
      { label: "an unknown kind", provides: ["spec", "widget"], message: /provides kind "widget" is not one of source, spec, skill, playbook, applet/ },
      { label: "a kind that is no string", provides: [3], message: /provides kind 3 is not one of/ },
      { label: "a duplicate", provides: ["skill", "skill"], message: /provides lists skill twice/ },
    ];
    for (const { label, provides, message } of cases) {
      const { manifest, issues } = parseManifest(manifestOf(PLAYBOOK_AND_SKILL, { provides }));
      assert.equal(manifest, null, label);
      assert.ok(issues.some((issue) => issue.rule === "provides" && issue.path === "meta.yaml" && message.test(issue.message)), `${label}: ${JSON.stringify(issues)}`);
    }
  });

  it("is read from a release folder and from the archive the registry checks", async () => {
    const root = mkdtempSync(join(tmpdir(), "spex-provides-"));
    scratches.push(root);
    const dir = await makeRelease(join(root, "widgets"), manifestOf({
      widgets: { kind: "spec", language: "en" },
      tip: { kind: "skill", language: "en" },
    }, { provides: ["skill"] }), {
      "specs/en/widgets.md": "# widgets: Widgets\n\n## Intent\n\nWidgets spin.\n\n## External Behavior\n\n### widgets-1\n\nThe widget shall spin.\n\n## Verification\n\n### widgets-2\n\nWhen spun, the suite shall assert it spins [[widgets-1](#widgets-1)].\n",
      "skills/en/tip/SKILL.md": "---\nname: tip\ndescription: The tip skill\n---\n\nUse tip.\n",
    });
    const release = await readRelease(dir);
    assert.deepEqual(release.manifest.provides, ["skill"]);
    const unpacked = unpackRelease(packRelease(dir, release.manifest, release.files), "widgets");
    assert.deepEqual(unpacked.issues, []);
    assert.deepEqual(unpacked.manifest?.provides, ["skill"]);
  });
});

describe("providedArtifacts", () => {
  const ids = (manifest: Manifest): string[] => [...providedArtifacts(manifest)].sort();

  it("provides a spec-only package's spec", () => {
    assert.deepEqual(ids(parsed(manifestOf({ widgets: { kind: "spec", language: "en" } }))), ["widgets"]);
  });

  it("keeps the spec a playbook is compiled from as its source", () => {
    assert.deepEqual(ids(parsed(manifestOf({
      widgets: { kind: "spec", language: "en" },
      build: { kind: "playbook", language: "en", from: "widgets" },
    }))), ["build"]);
  });

  it("keeps a skill a playbook requires as the playbook's, whatever provides lists", () => {
    const artifacts = { lint: { kind: "skill", language: "en" }, build: { kind: "playbook", language: "en", requires: ["lint"] } };
    assert.deepEqual(ids(parsed(manifestOf(artifacts))), ["build"]);
    assert.deepEqual(ids(parsed(manifestOf(artifacts, { provides: ["playbook", "skill"] }))), ["build"]);
  });

  it("provides only the kinds an explicit provides lists", () => {
    assert.deepEqual(ids(parsed(manifestOf({
      widgets: { kind: "spec", language: "en" },
      tip: { kind: "skill", language: "en" },
    }, { provides: ["skill"] }))), ["tip"]);
  });

  it("provides every kind where provides is absent or lists nothing", () => {
    const artifacts = {
      brief: { kind: "source", language: "en" },
      widgets: { kind: "spec", language: "en" },
      tip: { kind: "skill", language: "en" },
      build: { kind: "playbook", language: "en" },
      viewer: { kind: "applet" },
    };
    const every = ["brief", "build", "tip", "viewer", "widgets"];
    assert.deepEqual(ids(parsed(manifestOf(artifacts))), every);
    assert.deepEqual(ids(parsed(manifestOf(artifacts, { provides: [] }))), every);
  });
});
