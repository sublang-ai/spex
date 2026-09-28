// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// release-28: the app release's tag check and notes, run the way the
// app-release workflow runs them — the command over a checkout holding
// a changelog and both shell manifests — for the regular and beta forms,
// the refused forms, empty notes, and links pinned to the tag.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseTag, releaseNotes } from "./release-notes.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "release-notes.mjs");
const REPO = "sublang-ai/spex";

const CHANGELOG = `# Changelog

Preamble text that is no release's notes.

## [Unreleased]

### Added

- A beta feature, recorded in [DR-087](specs/decisions/087-beta-app-releases.md).

## [1.2.3] - 2026-09-28

### Fixed

- A fix described in [the guide](docs/release-smoke.md) and the [README](README.md),
  beside [an external page](https://example.com/specs/x) left alone.

## [1.2.2] - 2026-09-01

### Changed

- An older change.

[Unreleased]: https://github.com/sublang-ai/spex/compare/app-v1.2.3...HEAD
[1.2.3]: https://github.com/sublang-ai/spex/compare/app-v1.2.2...app-v1.2.3
[1.2.2]: https://github.com/sublang-ai/spex/releases/tag/app-v1.2.2
`;

/** A checkout the workflow would see: the changelog and both shells'
 * manifests at one version. */
function checkout(t, { version, changelog = CHANGELOG, server = version }) {
  const root = mkdtempSync(join(tmpdir(), "release-notes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  for (const [shell, shellVersion] of [["desktop", version], ["server", server]]) {
    mkdirSync(join(root, "apps", shell), { recursive: true });
    writeFileSync(
      join(root, "apps", shell, "package.json"),
      JSON.stringify({ name: shell, version: shellVersion }),
    );
  }
  return root;
}

/** The command as the workflow calls it; GitHub's outputs file read
 * back as a record. */
function run(root, ...args) {
  const outputFile = join(root, "github-output");
  writeFileSync(outputFile, "");
  const result = spawnSync(process.execPath, [script, ...args, `--root=${root}`], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: outputFile, GITHUB_ACTIONS: "true" },
  });
  const outputs = Object.fromEntries(
    readFileSync(outputFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
  return { ...result, outputs };
}

test("a regular tag checks both manifests and takes its version's section, links pinned to the tag", (t) => {
  const root = checkout(t, { version: "1.2.3" });
  const check = run(root, "check", "--tag=app-v1.2.3");
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(check.outputs, {
    version: "1.2.3",
    beta: "false",
    base: "1.2.3",
    n: "",
    title: "Spex App v1.2.3",
  });

  const out = join(root, "notes.md");
  const notes = run(root, "notes", "--tag=app-v1.2.3", `--repository=${REPO}`, `--out=${out}`);
  assert.equal(notes.status, 0, notes.stderr);
  const body = readFileSync(out, "utf8");
  // The version's own section, nothing of its neighbours or the file's
  // link definitions.
  assert.ok(body.startsWith("\n### Fixed\n\n- A fix described in"), body);
  assert.doesNotMatch(body, /A beta feature|An older change|Preamble/);
  assert.doesNotMatch(body, /^\[[^\]]+\]: /m);
  // Repository-relative links open the tagged tree; others stand.
  assert.match(body, /\[the guide\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.2\.3\/docs\/release-smoke\.md\)/);
  assert.match(body, /\[README\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.2\.3\/README\.md\)/);
  assert.match(body, /\[an external page\]\(https:\/\/example\.com\/specs\/x\)/);
  // The run-from-source instructions check out this tag; no beta line.
  assert.match(body, /## Run from source\n/);
  assert.match(body, /git checkout app-v1\.2\.3\n/);
  assert.doesNotMatch(body, /^Beta /m);
  assert.doesNotMatch(body, /This beta ran/);
  assert.equal(notes.stdout, body);
});

test("a beta tag takes [Unreleased] under its line, and names the gates it skipped", (t) => {
  const root = checkout(t, { version: "1.3.0-beta.2" });
  const check = run(root, "check", "--tag=app-v1.3.0-beta.2");
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(check.outputs, {
    version: "1.3.0-beta.2",
    beta: "true",
    base: "1.3.0",
    n: "2",
    title: "Spex App v1.3.0-beta.2",
  });

  const out = join(root, "notes.md");
  const notes = run(root, "notes", "--tag=app-v1.3.0-beta.2", `--repository=${REPO}`, `--out=${out}`);
  assert.equal(notes.status, 0, notes.stderr);
  const body = readFileSync(out, "utf8");
  assert.ok(body.startsWith("Beta 2 on the way to 1.3.0 — everything unreleased at this tag.\n\n"), body);
  assert.match(body, /A beta feature, recorded in \[DR-087\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.3\.0-beta\.2\/specs\/decisions\/087-beta-app-releases\.md\)/);
  assert.doesNotMatch(body, /A fix described in/);
  assert.match(body, /git checkout app-v1\.3\.0-beta\.2\n/);
  assert.match(
    body,
    /\n\nThis beta ran CI, the smoke and the live smoke; the regression and the manual checklist run before the regular release \(\[DR-087\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.3\.0-beta\.2\/specs\/decisions\/087-beta-app-releases\.md\)\)\.\n$/,
  );
});

test("a tag in any other form is refused before anything is read", (t) => {
  for (const tag of [
    "app-v1.2.3-beta.0",
    "app-v1.2.3-beta.01",
    "app-v1.2.3-rc.1",
    "app-v1.2.3+build.5",
    "app-v1.2.3-beta.1+build",
    "app-v01.2.3",
    "app-v1.2",
    "cli-v1.2.3",
  ]) {
    assert.throws(() => parseTag(tag), /neither app-vMAJOR\.MINOR\.PATCH nor/, tag);
    const root = checkout(t, { version: tag.replace(/^[a-z]+-v/, "") });
    const check = run(root, "check", `--tag=${tag}`);
    assert.equal(check.status, 1, tag);
    assert.match(check.stderr, /^::error::Tag .* is neither/, tag);
    assert.deepEqual(check.outputs, {}, tag);
    const notes = run(root, "notes", `--tag=${tag}`, `--repository=${REPO}`, `--out=${join(root, "notes.md")}`);
    assert.equal(notes.status, 1, tag);
  }
});

test("a manifest off the tag's version refuses the release", (t) => {
  // A beta tag over manifests still at the base version, and one shell
  // bumped without the other.
  for (const [version, server, tag] of [
    ["1.3.0", "1.3.0", "app-v1.3.0-beta.1"],
    ["1.2.3", "1.2.2", "app-v1.2.3"],
  ]) {
    const root = checkout(t, { version, server });
    const check = run(root, "check", `--tag=${tag}`);
    assert.equal(check.status, 1, tag);
    assert.match(check.stderr, /does not match apps\/(desktop|server)\/package\.json/, tag);
    assert.deepEqual(check.outputs, {}, tag);
  }
});

test("empty notes are refused: an [Unreleased] holding only headings, a version with no section", (t) => {
  const emptied = CHANGELOG.replace(
    "### Added\n\n- A beta feature, recorded in [DR-087](specs/decisions/087-beta-app-releases.md).\n",
    "### Added\n\n",
  );
  assert.throws(
    () => releaseNotes({ changelog: emptied, release: parseTag("app-v1.3.0-beta.1"), repository: REPO }),
    /No release notes found under \[Unreleased\]/,
  );
  const root = checkout(t, { version: "1.3.0-beta.1", changelog: emptied });
  const out = join(root, "notes.md");
  const beta = run(root, "notes", "--tag=app-v1.3.0-beta.1", `--repository=${REPO}`, `--out=${out}`);
  assert.equal(beta.status, 1);
  assert.match(beta.stderr, /::error::No release notes found under \[Unreleased\] in CHANGELOG\.md for app-v1\.3\.0-beta\.1/);
  const missing = run(root, "notes", "--tag=app-v9.9.9", `--repository=${REPO}`, `--out=${out}`);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /No release notes found under \[9\.9\.9\]/);
});
