// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What an export places (environments-6, environments-8, environments-41,
// DR-174), on scratch roots holding installed releases and a lock naming
// them: only what a release provides — no support skill copied, no
// support playbook's skill generated, no spec a release does not offer;
// a provided spec at `specs/packages/<pkg>.md` with its addresses
// rewritten for the tree, recorded, and derived again when the set of
// placed specs changes; an edited copy left standing; a removal taking
// an unedited copy and keeping an edited one; a file of the name blocking
// the placement, the second package of one `<pkg>` included; a copy
// holding the derived bytes taken as placed; a root without `specs/`
// falling back to the generated skill and reporting it; your own group's
// writing the skill alone; and each state read back from the files.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringify as stringifyYaml } from "yaml";

import { sha256 } from "../files.js";
import { exportEnvironment, readSpecPlacements, type SpecPlacement } from "./exports.js";
import type { Lock, Resolution } from "./lock.js";
import { placedRecordPath, readPlacedRecord } from "./placed-record.js";

type Artifacts = Record<string, { kind: string; language?: string; from?: string; requires?: string[] }>;

const scratches: string[] = [];
after(() => { for (const dir of scratches) rmSync(dir, { recursive: true, force: true }); });

/** A scratch working folder, a Git work tree, holding `specs/` where asked. */
function scratchRoot(specs: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "spex-place-"));
  scratches.push(root);
  execFileSync("git", ["init", "--quiet", root]);
  if (specs) mkdirSync(join(root, "specs", "packages"), { recursive: true });
  return root;
}

/** A spec file whose External Behavior holds `<pkg>-1` and cites the
 * items given by address. */
function specText(pkg: string, cites: string[] = [], extra = ""): string {
  const citations = cites.map((name) => ` [[${name.split("/")[1]}-1](spex:${name}#${name.split("/")[1]}-1)]`).join("");
  return `# ${pkg}: ${pkg}\n\n## Intent\n\nThe ${pkg} package.${extra}\n\n## External Behavior\n\n### ${pkg}-1\n\nThe ${pkg} shall stand${citations}.\n\n## Verification\n\n### ${pkg}-2\n\nWhen read, the suite shall assert it stands [[${pkg}-1](#${pkg}-1)].\n`;
}

/** Install a release under `<root>/.spex/packages/<org>/<pkg>/` as an
 * install leaves it, and its resolution: every artifact selected in
 * `en`, each placed under its id, a spec under `<org>-<pkg>`. */
