#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTag, requireUnpublished } from "./release-version.mjs";
export { parseTag } from "./release-version.mjs";

/**
 * The lines of a changelog section, its heading and the next section's
 * excluded. The last section runs to the file's end, where the link
 * definitions live; those lines are not notes and are dropped.
 */
export function changelogSection(changelog, section) {
  const lines = changelog.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const heading = `## [${section}]`;
  const kept = [];
  let inside = false;
  for (const line of lines) {
    if (!inside) {
      if (line.startsWith(heading)) inside = true;
      continue;
    }
    if (line.startsWith("## [")) {
      inside = false;
      continue;
    }
    if (/^\[[^\]]+\]: /.test(line)) continue;
    kept.push(line);
  }
  return kept.map((line) => `${line}\n`).join("");
}

/** Blank lines and headings alone are no notes: a section left empty
 * by the last release still holds a blank line. The classes are grep's
 * `#.*` and `[[:space:]]*`, whose dot takes a carriage return and whose
 * space is ASCII's alone, so a CRLF heading reads as a heading. */
export function hasNotes(section) {
  return section.split("\n").some((line) => !/^(#[^\n]*|[ \t\v\f\r]*)$/.test(line));
}

/** Point repository-relative links at the tree at this tag: resolved
 * against the release page, they would lead nowhere. */
export function pinLinks(text, repository, tag) {
  return text.replace(
    /\]\((specs\/|docs\/|packages\/|apps\/|README\.md)/g,
    (_, path) => `](https://github.com/${repository}/blob/${tag}/${path}`,
  );
}

export function generatedChanges(root, release, repository, releases) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = git("rev-parse", "HEAD");
  if (git("rev-parse", `refs/tags/${release.tag}^{commit}`) !== commit) throw new Error("Release tag does not name the checked-out commit");
  const published = releases.filter(item => !item.draft && item.published_at && item.tag_name !== release.tag)
    .filter(item => { try { return parseTag(item.tag_name).channel === release.channel; } catch { return false; } })
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  const previous = published.find(item => spawnSync("git", ["merge-base", "--is-ancestor", `refs/tags/${item.tag_name}`, "HEAD"], { cwd: root, stdio: "ignore" }).status === 0);
  const log = previous ? git("log", "--reverse", "--format=%H%x09%s", `${previous.tag_name}..HEAD`, "--") : "";
  const lines = log ? log.split("\n").map(line => { const [sha, ...subject] = line.split("\t"); return `- ${subject.join("\t")} ([${sha.slice(0, 8)}](https://github.com/${repository}/commit/${sha}))`; })
    : [previous ? "- No source commits since the previous published version." : "- First release on this history for this channel."];
  return `## Changes\n\n${lines.join("\n")}\n\nSource: [${commit}](https://github.com/${repository}/commit/${commit}).\n` +
    (previous ? `\n[Full changes](https://github.com/${repository}/compare/${previous.tag_name}...${release.tag})\n` : "");
}

export function releaseNotes({ changelog, release, repository, generated }) {
  const curated = changelogSection(changelog, release.version);
  const notes = hasNotes(curated) ? pinLinks(curated, repository, release.tag) : generated;
  if (!hasNotes(notes ?? "")) throw new Error("Release notes need a version section or generated commit history");
  if (release.channel === "cli") return `${notes}\n\nInstall: npm install -g @sublang/spex@${release.version}\n`;
  const { version, tag } = release;
  const blob = `https://github.com/${repository}/blob/${tag}`;
  return [release.beta ? `Beta ${release.n} on the way to ${release.base}.\n\n` : "", notes,
    "\n\n## Desktop downloads\n\n",
    `- macOS (M-series, arm64): [Spex-${version}-mac-arm64.dmg](https://github.com/${repository}/releases/download/${tag}/Spex-${version}-mac-arm64.dmg) — open the DMG and drag Spex.app to Applications.\n`,
    `- Windows (Intel/AMD x86-64): [Spex-${version}-win-x64.exe](https://github.com/${repository}/releases/download/${tag}/Spex-${version}-win-x64.exe) — run the per-user installer; WSL is not required.\n`,
    `- [SHA256SUMS](https://github.com/${repository}/releases/download/${tag}/SHA256SUMS) verifies both downloads.\n\n`,
    "The macOS app and DMG are Developer ID signed and Apple notarized, with stapled tickets. The Windows installer is unsigned; Windows may require approval before opening. Agent sign-in and model access are configured separately.\n\n",
    "## Run from source\n\nBuild with Node.js 22.19 or later and the platform build tools.\n\n```bash\n",
    `git clone https://github.com/${repository}.git\ncd spex\ngit checkout ${tag}\n`,
    `node scripts/release-version.mjs prepare --tag=${tag}\nnpm ci\nnpm start\n# or: npm run start:server\n`,
    `\x60\x60\x60\n\nAgent sign-in and compile prerequisites are in the [README](${blob}/README.md).\n`,
  ].join("");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = Object.fromEntries(args.map(arg => { const match = /^--([a-z]+)=(.*)$/.exec(arg); if (!match) throw new Error(`Unknown argument: ${arg}`); return [match[1], match[2]]; }));
    if (command !== "notes") throw new Error("Use notes --tag=... --repository=... --out=...");
    const release = parseTag(options.tag ?? "");
    const repository = options.repository;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) throw new Error("Invalid repository");
    const root = resolve(options.root ?? ".");
    const releases = options.releases ? JSON.parse(readFileSync(options.releases, "utf8"))
      : JSON.parse(execFileSync("gh", ["api", `repos/${repository}/releases?per_page=100`, "--paginate", "--slurp"], { encoding: "utf8" })).flat();
    await requireUnpublished(release, { releases, ...(options.registry ? { registry: options.registry } : {}) });
    const generated = generatedChanges(root, release, repository, releases);
    let changelog = "";
    try { changelog = readFileSync(join(root, release.channel === "app" ? "CHANGELOG.md" : "packages/cli/CHANGELOG.md"), "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const body = releaseNotes({ changelog, release, repository, generated });
    writeFileSync(options.out, body);
    process.stdout.write(body);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
