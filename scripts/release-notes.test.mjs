// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { generatedChanges, parseTag, releaseNotes } from "./release-notes.mjs";

const script = resolve(import.meta.dirname, "release-notes.mjs");
const repository = "sublang-ai/spex";
const changelog = `# Changelog
## [Unreleased]
- Stale unreleased text must not leak.
## [1.2.3] - 2026-11-03
### Fixed
- Curated fix in [guide](docs/release-smoke.md), [README](README.md) and [external](https://example.com/guide).
## [1.2.2]
- Older text must not leak.
[1.2.3]: https://example.com/compare
`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "spex-release-notes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Release test");
  git("config", "user.email", "release@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  let n = 0;
  const commit = subject => {
    writeFileSync(join(root, "source"), String(++n));
    git("add", "source"); git("commit", "-m", subject);
    return git("rev-parse", "HEAD");
  };
  return { root, git, commit };
}
const published = (tag, day) => ({ tag_name: tag, published_at: `2026-11-${day}T00:00:00Z`, draft: false });

test("release-28: curated notes belong only to the exact version and links use the tagged tree", () => {
  const release = parseTag("app-v1.2.3");
  const notes = releaseNotes({ changelog, release, repository, generated: "fallback must not leak" });
  assert.match(notes, /Curated fix/);
  assert.doesNotMatch(notes, /Stale|Older|fallback|^\[1\.2\.3\]:/m);
  assert.match(notes, /blob\/app-v1\.2\.3\/docs\/release-smoke\.md/);
  assert.match(notes, /blob\/app-v1\.2\.3\/README\.md/);
  assert.match(notes, /https:\/\/example\.com\/guide/);
  assert.match(notes, /Spex-1\.2\.3-mac-arm64\.dmg/);
  assert.match(notes, /Spex-1\.2\.3-win-x64\.exe/);
  assert.match(notes, /SHA256SUMS/);
  assert.match(notes, /Developer ID signed and Apple notarized/);
  assert.match(notes, /Windows installer is unsigned/);
});

test("release-28: generated ranges use the newest published ancestor in the same channel", t => {
  const { root, git, commit } = fixture(t);
  commit("base"); git("tag", "app-v1.2.0");
  commit("first change"); git("tag", "app-v1.2.1");
  git("branch", "divergent");
  commit("second change"); git("tag", "cli-v9.0.0"); git("tag", "app-v1.2.2");
  const head = commit("final change"); git("tag", "app-v1.2.3-beta.1");
  git("checkout", "divergent"); commit("unrelated branch"); git("tag", "app-v8.0.0"); git("checkout", "main");
  const releases = [published("app-v1.2.0", "01"), published("app-v1.2.1", "02"),
    published("cli-v9.0.0", "03"), { ...published("app-v1.2.2", "04"), draft: true }, published("app-v8.0.0", "05")];
  const generated = generatedChanges(root, parseTag("app-v1.2.3-beta.1"), repository, releases);
  assert.doesNotMatch(generated, /- base|first change|unrelated branch/);
  assert.match(generated, /second change/);
  assert.match(generated, /final change/);
  assert.match(generated, /compare\/app-v1\.2\.1\.\.\.app-v1\.2\.3-beta\.1/);
  assert.match(generated, new RegExp(`Source: \\[${head}\\]`));
  const beta = releaseNotes({ changelog, release: parseTag("app-v1.2.3-beta.1"), repository, generated });
  assert.match(beta, /^Beta 1 on the way to 1\.2\.3\./);
  assert.doesNotMatch(beta, /Curated fix|Stale|waived|This beta ran/);
  git("tag", "app-v1.2.3-beta.2");
  const next = generatedChanges(root, parseTag("app-v1.2.3-beta.2"), repository, [...releases, published("app-v1.2.3-beta.1", "06")]);
  assert.match(next, /No source commits since the previous published version/);
  assert.doesNotMatch(next, /second change|final change/);
});

test("app-shell-36: no version bump or changelog section is needed by the actual notes command", t => {
  const { root, git, commit } = fixture(t);
  commit("source without version bump"); git("tag", "app-v2.0.0-beta.1");
  const records = join(root, "releases.json"); writeFileSync(records, "[]");
  const out = join(root, "notes.md");
  const args = [script, "notes", "--tag=app-v2.0.0-beta.1", `--repository=${repository}`, `--out=${out}`, `--root=${root}`, `--releases=${records}`];
  const run = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const body = readFileSync(out, "utf8");
  assert.equal(run.stdout, body);
  assert.match(body, /First release on this history for this channel/);
  assert.match(body, /git checkout app-v2\.0\.0-beta\.1\nnode scripts\/release-version\.mjs prepare --tag=app-v2\.0\.0-beta\.1\nnpm ci/);
  assert.match(body, /Node\.js 22\.19 or later/);
  writeFileSync(records, JSON.stringify([published("app-v2.0.0-beta.1", "03")]));
  const repeated = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.notEqual(repeated.status, 0); assert.match(repeated.stderr, /Release already exists/);
  commit("wrong checkout");
  assert.throws(() => generatedChanges(root, parseTag("app-v2.0.0-beta.1"), repository, []), /does not name the checked-out commit/);
});

test("release-28: CLI notes use their own title/version and invalid forms are refused", () => {
  const release = parseTag("cli-v5.0.1");
  assert.equal(release.title, "Spex CLI v5.0.1");
  const body = releaseNotes({ changelog, release, repository, generated: "## Changes\n\n- CLI change.\n" });
  assert.match(body, /CLI change/);
  assert.match(body, /npm install -g @sublang\/spex@5\.0\.1/);
  assert.doesNotMatch(body, /Desktop downloads|Stale|Curated/);
  for (const tag of ["app-v01.2.3", "app-v1.2.3-beta.0", "app-v1.2.3-rc.1", "app-v1.2.3+build", "cli-v1.2.3-beta.1"]) assert.throws(() => parseTag(tag), /Invalid release tag/);
  assert.throws(() => releaseNotes({ changelog: "## [Unreleased]\n- stale", release, repository }), /need a version section or generated/);
  const crlf = changelog.replaceAll("\n", "\r\n");
  assert.match(releaseNotes({ changelog: crlf, release: parseTag("app-v1.2.3"), repository }), /Curated fix/);
});
