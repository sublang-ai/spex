// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What an export places (environments-6, environments-8, environments-41,
// DR-174), on scratch roots holding installed releases and a lock naming
// them: only what a release provides — no support skill copied, no
// support playbook's skill generated, no spec a release does not offer;
// a provided spec at `specs/packages/<pkg>.md` opening with the marker
// line naming its package and version, its addresses rewritten for the
// tree, recorded with its version, and derived again when the set of
// placed specs changes; an edited copy left standing, the newer
// release's version waiting; a removal taking an unedited copy and
// keeping an edited one; a file of the basename anywhere under `specs/`
// blocking the placement where it is neither the derivation nor the
// package's copy by the record or its marker line, the second package
// of one `<pkg>` included, and a recorded copy whose marker line the
// reader removed read as edited; a committed copy holding the
// derivation, CRLF read as LF, adopted on a fresh clone, one at a newer
// release's version on a device whose record held the older hash, and
// one of a package whose files are not here standing for the links
// citing it; a project without `specs/` placing no spec and reporting
// it; your own group's writing the generated skill; and each state read
// back from the files.

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
import { placedMarker } from "./marker.js";
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
const placement = (name: string, state: SpecPlacement["state"], waiting: SpecPlacement["waiting"] = [], waitingVersion?: string): SpecPlacement =>
  ({ name, path: `specs/packages/${name.split("/")[1]}.md`, state, waiting, ...(waitingVersion ? { waitingVersion } : {}) });
/** A placed copy of `<org>/<pkg>` at `version`: the marker line, a blank
 * line, then the spec as rewritten for the tree. */
const placedText = (name: string, version: string, text: string): string => `${placedMarker(name, version)}\n\n${text}`;

test("environments-41: a provided spec is placed in specs/packages/ under its marker line with its links rewritten and recorded, derived again when the set of placed specs changes", async () => {
  const root = scratchRoot(true);
  const tools = specRelease(root, "acme/tools", "1.0.0", ["acme/other", "acme/absent"]);
  assert.deepEqual(readSpecPlacements(root, lockOf({ "acme/tools": tools })), [], "[environments-14] a copy not written yet is left out");
  const report = await place(root, { "acme/tools": tools });
  assert.deepEqual(report.specs, [placement("acme/tools", "placed", [{ name: "acme/absent", count: 1 }, { name: "acme/other", count: 1 }])], "[environments-41] placed, each package its links wait for counted");
  const text = read(root, "specs/packages/tools.md");
  assert.ok(text.startsWith("<!-- Placed by Spex from acme/tools 1.0.0; an edit makes this file yours. -->\n\n# tools: tools\n"), `[environments-41] the marker line naming the package and version, then a blank line: ${text}`);
  assert.equal(text, placedText("acme/tools", "1.0.0", specText("tools")), "[environments-41] each address of a spec not standing removed with its brackets, the phrase kept");
  assert.doesNotMatch(text, /spex:/, "[environments-41] specs/ holds no address");
  assert.deepEqual(readPlacedRecord(root), {
    format: 1,
    specs: { "acme/tools": { path: "specs/packages/tools.md", version: "1.0.0", sha256: sha256(text), waiting: { "acme/absent": 1, "acme/other": 1 } } },
  }, "[environments-41] the release's version, the written bytes' hash and the waiting links recorded");
  assert.deepEqual(report.skills, [], "[environments-8] no spec skill where the root holds specs/");
  assert.equal(existsSync(join(root, ".claude", "skills", "acme-tools")), false);
  assert.equal(existsSync(join(root, ".spex", "skills", "acme-tools")), false);
  assert.doesNotMatch(readFileSync(join(root, ".git", "info", "exclude"), "utf8"), /specs/, "[environments-41] the placed file left for the reader to commit");

  // The cited package added: its spec stands, so the link appears.
  const other = specRelease(root, "acme/other", "1.0.0");
  const both = await place(root, { "acme/other": other, "acme/tools": tools });
  assert.deepEqual(both.specs, [placement("acme/other", "placed"), placement("acme/tools", "placed", [{ name: "acme/absent", count: 1 }])]);
  assert.equal(read(root, "specs/packages/tools.md"), placedText("acme/tools", "1.0.0", specText("tools").replace("shall stand.", "shall stand [[other-1](other.md#other-1)].")), "[environments-41] derived again, the address now a relative link");
  assert.equal(read(root, "specs/packages/other.md"), placedText("acme/other", "1.0.0", specText("other")));

  // Placed again as it stands: no file rewritten.
  const before = [stamp(join(root, "specs", "packages", "tools.md")), stamp(join(root, "specs", "packages", "other.md")), stamp(placedRecordPath(root))];
  const again = await place(root, { "acme/other": other, "acme/tools": tools });
  assert.deepEqual(again.specs, both.specs);
  assert.deepEqual([stamp(join(root, "specs", "packages", "tools.md")), stamp(join(root, "specs", "packages", "other.md")), stamp(placedRecordPath(root))], before, "[environments-41] nothing rewritten");

  // A newer release replaces a copy holding the bytes recorded.
  const newer = specRelease(root, "acme/tools", "1.1.0", ["acme/other"], " Now newer.");
  await place(root, { "acme/other": other, "acme/tools": newer });
  const moved = read(root, "specs/packages/tools.md");
  assert.equal(moved, placedText("acme/tools", "1.1.0", specText("tools", [], " Now newer.").replace("shall stand.", "shall stand [[other-1](other.md#other-1)].")), "[environments-41] an unedited copy follows its release, its marker naming the new version");
  assert.deepEqual(readPlacedRecord(root)?.specs["acme/tools"], { path: "specs/packages/tools.md", version: "1.1.0", sha256: sha256(moved), waiting: {} }, "[environments-41] the new version recorded");
  assert.deepEqual(readSpecPlacements(root, lockOf({ "acme/other": other, "acme/tools": newer })), [placement("acme/other", "placed"), placement("acme/tools", "placed")], "[environments-14] each read placed from the files and the record");
});