function installRelease(root: string, name: string, version: string, artifacts: Artifacts, files: Record<string, string>, provides?: string[]): Resolution {
  const [org, pkg] = name.split("/") as [string, string];
  const dir = join(root, ".spex", "packages", org, pkg);
  rmSync(dir, { recursive: true, force: true });
  const manifest = {
    format: 2, org, name: pkg, version, description: `The ${name} package`, license: "Apache-2.0",
    ...(provides ? { provides } : {}),
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([id, artifact]) => [id, { language: "en", ...artifact }])),
  };
  for (const [path, text] of Object.entries({ "meta.yaml": stringifyYaml(manifest), ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return {
    source: { registry: "https://spex.sublang.ai", version, checksum: "0".repeat(64) },
    requiredBy: [],
    artifacts: Object.fromEntries(Object.keys(artifacts).map((id) => [id, { language: "en", fallback: false }])),
    files: [],
    exports: Object.fromEntries(Object.entries(artifacts).filter(([, artifact]) => artifact.kind !== "source").map(([id, artifact]) => [artifact.kind === "spec" ? `${org}-${pkg}` : id, id])),
  };
}

/** A release providing one spec, `<pkg>`, citing the packages given. */
function specRelease(root: string, name: string, version: string, cites: string[] = [], extra = ""): Resolution {
  const pkg = name.split("/")[1]!;
  return installRelease(root, name, version, { [pkg]: { kind: "spec" } }, { [`specs/en/${pkg}.md`]: specText(pkg, cites, extra) });
}

const lockOf = (packages: Record<string, Resolution>): Lock => ({ format: 1, requests: "0".repeat(64), packages });

/** Export a project's environment: its root is its working folder. */
const place = (root: string, packages: Record<string, Resolution>) =>
  exportEnvironment({ root, lock: lockOf(packages), workingFolder: root, userHome: null, agents: [] });

const read = (root: string, path: string): string => readFileSync(join(root, ...path.split("/")), "utf8");
const stamp = (file: string): string => { const stat = statSync(file); return `${stat.mtimeMs}:${stat.ino}`; };
const placement = (name: string, state: SpecPlacement["state"], waiting: SpecPlacement["waiting"] = []): SpecPlacement =>
  ({ name, path: `specs/packages/${name.split("/")[1]}.md`, state, waiting });

test("environments-41: a provided spec is placed in specs/packages/ with its links rewritten and recorded, derived again when the set of placed specs changes", async () => {
  const root = scratchRoot(true);
  const tools = specRelease(root, "acme/tools", "1.0.0", ["acme/other", "acme/absent"]);
  const report = await place(root, { "acme/tools": tools });
  assert.deepEqual(report.specs, [placement("acme/tools", "placed", [{ name: "acme/absent", count: 1 }, { name: "acme/other", count: 1 }])], "[environments-41] placed, each package its links wait for counted");
  const text = read(root, "specs/packages/tools.md");
  assert.equal(text, specText("tools"), "[environments-41] each address of a spec not standing removed with its brackets, the phrase kept");
  assert.doesNotMatch(text, /spex:/, "[environments-41] specs/ holds no address");
  assert.deepEqual(readPlacedRecord(root), {
    format: 1,
    specs: { "acme/tools": { path: "specs/packages/tools.md", sha256: sha256(text), waiting: { "acme/absent": 1, "acme/other": 1 } } },
  }, "[environments-41] the written bytes' hash and the waiting links recorded");
  assert.deepEqual(report.skills, [], "[environments-8] no spec skill where the root holds specs/");
  assert.equal(existsSync(join(root, ".claude", "skills", "acme-tools")), false);
  assert.equal(existsSync(join(root, ".spex", "skills", "acme-tools")), false);
  assert.doesNotMatch(readFileSync(join(root, ".git", "info", "exclude"), "utf8"), /specs/, "[environments-41] the placed file left for the reader to commit");

  // The cited package added: its spec stands, so the link appears.
  const other = specRelease(root, "acme/other", "1.0.0");
  const both = await place(root, { "acme/other": other, "acme/tools": tools });
  assert.deepEqual(both.specs, [placement("acme/other", "placed"), placement("acme/tools", "placed", [{ name: "acme/absent", count: 1 }])]);
  assert.equal(read(root, "specs/packages/tools.md"), specText("tools").replace("shall stand.", "shall stand [[other-1](other.md#other-1)]."), "[environments-41] derived again, the address now a relative link");
  assert.equal(read(root, "specs/packages/other.md"), specText("other"));

  // Placed again as it stands: no file rewritten.
  const before = [stamp(join(root, "specs", "packages", "tools.md")), stamp(join(root, "specs", "packages", "other.md")), stamp(placedRecordPath(root))];
  const again = await place(root, { "acme/other": other, "acme/tools": tools });
  assert.deepEqual(again.specs, both.specs);
  assert.deepEqual([stamp(join(root, "specs", "packages", "tools.md")), stamp(join(root, "specs", "packages", "other.md")), stamp(placedRecordPath(root))], before, "[environments-41] nothing rewritten");

  // A newer release replaces a copy holding the bytes recorded.
  const newer = specRelease(root, "acme/tools", "1.1.0", ["acme/other"], " Now newer.");
  await place(root, { "acme/other": other, "acme/tools": newer });
  assert.match(read(root, "specs/packages/tools.md"), /Now newer\./, "[environments-41] an unedited copy follows its release");
  assert.deepEqual(readSpecPlacements(root, lockOf({ "acme/other": other, "acme/tools": newer })), [placement("acme/other", "placed"), placement("acme/tools", "placed")], "[environments-14] each read placed from the record and the files");
});

test("environments-41: an edited copy stands across a re-placement, reported edited with its record kept", async () => {
  const root = scratchRoot(true);
  await place(root, { "acme/tools": specRelease(root, "acme/tools", "1.0.0") });
  const recorded = readPlacedRecord(root);
  const edited = `${read(root, "specs/packages/tools.md")}\nThe reader's own line.\n`;
  writeFileSync(join(root, "specs", "packages", "tools.md"), edited);
  const lock = { "acme/tools": specRelease(root, "acme/tools", "1.1.0", [], " Now newer.") };
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), [placement("acme/tools", "edited")], "[environments-14] read edited before any placement");
  const report = await place(root, lock);
  assert.deepEqual(report.specs, [placement("acme/tools", "edited")], "[environments-41] reported edited");
  assert.equal(read(root, "specs/packages/tools.md"), edited, "[environments-41] the edited copy left standing, nothing placed over it");
  assert.deepEqual(readPlacedRecord(root), recorded, "[environments-41] its record kept, so it reads edited until the reader's bytes are Spex's again");
  assert.match(read(root, ".spex/packages/acme/tools/specs/en/tools.md"), /Now newer\./, "[environments-41] the newer release's file waits under .spex/");
});

