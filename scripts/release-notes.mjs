#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The app release's tag check and notes (release-11, release-19,
// release-27; DR-040, DR-087), run by .github/workflows/app-release.yml
// and tested by release-notes.test.mjs (release-28). Pure functions
// plus a command the workflow calls in two steps:
//
//   node scripts/release-notes.mjs check --tag=<tag>
//     Parse the tag — app-vMAJOR.MINOR.PATCH is a regular release and
//     app-vMAJOR.MINOR.PATCH-beta.N a beta, N counting from 1, no
//     number with a leading zero; any other pre-release identifier or
//     build metadata is refused — and require both shell manifests to
//     carry its version verbatim. Writes version, beta, base, n and
//     title to $GITHUB_OUTPUT when set.
//
//   node scripts/release-notes.mjs notes --tag=<tag> --repository=<owner/repo> --out=<file>
//     Assemble the release notes: the changelog section of the tag's
//     version (a beta's is [Unreleased], under a line naming the beta),
//     link definitions dropped, empty notes refused, repository-relative
//     links pointed at the tagged tree, then the run-from-source
//     instructions, and for a beta the line naming the gates it skipped.
//
// Node built-ins only: the workflow runs the check before `npm ci`.

import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The two manifests an app tag's version must match (release-16). */
export const SHELL_MANIFESTS = ["apps/desktop/package.json", "apps/server/package.json"];

const TAG_PREFIX = "app-v";
// MAJOR.MINOR.PATCH, then an optional -beta.N with N from 1; SemVer
// forbids a leading zero in any numeric identifier.
const NUMBER = "(0|[1-9][0-9]*)";
const FORM = new RegExp(`^(${NUMBER}\\.${NUMBER}\\.${NUMBER})(-beta\\.([1-9][0-9]*))?$`);

/** Parse an app tag into its release form, or throw naming the forms
 * the channel accepts. */
export function parseTag(tag) {
  const version = tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : "";
  const match = FORM.exec(version);
  if (!match) {
    throw new Error(
      `Tag ${tag} is neither app-vMAJOR.MINOR.PATCH nor app-vMAJOR.MINOR.PATCH-beta.N ` +
        "(N from 1, no leading zeros); no other pre-release identifier or build metadata is accepted.",
    );
  }
  const n = match[6] ?? "";
  return { tag, version, beta: n !== "", base: match[1], n };
}

/** The GitHub release's title (release-11). */
export function releaseTitle(version) {
  return `Spex App v${version}`;
}

/** Require every shell manifest to carry the tag's version verbatim,
 * a beta's included. `versions` maps a manifest path to its version. */
export function checkManifests(version, versions) {
  for (const [path, manifestVersion] of Object.entries(versions)) {
    if (manifestVersion !== version) {
      throw new Error(`Tag ${version} does not match ${path} ${manifestVersion}`);
    }
  }
}

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
 * by the last release still holds a blank line. */
export function hasNotes(section) {
  return section.split("\n").some((line) => !/^(#.*|\s*)$/.test(line));
}

/** Point repository-relative links at the tree at this tag: resolved
 * against the release page, they would lead nowhere. */
export function pinLinks(text, repository, tag) {
  return text.replace(
    /\]\((specs\/|docs\/|packages\/|apps\/|README\.md)/g,
    (_, path) => `](https://github.com/${repository}/blob/${tag}/${path}`,
  );
}

/** The release notes for a parsed tag over the app changelog. */
export function releaseNotes({ changelog, release, repository }) {
  const { tag, version, beta, base, n } = release;
  // A regular release's notes are its version's section; a beta's are
  // [Unreleased] as it stands at the tag, since the changelog keeps no
  // section for a beta (DR-087).
  const section = beta ? "Unreleased" : version;
  const notes = changelogSection(changelog, section);
  if (!hasNotes(notes)) {
    throw new Error(`No release notes found under [${section}] in CHANGELOG.md for ${tag}`);
  }
  const blob = `https://github.com/${repository}/blob/${tag}`;
  return [
    beta ? `Beta ${n} on the way to ${base} — everything unreleased at this tag.\n\n` : "",
    pinLinks(notes, repository, tag),
    "\n",
    "## Run from source\n",
    "\n",
    "This release ships no binaries: build it on macOS or Linux with Node.js 22.19 or later and a native build toolchain. Storage requires private POSIX permissions. Windows users can run the scaffold CLI or access a Spex server in their browser.\n",
    "\n",
    "```bash\n",
    `git clone https://github.com/${repository}.git\n`,
    "cd spex\n",
    `git checkout ${tag}\n`,
    "npm ci\n",
    "npm start              # the desktop app\n",
    "npm run start:server   # the server shell: prints http://127.0.0.1:8137/?token=…\n",
    "```\n",
    "\n",
    `Agent sign-in, GitHub, and playbook-compile prerequisites are in the [README](${blob}/README.md).\n`,
    beta
      ? "\n" +
        "This beta ran CI, the smoke and the live smoke; the regression and the manual checklist run before the regular release " +
        `([DR-087](${blob}/specs/decisions/087-beta-app-releases.md)).\n`
      : "",
  ].join("");
}

function options(args) {
  const values = {};
  for (const arg of args) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`unknown argument: ${arg}`);
    values[match[1]] = match[2];
  }
  return values;
}

function required(values, name) {
  if (!values[name]) throw new Error(`--${name} is required`);
  return values[name];
}

function main(argv, env) {
  const [command, ...rest] = argv;
  const values = options(rest);
  const root = resolve(values.root ?? ".");
  const release = parseTag(required(values, "tag"));
  if (command === "check") {
    const versions = Object.fromEntries(
      SHELL_MANIFESTS.map((path) => [
        path,
        JSON.parse(readFileSync(join(root, path), "utf8")).version,
      ]),
    );
    checkManifests(release.version, versions);
    const outputs = [
      `version=${release.version}`,
      `beta=${release.beta}`,
      `base=${release.base}`,
      `n=${release.n}`,
      `title=${releaseTitle(release.version)}`,
    ].join("\n");
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${outputs}\n`);
    process.stdout.write(`${outputs}\n`);
    return;
  }
  if (command === "notes") {
    const notes = releaseNotes({
      changelog: readFileSync(join(root, values.changelog ?? "CHANGELOG.md"), "utf8"),
      release,
      repository: required(values, "repository"),
    });
    writeFileSync(required(values, "out"), notes);
    process.stdout.write(notes);
    return;
  }
  throw new Error("usage: release-notes.mjs check|notes --tag=<tag> [...]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2), process.env);
  } catch (error) {
    // An annotation on the run's summary when the workflow runs it.
    const prefix = process.env.GITHUB_ACTIONS ? "::error::" : "release-notes: ";
    process.stderr.write(`${prefix}${error.message}\n`);
    process.exit(1);
  }
}