test("environments-41: an edited copy stands across a re-placement, reported edited with its record kept and the newer release's version waiting", async () => {
  const root = scratchRoot(true);
  await place(root, { "acme/tools": specRelease(root, "acme/tools", "1.0.0") });
  const recorded = readPlacedRecord(root);
  const edited = `${read(root, "specs/packages/tools.md")}\nThe reader's own line.\n`;
  writeFileSync(join(root, "specs", "packages", "tools.md"), edited);
  const lock = { "acme/tools": specRelease(root, "acme/tools", "1.1.0", [], " Now newer.") };
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), [placement("acme/tools", "edited", [], "1.1.0")], "[environments-14] read edited before any placement, the newer version waiting");
  const report = await place(root, lock);
  assert.deepEqual(report.specs, [placement("acme/tools", "edited", [], "1.1.0")], "[environments-41] reported edited, naming the version that waits");
  assert.equal(read(root, "specs/packages/tools.md"), edited, "[environments-41] the edited copy left standing, nothing placed over it");
  assert.deepEqual(readPlacedRecord(root), recorded, "[environments-41] its record kept, so it reads edited until the reader's bytes are Spex's again");
  assert.match(read(root, ".spex/packages/acme/tools/specs/en/tools.md"), /Now newer\./, "[environments-41] the newer release's file waits under .spex/");

  // Back at the version its marker names: edited, nothing waiting.
  const same = { "acme/tools": specRelease(root, "acme/tools", "1.0.0") };
  assert.deepEqual(readSpecPlacements(root, lockOf(same)), [placement("acme/tools", "edited")], "[environments-14] read edited, no version waiting");
  assert.deepEqual((await place(root, same)).specs, [placement("acme/tools", "edited")], "[environments-41] an edit of the same version waits for nothing");
  assert.equal(read(root, "specs/packages/tools.md"), edited);
});

test("environments-41: a recorded copy whose marker line the reader removed is edited, not blocked, its record kept", async () => {
  const root = scratchRoot(true);
  await place(root, { "acme/tools": specRelease(root, "acme/tools", "1.0.0") });
  const recorded = readPlacedRecord(root);
  const unmarked = `${read(root, "specs/packages/tools.md").split("\n").slice(2).join("\n")}\nOur note.\n`;
  writeFileSync(join(root, "specs", "packages", "tools.md"), unmarked);
  const lock = { "acme/tools": specRelease(root, "acme/tools", "1.1.0", [], " Now newer.") };
  const expected = [placement("acme/tools", "edited", [], "1.1.0")];
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), expected, "[environments-14] read edited, the record vouching for the path, the newer version waiting by the record");
  assert.deepEqual((await place(root, lock)).specs, expected, "[environments-41] the package's copy by the record: edited, not blocked");
  assert.equal(read(root, "specs/packages/tools.md"), unmarked, "[environments-41] left standing");
  assert.deepEqual(readPlacedRecord(root), recorded, "[environments-41] its record kept, so the install still knows the file as this package's");
});