test("environments-41: a removal takes an unedited copy and keeps an edited one as the project's own, as does a release no longer providing its spec", async () => {
  const root = scratchRoot(true);
  const one = specRelease(root, "acme/one", "1.0.0");
  const two = specRelease(root, "acme/two", "1.0.0");
  const three = specRelease(root, "acme/three", "1.0.0");
  const four = specRelease(root, "acme/four", "1.0.0");
  await place(root, { "acme/four": four, "acme/one": one, "acme/three": three, "acme/two": two });
  writeFileSync(join(root, "specs", "packages", "two.md"), "# two: mine now\n");
  writeFileSync(join(root, "specs", "packages", "four.md"), "# four: mine now\n");
  // acme/one and acme/two removed; acme/three and acme/four now provide
  // a skill alone.
  const skillOnly = (name: string): Resolution => {
    const pkg = name.split("/")[1]!;
    return installRelease(root, name, "2.0.0", { [pkg]: { kind: "spec" }, tip: { kind: "skill" } }, {
      [`specs/en/${pkg}.md`]: specText(pkg),
      "skills/en/tip/SKILL.md": "---\nname: tip\ndescription: A tip\n---\n",
    }, ["skill"]);
  };
  const report = await place(root, { "acme/four": skillOnly("acme/four"), "acme/three": skillOnly("acme/three") });
  assert.equal(existsSync(join(root, "specs", "packages", "one.md")), false, "[environments-41] an unedited copy leaves with its package");
  assert.equal(existsSync(join(root, "specs", "packages", "three.md")), false, "[environments-41] and with its spec no longer provided");
  assert.equal(read(root, "specs/packages/two.md"), "# two: mine now\n", "[environments-41] an edited copy stays");
  assert.equal(read(root, "specs/packages/four.md"), "# four: mine now\n");
  assert.deepEqual(report.specs, [placement("acme/four", "kept"), placement("acme/two", "kept")], "[environments-41] each kept as the project's own, reported");
  assert.equal(existsSync(placedRecordPath(root)), false, "[environments-41] a record of nothing is removed");
  // The kept copies are the project's: no longer Spex's to remove.
  await place(root, {});
  assert.equal(read(root, "specs/packages/two.md"), "# two: mine now\n");
});

