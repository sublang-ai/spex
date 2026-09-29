// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// release-28 and app-shell-36: the app release's tag check and notes,
// run the way the app-release workflow runs them — the command over a
// checkout holding a changelog and both shell manifests. release-28
// holds the release rules: the regular and beta forms with their titles
// and notes, links pinned to the tag, the refused forms, and a beta's
// manifests and empty notes. app-shell-36 holds the app shell's release:
// a regular release's run-from-source instructions, its manifest check,
// and its empty notes.

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

/** The changelog with `[Unreleased]` holding its heading alone. */
const EMPTIED = CHANGELOG.replace(
  "### Added\n\n- A beta feature, recorded in [DR-087](specs/decisions/087-beta-app-releases.md).\n",
  "### Added\n\n",
);

/** A checkout the workflow would see: the changelog and both shells'
 * manifests, at one version unless a shell is given its own. */
function checkout(t, { version, changelog = CHANGELOG, desktop = version, server = version }) {
  const root = mkdtempSync(join(tmpdir(), "release-notes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  for (const [shell, shellVersion] of [["desktop", desktop], ["server", server]]) {
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

/** The notes the workflow would publish for a tag, read from the file
 * the command wrote. */
function notesFor(t, tag, version) {
  const root = checkout(t, { version });
  const out = join(root, "notes.md");
  const notes = run(root, "notes", `--tag=${tag}`, `--repository=${REPO}`, `--out=${out}`);
  assert.equal(notes.status, 0, notes.stderr);
  const body = readFileSync(out, "utf8");
  assert.equal(notes.stdout, body);
  return body;
}

/** The check over manifests off the tag's version: refused, naming the
 * manifest, with no outputs for the release step. */
function assertRefusedManifest(t, tag, versions, manifest) {
  const root = checkout(t, versions);
  const check = run(root, "check", `--tag=${tag}`);
  assert.equal(check.status, 1, tag);
  assert.match(check.stderr, new RegExp(`does not match apps/${manifest}/package\\.json`), tag);
  assert.deepEqual(check.outputs, {}, tag);
}

test("release-28: a regular tag checks both manifests and takes its version's section, links pinned to the tag", (t) => {
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

  const body = notesFor(t, "app-v1.2.3", "1.2.3");
  // The version's own section, nothing of its neighbours or the file's
  // link definitions.
  assert.ok(body.startsWith("\n### Fixed\n\n- A fix described in"), body);
  assert.doesNotMatch(body, /A beta feature|An older change|Preamble/);
  assert.doesNotMatch(body, /^\[[^\]]+\]: /m);
  // Repository-relative links open the tagged tree; others stand.
  assert.match(body, /\[the guide\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.2\.3\/docs\/release-smoke\.md\)/);
  assert.match(body, /\[README\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.2\.3\/README\.md\)/);
  assert.match(body, /\[an external page\]\(https:\/\/example\.com\/specs\/x\)/);
  assert.doesNotMatch(body, /^Beta /m);
});

test("app-shell-36: a regular release's notes end with the run-from-source instructions at the root manifest's floor", (t) => {
  const body = notesFor(t, "app-v1.2.3", "1.2.3");
  const at = body.indexOf("## Run from source\n");
  assert.ok(at > body.indexOf("- A fix described in"), body);
  const instructions = body.slice(at);
  // Node.js at the floor the root manifest declares, then the tag
  // checked out before the install and both shells' commands.
  const floor = JSON.parse(readFileSync(join(dirname(script), "..", "package.json"), "utf8"))
    .engines.node.replace(/^>=/, "");
  assert.equal(floor, "22.19");
  assert.match(instructions, new RegExp(`with Node\\.js ${floor.replace(".", "\\.")} or later and`));
  assert.match(
    instructions,
    /git checkout app-v1\.2\.3\nnpm ci\nnpm start +# the desktop app\nnpm run start:server +# the server shell/,
  );
  // The README line closes a regular release's notes: no beta line.
  assert.match(
    instructions,
    /prerequisites are in the \[README\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.2\.3\/README\.md\)\.\n$/,
  );
  assert.doesNotMatch(body, /This beta ran/);
});

test("release-28: a beta tag takes [Unreleased] under its line, and names the gates it skipped", (t) => {
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

  const body = notesFor(t, "app-v1.3.0-beta.2", "1.3.0-beta.2");
  assert.ok(body.startsWith("Beta 2 on the way to 1.3.0 — everything unreleased at this tag.\n\n"), body);
  assert.match(body, /A beta feature, recorded in \[DR-087\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.3\.0-beta\.2\/specs\/decisions\/087-beta-app-releases\.md\)/);
  assert.doesNotMatch(body, /A fix described in/);
  assert.match(body, /git checkout app-v1\.3\.0-beta\.2\n/);
  assert.match(
    body,
    /\n\nThis beta ran CI, the smoke and the live smoke; the regression and the manual checklist run before the regular release \(\[DR-087\]\(https:\/\/github\.com\/sublang-ai\/spex\/blob\/app-v1\.3\.0-beta\.2\/specs\/decisions\/087-beta-app-releases\.md\)\)\.\n$/,
  );
});

test("release-28: a tag in any other form is refused before anything is read", (t) => {
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

test("release-28: a beta tag over manifests off its pre-release version refuses the release", (t) => {
  // Both shells still at the base version, then one shell bumped
  // without the other.
  assertRefusedManifest(t, "app-v1.3.0-beta.1", { version: "1.3.0" }, "desktop");
  assertRefusedManifest(t, "app-v1.3.0-beta.1", { version: "1.3.0-beta.1", server: "1.3.0" }, "server");
});

test("app-shell-36: either shell's manifest off a regular tag's version refuses the release", (t) => {
  assertRefusedManifest(t, "app-v1.2.3", { version: "1.2.3", desktop: "1.2.2" }, "desktop");
  assertRefusedManifest(t, "app-v1.2.3", { version: "1.2.3", server: "1.2.2" }, "server");
});

test("release-28: a beta's [Unreleased] holding only headings is refused as empty notes, LF or CRLF", (t) => {
  const beta = parseTag("app-v1.3.0-beta.1");
  assert.throws(
    () => releaseNotes({ changelog: EMPTIED, release: beta, repository: REPO }),
    /No release notes found under \[Unreleased\]/,
  );
  const root = checkout(t, { version: "1.3.0-beta.1", changelog: EMPTIED });
  const refused = run(root, "notes", "--tag=app-v1.3.0-beta.1", `--repository=${REPO}`, `--out=${join(root, "notes.md")}`);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /::error::No release notes found under \[Unreleased\] in CHANGELOG\.md for app-v1\.3\.0-beta\.1/);

  // The same files with CRLF line endings: a heading ending in a
  // carriage return is still a heading, as grep read it in the workflow,
  // and a note is still a note.
  const crlf = (text) => text.replaceAll("\n", "\r\n");
  assert.throws(
    () => releaseNotes({ changelog: crlf(EMPTIED), release: beta, repository: REPO }),
    /No release notes found under \[Unreleased\]/,
  );
  assert.match(releaseNotes({ changelog: crlf(CHANGELOG), release: beta, repository: REPO }), /A beta feature/);
});

test("app-shell-36: a regular tag's version with no changelog section is refused as empty notes", (t) => {
  const root = checkout(t, { version: "9.9.9" });
  const missing = run(root, "notes", "--tag=app-v9.9.9", `--repository=${REPO}`, `--out=${join(root, "notes.md")}`);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /::error::No release notes found under \[9\.9\.9\] in CHANGELOG\.md for app-v9\.9\.9/);
});