test("environments-41: a file of the basename in a collection under specs/ blocks the placement, nothing written at specs/packages/", async () => {
  const root = scratchRoot(true);
  mkdirSync(join(root, "specs", "packages", "core"), { recursive: true });
  writeFileSync(join(root, "specs", "packages", "core", "tools.md"), "# tools: the project's own\n");
  const lock = { "acme/tools": specRelease(root, "acme/tools", "1.0.0") };
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), [placement("acme/tools", "blocked")], "[environments-14] read blocked");
  const report = await place(root, lock);
  assert.deepEqual(report.specs, [placement("acme/tools", "blocked")], "[environments-41] blocked, reported");
  assert.equal(existsSync(join(root, "specs", "packages", "tools.md")), false, "[environments-41] no second file of one basename under specs/");
  assert.equal(read(root, "specs/packages/core/tools.md"), "# tools: the project's own\n", "[environments-41] the project's file as it was");
  assert.equal(existsSync(placedRecordPath(root)), false, "[environments-41] nothing recorded");
});

test("environments-41: on a fresh clone a committed copy of a package whose files are not here stands for the links citing it", async () => {
  const root = scratchRoot(true);
  const other = specRelease(root, "acme/other", "1.0.0", ["acme/tools"]);
  // A folder package whose folder this clone lacks.
  const tools: Resolution = {
    source: { path: "kits/tools", version: "1.0.0", dependencies: {}, requires: {} },
    requiredBy: [],
    artifacts: { tools: { language: "en", fallback: false } },
    files: [],
    exports: { "acme-tools": "tools" },
  };
  const committedTools = placedText("acme/tools", "1.0.0", specText("tools"));
  const committedOther = placedText("acme/other", "1.0.0", specText("other").replace("shall stand.", "shall stand [[tools-1](tools.md#tools-1)]."));
  writeFileSync(join(root, "specs", "packages", "tools.md"), committedTools);
  writeFileSync(join(root, "specs", "packages", "other.md"), committedOther);
  const lock = { "acme/other": other, "acme/tools": tools };
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), [placement("acme/other", "placed")], "[environments-14] read placed, its link's package standing by its marker line");
  const stamps = [stamp(join(root, "specs", "packages", "tools.md")), stamp(join(root, "specs", "packages", "other.md"))];
  const report = await place(root, lock);
  assert.deepEqual(report.specs, [placement("acme/other", "placed")], "[environments-41] the copy citing it is the derivation, not edited");
  assert.deepEqual(report.missing, ["acme/tools"], "[environments-8] the folder package reported missing");
  assert.deepEqual([stamp(join(root, "specs", "packages", "tools.md")), stamp(join(root, "specs", "packages", "other.md"))], stamps, "[environments-41] nothing rewritten, as on the device that committed them");
  assert.deepEqual(Object.keys(readPlacedRecord(root)?.specs ?? {}), ["acme/other"], "[environments-41] the copy whose files are not here recorded by no derivation");
});

test("environments-41: a copy is the package's by its marker line — a committed copy edited under it is edited, not blocked — and a file without it, or naming another package, blocks", async () => {
  // A fresh clone: committed copies, no record.
  const root = scratchRoot(true);
  const edited = `${placedText("acme/tools", "1.0.0", specText("tools"))}\nOur own note.\n`;
  writeFileSync(join(root, "specs", "packages", "tools.md"), edited);
  // The release's text with no marker line, as the project's own file.
  writeFileSync(join(root, "specs", "packages", "plain.md"), specText("plain"));
  // Another package's marker over a file of this package's name.
  const theirs = placedText("zeta/kit", "1.0.0", specText("kit"));
  writeFileSync(join(root, "specs", "packages", "kit.md"), theirs);
  const lock = {
    "acme/kit": specRelease(root, "acme/kit", "1.0.0"),
    "acme/plain": specRelease(root, "acme/plain", "1.0.0"),
    "acme/tools": specRelease(root, "acme/tools", "1.1.0", [], " Now newer."),
  };
  const expected = [placement("acme/kit", "blocked"), placement("acme/plain", "blocked"), placement("acme/tools", "edited", [], "1.1.0")];
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), expected, "[environments-14] read as an install finds them");
  const report = await place(root, lock);
  assert.deepEqual(report.specs, expected, "[environments-41] the marked copy edited with the newer release's version waiting; the unmarked file and another package's copy each blocking");
  assert.equal(read(root, "specs/packages/tools.md"), edited, "[environments-41] the edited copy left standing");
  assert.equal(read(root, "specs/packages/plain.md"), specText("plain"), "[environments-41] a blocking file as it was");
  assert.equal(read(root, "specs/packages/kit.md"), theirs);
  assert.equal(existsSync(placedRecordPath(root)), false, "[environments-41] nothing recorded: no copy is the package's by its bytes");

  // The same version: edited, nothing waiting.
  const same = { "acme/tools": specRelease(root, "acme/tools", "1.0.0") };
  assert.deepEqual((await place(root, same)).specs, [placement("acme/tools", "edited")], "[environments-41] an edited copy of the same version waits for nothing");
});