test("environments-41: a file of the name blocks the placement — the project's own, and the second package of one <pkg> — and one holding the derived bytes is taken as placed", async () => {
  const root = scratchRoot(true);
  writeFileSync(join(root, "specs", "packages", "git.md"), "# git: the project's own\n");
  const git = specRelease(root, "acme/git", "1.0.0");
  const first = specRelease(root, "acme/kit", "1.0.0");
  const second = specRelease(root, "zeta/kit", "1.0.0", [], " The second.");
  const tools = specRelease(root, "acme/tools", "1.0.0", ["acme/git", "acme/kit", "zeta/kit"]);
  const lock = { "acme/git": git, "acme/kit": first, "acme/tools": tools, "zeta/kit": second };
  const report = await place(root, lock);
  assert.deepEqual(report.specs, [
    placement("acme/git", "blocked"),
    placement("acme/kit", "placed"),
    placement("acme/tools", "placed", [{ name: "acme/git", count: 1 }, { name: "zeta/kit", count: 1 }]),
    placement("zeta/kit", "blocked"),
  ], "[environments-41] the project's file and the second of one <pkg> each block, the first in name order placed");
  assert.equal(read(root, "specs/packages/git.md"), "# git: the project's own\n", "[environments-41] the project's file as it was");
  assert.equal(read(root, "specs/packages/kit.md"), specText("kit"), "[environments-41] the first in name order's copy");
  assert.match(read(root, "specs/packages/tools.md"), /shall stand \[\[kit-1\]\(kit\.md#kit-1\)\]\./, "[environments-41] a blocked package's links wait, a placed one's resolve");
  assert.deepEqual(Object.keys(readPlacedRecord(root)!.specs), ["acme/kit", "acme/tools"], "[environments-41] a blocked spec is not recorded");
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), report.specs, "[environments-14] each read back as the placement reported it");

  // A clone of committed copies: the files stand, the record does not;
  // each holding the derived bytes is placed again, nothing rewritten.
  rmSync(placedRecordPath(root));
  const kit = stamp(join(root, "specs", "packages", "kit.md"));
  const again = await place(root, lock);
  assert.deepEqual(again.specs, report.specs, "[environments-41] committed copies taken as placed");
  assert.equal(stamp(join(root, "specs", "packages", "kit.md")), kit, "[environments-41] and not rewritten");
  assert.deepEqual(Object.keys(readPlacedRecord(root)!.specs), ["acme/kit", "acme/tools"]);
});

test("environments-8: a root without specs/ places the spec as its generated skill and reports it, and your own group's writes the skill alone", async () => {
  const project = scratchRoot(false);
  const release = specText("tools");
  const report = await place(project, { "acme/tools": specRelease(project, "acme/tools", "1.0.0") });
  assert.deepEqual(report.specs, [placement("acme/tools", "no-specs")], "[environments-41] reported waiting for specs/");
  for (const folder of [".claude", ".agents"]) {
    assert.equal(read(project, `${folder}/skills/acme-tools/tools.md`), release, `[environments-8] the generated skill in ${folder}/skills, the spec byte for byte`);
  }
  assert.equal(existsSync(join(project, "specs")), false, "[environments-41] no specs/ made");
  assert.equal(existsSync(placedRecordPath(project)), false, "[environments-41] nothing recorded");
  assert.deepEqual(readSpecPlacements(project, lockOf({ "acme/tools": specRelease(project, "acme/tools", "1.0.0") })), [placement("acme/tools", "no-specs")]);

  // Your own group's clone: no working folder is its root.
  const clone = scratchRoot(true);
  const own = await exportEnvironment({ root: clone, lock: lockOf({ "acme/tools": specRelease(clone, "acme/tools", "1.0.0") }), workingFolder: null, userHome: null, agents: [] });
  assert.deepEqual(own.specs, [], "[environments-8] your own group's reports no spec placement");
  assert.deepEqual(own.skills, ["acme-tools"]);
  assert.equal(read(clone, ".spex/skills/acme-tools/tools.md"), release, "[environments-8] the generated skill, as before");
  assert.equal(existsSync(join(clone, "specs", "packages", "tools.md")), false, "[environments-8] nothing in its specs/");
});

test("environments-6: a support skill is not copied, a support playbook gets no skill, and a spec a release does not provide is not placed", async () => {
  const root = scratchRoot(true);
  const widgets = installRelease(root, "acme/widgets", "1.0.0", {
    widgets: { kind: "spec" },
    make: { kind: "playbook", from: "widgets", requires: ["lint", "check"] },
    check: { kind: "playbook" },
    lint: { kind: "skill" },
  }, {
    "specs/en/widgets.md": specText("widgets"),
    "playbooks/en/make/make.md": "Roles: maker\n",
    "playbooks/en/check/check.md": "Roles: checker\n",
    "skills/en/lint/SKILL.md": "---\nname: lint\ndescription: Lint\n---\n",
  });
  const tips = installRelease(root, "acme/tips", "1.0.0", { tips: { kind: "spec" }, tip: { kind: "skill" } }, {
    "specs/en/tips.md": specText("tips"),
    "skills/en/tip/SKILL.md": "---\nname: tip\ndescription: A tip\n---\n",
  }, ["skill"]);
  const lock = { "acme/tips": tips, "acme/widgets": widgets };
  const exportsBefore = JSON.stringify(lock);
  const report = await place(root, lock);
  assert.deepEqual(report.skills, ["make", "tip"], "[environments-6] the provided playbook's and skill's alone");
  assert.equal(existsSync(join(root, ".spex", "skills", "lint")), false, "[environments-6] a skill a playbook requires is not copied");
  assert.equal(existsSync(join(root, ".spex", "skills", "check")), false, "[environments-6] a playbook a playbook requires gets no skill");
  assert.equal(existsSync(join(root, ".claude", "skills", "lint")), false);
  assert.equal(existsSync(join(root, "specs", "packages", "widgets.md")), false, "[environments-6] a playbook's source spec is not placed");
  assert.equal(existsSync(join(root, "specs", "packages", "tips.md")), false, "[environments-6] a spec of a kind provides does not list is not placed");
  assert.deepEqual(report.specs, [], "[environments-41] no spec placement to report");
  assert.equal(JSON.stringify(lock), exportsBefore, "[environments-6] the lock's names as resolved");
  assert.ok(existsSync(join(root, ".spex", "packages", "acme", "widgets", "skills", "en", "lint", "SKILL.md")), "[environments-6] installed with the rest");
});