test("environments-41: a removal takes an unedited copy and keeps an edited one as the project's own, reported edited, as does a release no longer providing its spec", async () => {
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
  assert.deepEqual(report.specs, [placement("acme/four", "edited"), placement("acme/two", "edited")], "[environments-41] each left as the project's own, reported edited");
  assert.equal(existsSync(placedRecordPath(root)), false, "[environments-41] a record of nothing is removed");
  // The edited copies are the project's: no longer Spex's to remove.
  await place(root, {});
  assert.equal(read(root, "specs/packages/two.md"), "# two: mine now\n");
});

test("environments-41: a file of the name blocks the placement — the project's own, and the second package of one <pkg> — and one holding the derivation is taken as placed and recorded", async () => {
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
  assert.equal(read(root, "specs/packages/kit.md"), placedText("acme/kit", "1.0.0", specText("kit")), "[environments-41] the first in name order's copy");
  assert.match(read(root, "specs/packages/tools.md"), /shall stand \[\[kit-1\]\(kit\.md#kit-1\)\]\./, "[environments-41] a blocked package's links wait, a placed one's resolve");
  const recorded = readPlacedRecord(root)!;
  assert.deepEqual(Object.keys(recorded.specs), ["acme/kit", "acme/tools"], "[environments-41] a blocked spec is not recorded");
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), report.specs, "[environments-14] each read back as the placement reported it");

  // A clone of committed copies, checked out with CRLF line endings as
  // Git for Windows does by default: the files stand, the record does
  // not; each whose text, CRLF read as LF, is the derivation is adopted
  // and recorded, nothing rewritten.
  rmSync(placedRecordPath(root));
  for (const pkg of ["kit", "tools"]) writeFileSync(join(root, "specs", "packages", `${pkg}.md`), read(root, `specs/packages/${pkg}.md`).replace(/\n/g, "\r\n"));
  const kit = stamp(join(root, "specs", "packages", "kit.md"));
  assert.deepEqual(readSpecPlacements(root, lockOf(lock)), report.specs, "[environments-14] committed copies read as placed with no record");
  const again = await place(root, lock);
  assert.deepEqual(again.specs, report.specs, "[environments-41] committed copies taken as placed");
  assert.equal(stamp(join(root, "specs", "packages", "kit.md")), kit, "[environments-41] and not rewritten");
  assert.deepEqual(readPlacedRecord(root), recorded, "[environments-41] each recorded as the package's copy, its version and hash");
});

test("environments-41: of two packages of one <pkg>, the one whose copy stands keeps its place and a later arrival first by <org> is blocked, by the record and by the marker line on a fresh clone; the copy gone with its package, the other is placed", async () => {
  const root = scratchRoot(true);
  const zeta = specRelease(root, "zeta/kit", "1.0.0", [], " Zeta's.");
  await place(root, { "zeta/kit": zeta });
  const standing = read(root, "specs/packages/kit.md");
  assert.equal(standing, placedText("zeta/kit", "1.0.0", specText("kit", [], " Zeta's.")), "[environments-41] zeta/kit placed alone");
  const acme = specRelease(root, "acme/kit", "1.0.0");
  const both = { "acme/kit": acme, "zeta/kit": zeta };
  const report = await place(root, both);
  assert.deepEqual(report.specs, [placement("acme/kit", "blocked"), placement("zeta/kit", "placed")], "[environments-41] the copy standing keeps its place; the arrival, first by <org>, is blocked");
  assert.equal(read(root, "specs/packages/kit.md"), standing, "[environments-41] the copy as it was");
  assert.deepEqual(Object.keys(readPlacedRecord(root)!.specs), ["zeta/kit"], "[environments-41] the blocked arrival not recorded");
  // A fresh clone: no record, and the marker line names the copy's package.
  rmSync(placedRecordPath(root));
  assert.deepEqual((await place(root, both)).specs, report.specs, "[environments-41] by the marker line alike");
  assert.equal(read(root, "specs/packages/kit.md"), standing, "[environments-41] and not rewritten");
  // zeta/kit leaves the lock: its unedited copy leaves, and acme/kit is placed.
  const after = await place(root, { "acme/kit": acme });
  assert.deepEqual(after.specs, [placement("acme/kit", "placed")], "[environments-41] the copy gone with its package, the other placed");
  assert.equal(read(root, "specs/packages/kit.md"), placedText("acme/kit", "1.0.0", specText("kit")), "[environments-41] acme/kit's derivation");
  assert.deepEqual(Object.keys(readPlacedRecord(root)!.specs), ["acme/kit"]);
});

test("environments-43: a copy committed at a newer release's version reads as the package's, not edited, on a device whose record held the older hash", async () => {
  const root = scratchRoot(true);
  const older = specRelease(root, "acme/tools", "1.0.0");
  await place(root, { "acme/tools": older });
  const olderHash = readPlacedRecord(root)!.specs["acme/tools"]!.sha256;
  // Pulled: the lock and the copy another device placed at 1.1.0.
  const newer = placedText("acme/tools", "1.1.0", specText("tools", [], " Now newer."));
  writeFileSync(join(root, "specs", "packages", "tools.md"), newer);
  const pulled = { ...older, source: { ...older.source, version: "1.1.0" } } as Resolution;
  assert.deepEqual(readSpecPlacements(root, lockOf({ "acme/tools": pulled })), [], "[environments-14] left out while the files under .spex/ are not the release the lock locks");

  // Installed: the copy is the derivation of the release now there.
  const installed = { "acme/tools": specRelease(root, "acme/tools", "1.1.0", [], " Now newer.") };
  assert.deepEqual(readSpecPlacements(root, lockOf(installed)), [placement("acme/tools", "placed")], "[environments-14] read placed, not edited");
  const file = join(root, "specs", "packages", "tools.md");
  const before = stamp(file);
  const report = await place(root, installed);
  assert.deepEqual(report.specs, [placement("acme/tools", "placed")], "[environments-41] the package's copy, not edited");
  assert.equal(stamp(file), before, "[environments-41] nothing rewritten");
  const entry = readPlacedRecord(root)!.specs["acme/tools"]!;
  assert.deepEqual(entry, { path: "specs/packages/tools.md", version: "1.1.0", sha256: sha256(newer), waiting: {} }, "[environments-41] recorded at the newer version");
  assert.notEqual(entry.sha256, olderHash);
});

test("environments-8: a project without specs/ places its spec nowhere and reports it, and your own group's writes the generated skill", async () => {
  const project = scratchRoot(false);
  const release = specText("tools");
  const report = await place(project, { "acme/tools": specRelease(project, "acme/tools", "1.0.0") });
  assert.deepEqual(report.specs, [placement("acme/tools", "no-specs")], "[environments-41] reported waiting for specs/");
  assert.deepEqual(report.skills, [], "[environments-8] no generated skill in a project");
  for (const folder of [".claude", ".agents", ".spex"]) {
    assert.equal(existsSync(join(project, folder, "skills", "acme-tools")), false, `[environments-8] nothing in ${folder}/skills`);
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

test("environments-6: a support skill is not copied, a peer playbook gets its skill, and a spec a release does not provide is not placed", async () => {
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
  assert.deepEqual(report.skills, ["check", "make", "tip"], "[environments-6] the provided playbooks' and skill's alone");
  assert.equal(existsSync(join(root, ".spex", "skills", "lint")), false, "[environments-6] a skill a playbook requires is not copied");
  assert.ok(existsSync(join(root, ".spex", "skills", "check", "SKILL.md")), "[environments-6] a playbook a playbook requires is a peer, its skill placed");
  assert.equal(existsSync(join(root, ".claude", "skills", "lint")), false);
  assert.equal(existsSync(join(root, "specs", "packages", "widgets.md")), false, "[environments-6] a playbook's source spec is not placed");
  assert.equal(existsSync(join(root, "specs", "packages", "tips.md")), false, "[environments-6] a spec of a kind provides does not list is not placed");
  assert.deepEqual(report.specs, [], "[environments-41] no spec placement to report");
  // The lock names every selected artifact, as a Spex resolving before
  // `provides` wrote it: a name no release provides is placed nowhere.
  assert.equal(JSON.stringify(lock), exportsBefore, "[environments-6] an older lock placed as it stands, never rewritten by a placement");
  assert.ok(existsSync(join(root, ".spex", "packages", "acme", "widgets", "skills", "en", "lint", "SKILL.md")), "[environments-6] installed with the rest");
});
