// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex new <org>/<pkg>` (cli-8, environments-10, DR-165): a spec
// package folder made at `spex-packages/<org>/<pkg>/` under the
// environment's root from skill folders and a spec file already at hand,
// in the release layout the library reads, then requested by path and
// installed as `spex add --path` does, so its skills reach the folder's
// agents at once. Every rule is checked before anything is written; a
// refusal writes nothing.

import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import { settleAndTell, writeRequest } from "./add.js";
import { actualPath, Environment } from "./environment.js";
import { exportedIn, projectFolders } from "./settle.js";
import { Refusal, type Command } from "./run.js";

function refuse(message: string): never {
  throw new Refusal(message);
}

/** A lowercase kebab-case name of at most 64 characters: an org, a
 * package's name, and an Agent Skills name alike (environments-1). */
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isName = (value: string): boolean => value.length <= 64 && KEBAB.test(value);

// BCP 47's langtag in its common form, or a private-use tag, as the
// core reads a release's language folders.
const LANGTAG = new RegExp(
  "^(?:" +
    "(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})" +
    "(?:-[a-z]{4})?" +
    "(?:-(?:[a-z]{2}|\\d{3}))?" +
    "(?:-(?:[a-z\\d]{5,8}|\\d[a-z\\d]{3}))*" +
    "(?:-[\\da-wyz](?:-[a-z\\d]{2,8})+)*" +
    "(?:-x(?:-[a-z\\d]{1,8})+)?" +
    "|x(?:-[a-z\\d]{1,8})+" +
  ")$",
  "i",
);

interface InitOptions {
  org: string;
  name: string;
  skills: string[];
  spec?: string;
  language: string;
  description?: string;
  license?: string;
  move: boolean;
}

const VALUED = new Set(["skill", "spec", "language", "description", "license"]);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Parse the whole invocation before reading or writing anything. */
function parseInit(args: string[]): InitOptions {
  const words: string[] = [];
  const skills: string[] = [];
  const single: Record<string, string> = {};
  let move = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("-")) { words.push(arg); continue; }
    const match = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(arg);
    const key = match?.[1];
    if (key === "move") {
      if (match![2] !== undefined) refuse("--move takes no value.");
      if (move) refuse("Option --move was repeated.");
      move = true;
      continue;
    }
    if (!key || !VALUED.has(key)) refuse(`Unknown option ${arg.split("=")[0]}. See spex --help.`);
    const inline = match![2];
    const value = inline ?? args[++i];
    if (value === undefined || value === "" || (inline === undefined && value.startsWith("-"))) refuse(`--${key} requires a value.`);
    if (key === "skill") { skills.push(value); continue; }
    if (Object.hasOwn(single, key)) refuse(`Option --${key} was repeated.`);
    single[key] = value;
  }
  if (words.length !== 1) refuse("spex new takes exactly one <org>/<pkg> argument. See spex --help.");
  const parts = words[0]!.split("/");
  if (parts.length !== 2 || !isName(parts[0]!) || !isName(parts[1]!))
    refuse("The package name must be <org>/<pkg>, each part lowercase letters, digits and single hyphens, at most 64 characters.");
  const language = single.language ?? "en";
  if (!LANGTAG.test(language) || language.length > 64) refuse(`--language ${JSON.stringify(language)} is not a BCP 47 language tag such as en or zh-Hans.`);
  if (single.description !== undefined && CONTROL.test(single.description.replace(/[\n\t]/g, " "))) refuse("--description must not hold control characters.");
  if (single.license !== undefined && CONTROL.test(single.license)) refuse("--license must not hold control characters.");
  if (single.license !== undefined && !single.license.trim()) refuse("--license requires a value.");
  if (single.description !== undefined && !single.description.trim()) refuse("--description requires a value.");
  return {
    org: parts[0]!,
    name: parts[1]!,
    skills,
    ...(single.spec !== undefined ? { spec: single.spec } : {}),
    language,
    ...(single.description !== undefined ? { description: single.description.trim() } : {}),
    ...(single.license !== undefined ? { license: single.license.trim() } : {}),
    move,
  };
}

// -- SKILL.md frontmatter ------------------------------------------------

/** Plain YAML scalars the core schema reads as no string: a skill named
 * so would be refused by the core's reader. */
const NON_STRING = /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+|[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;

/** A plain value YAML refuses in a block mapping, so the core's reader
 * reads no frontmatter at all. */
const REFUSED = Symbol("refused");

interface Frontmatter {
  name?: string;
  description?: string;
  /** The field whose unquoted value YAML refuses (`: ` inside it). */
  unreadable?: "name" | "description";
}

/** The top-level string fields of a SKILL.md's YAML frontmatter that
 * matter here — `name` and `description` — read from the common YAML
 * forms: plain, single- or double-quoted, and `|` or `>` blocks. A field
 * of another form reads as absent. The frontmatter is found as a
 * release's readers find it, from the text's first character: nothing
 * before `---`, a byte order mark included, is skipped. */
export function skillFrontmatter(text: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return {};
  const lines = match[1]!.split(/\r?\n/);
  const out: Frontmatter = {};
  for (let i = 0; i < lines.length; i++) {
    const field = /^(name|description)[ \t]*:(?:[ \t]+(.*)|)$/.exec(lines[i]!);
    if (!field) continue;
    const key = field[1] as "name" | "description";
    // The value's continuation: the lines indented below its key.
    const rest: string[] = [];
    while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]!) || lines[i + 1]!.trim() === "")) rest.push(lines[++i]!);
    while (rest.length && rest[rest.length - 1]!.trim() === "") rest.pop();
    const value = scalar((field[2] ?? "").trim(), rest);
    if (value === REFUSED) out.unreadable ??= key;
    else if (value !== undefined) out[key] = value;
  }
  return out;
}

function scalar(head: string, rest: string[]): string | undefined | typeof REFUSED {
  const block = /^([|>])[-+]?[1-9]?(?:[ \t]+#.*)?$/.exec(head);
  if (block) {
    const indent = Math.min(...rest.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)![0].length));
    const body = rest.map((line) => line.slice(Math.min(indent, line.length)));
    if (block[1] === "|") return body.join("\n").trim() || undefined;
    return body.join("\n").split(/\n[ \t]*\n/).map((p) => p.split("\n").map((l) => l.trim()).join(" ")).join("\n").trim() || undefined;
  }
  // A nested mapping is no string.
  if (head === "" && rest[0] !== undefined && /^[ \t]+[^ \t#'"][^:]*:(?:[ \t]|$)/.test(rest[0])) return undefined;
  const joined = [head, ...rest.map((line) => line.trim())].filter((part) => part !== "").join(" ");
  if (joined.startsWith('"')) {
    const end = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(joined);
    if (!end) return undefined;
    // An escaped space is a space; a tab stands as it is.
    try { return JSON.parse(`"${end[1]!.replace(/\\(?=[ \t])/g, "").replace(/\t/g, "\\t")}"`) as string; } catch { return undefined; }
  }
  if (joined.startsWith("'")) {
    const end = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(joined);
    return end ? end[1]!.replace(/''/g, "'") : undefined;
  }
  const plain = joined.replace(/[ \t]+#.*$/, "").trim();
  if (!plain || NON_STRING.test(plain) || /^[[{&*!|>%@`]/.test(plain)) return undefined;
  // `key: value: more` is no YAML: the whole frontmatter is refused.
  if (/:[ \t]/.test(plain) || plain.endsWith(":")) return REFUSED;
  return plain;
}

// -- the spec's Intent ---------------------------------------------------

/** The first paragraph under a spec's Intent heading, its lines joined. */
export function intentParagraph(text: string): string | undefined {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let i = lines.findIndex((line) => /^#{1,6}[ \t]+Intent[ \t]*#*[ \t]*$/i.test(line));
  if (i < 0) return undefined;
  i++;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  const paragraph: string[] = [];
  while (i < lines.length && lines[i]!.trim() !== "" && !/^#{1,6}(?:[ \t]|$)/.test(lines[i]!)) paragraph.push(lines[i++]!.trim());
  return paragraph.join(" ") || undefined;
}

// -- the license ---------------------------------------------------------

/** The license a root's LICENSE names (cli-8). */
export function detectLicense(text: string | undefined): string {
  const head = (text ?? "").replace(/^﻿/, "").trimStart();
  if (head.startsWith("Apache License")) return "Apache-2.0";
  if (head.startsWith("MIT License")) return "MIT";
  return "Apache-2.0";
}

// -- the folders ---------------------------------------------------------

interface SkillSource {
  folder: string;
  id: string;
  description?: string;
  /** Every folder and regular file below it, by its relative path. */
  dirs: string[];
  files: string[];
}

function lstatOrNull(path: string): Stats | null {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return null;
    throw error;
  }
}

/** A skill folder read whole: only folders and regular files, no link. */
function readSkill(argument: string, cwd: string): SkillSource {
  const folder = resolve(cwd, argument);
  const stat = lstatOrNull(folder);
  if (stat?.isSymbolicLink()) refuse(`--skill ${argument} is a link; give the skill's own folder.`);
  if (!stat?.isDirectory()) refuse(`--skill ${argument} is no folder holding a SKILL.md.`);
  const dirs: string[] = [];
  const files: string[] = [];
  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(join(folder, relativeDir)).sort()) {
      const path = relativeDir ? `${relativeDir}/${entry}` : entry;
      const entryStat = lstatSync(join(folder, path));
      if (entryStat.isSymbolicLink()) refuse(`--skill ${argument} holds a link at ${path}; a package holds files only.`);
      if (entryStat.isDirectory()) { dirs.push(path); walk(path); }
      else if (entryStat.isFile()) files.push(path);
      else refuse(`--skill ${argument} holds a special file at ${path}; a package holds files only.`);
    }
  };
  walk("");
  if (!files.includes("SKILL.md")) refuse(`--skill ${argument} holds no SKILL.md.`);
  const text = readFileSync(join(folder, "SKILL.md"), "utf8");
  // A release's readers find the frontmatter from the first byte, so a
  // byte order mark would hide the name from the app and the registry.
  if (text.startsWith("\uFEFF"))
    refuse(`--skill ${argument}: its SKILL.md begins with a byte order mark, which hides its frontmatter from a package's readers; save it as UTF-8 without one.`);
  const frontmatter = skillFrontmatter(text);
  if (frontmatter.unreadable)
    refuse(`--skill ${argument}: its SKILL.md frontmatter is no YAML, so its name cannot be read: the ${frontmatter.unreadable} holds ": " unquoted; put the value in quotes.`);
  if (frontmatter.name === undefined || !isName(frontmatter.name))
    refuse(`--skill ${argument}: its SKILL.md declares no Agent Skills name (lowercase letters, digits and single hyphens, at most 64 characters) as its frontmatter's name.`);
  return { folder, id: frontmatter.name, ...(frontmatter.description ? { description: frontmatter.description } : {}), dirs, files };
}

/** A string as a YAML double-quoted scalar: JSON's escapes, with the
 * characters YAML takes as unprintable escaped too. */
function quoted(value: string): string {
  // eslint-disable-next-line no-control-regex
  return JSON.stringify(value).replace(/[\u007f-\u009f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function manifestText(options: InitOptions, description: string, license: string, skills: SkillSource[]): string {
  const lines = [
    "format: 2",
    `org: ${quoted(options.org)}`,
    `name: ${quoted(options.name)}`,
    `version: ${quoted("0.1.0")}`,
    `description: ${quoted(description)}`,
    `license: ${quoted(license)}`,
    "artifacts:",
  ];
  for (const skill of skills) lines.push(`  ${quoted(skill.id)}:`, "    kind: skill", `    language: ${quoted(options.language)}`);
  if (options.spec !== undefined) lines.push(`  ${quoted(options.name)}:`, "    kind: spec", `    language: ${quoted(options.language)}`);
  return `${lines.join("\n")}\n`;
}

/** Whether the folder `outer` holds `spex-packages/<org>/<name>/` of
 * the root, compared by real paths; a folder that cannot be read holds
 * nothing. */
function holdsDestination(outer: string, root: string, org: string, name: string): boolean {
  let path: string;
  try { path = relative(realpathSync.native(outer), join(realpathSync.native(root), "spex-packages", org, name)); }
  catch { return false; }
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function copyFile(from: string, to: string): void {
  copyFileSync(from, to);
  chmodSync(to, statSync(from).mode & 0o777);
}

/** `spex new` (cli-8): make the folder, request it by path, install. */
export const newPackage: Command = async (args) => {
  const cwd = process.cwd();
  const options = parseInit(args);
  const { org, name, language } = options;
  const pkg = `${org}/${name}`;
  if (options.skills.length === 0 && options.spec === undefined) refuse("Name at least one artifact: --skill <folder> or --spec <file>.");

  // The environment it is requested in: its spex.yaml must read before
  // anything is written (environments-2).
  const env = new Environment(cwd);
  const root = env.root;
  const read = env.readRequests();

  // The org is a folder, as npm's scopes are, so two orgs' packages of
  // one name stand apart (environments-10, DR-165).
  const packages = join(root, "spex-packages");
  const parent = join(packages, org);
  const destination = join(parent, name);
  const packagesStat = lstatOrNull(packages);
  if (packagesStat && !packagesStat.isDirectory()) refuse(`spex-packages in ${root} is not a folder.`);
  const parentStat = lstatOrNull(parent);
  if (parentStat && !parentStat.isDirectory()) refuse(`spex-packages/${org} in ${root} is not a folder.`);
  if (lstatOrNull(destination)) refuse(`spex-packages/${org}/${name}/ already exists in ${root}; nothing was written.`);

  const skills: SkillSource[] = [];
  for (const argument of options.skills) {
    if (options.move && holdsDestination(resolve(cwd, argument), root, org, name)) refuse(`--move cannot move ${argument}: it holds spex-packages/${org}/${name}/.`);
    const skill = readSkill(argument, cwd);
    if (skills.some((other) => other.id === skill.id)) refuse(`Two skills declare the id ${skill.id}; each skill needs its own name.`);
    if (options.spec !== undefined && skill.id === name) refuse(`The skill ${skill.id} has the spec's id ${name}; a package names each artifact once, so rename the skill or the package.`);
    skills.push(skill);
  }

  let specText: Buffer | undefined;
  if (options.spec !== undefined) {
    const file = resolve(cwd, options.spec);
    let stat: Stats | null = null;
    try { stat = statSync(file); } catch { stat = null; }
    if (!stat?.isFile()) refuse(`--spec ${options.spec} is no file.`);
    if (basename(file) !== `${name}.md`) refuse(`The spec file must be named ${name}.md, since its items are ${name}-<N>; rename it or the package.`);
    specText = readFileSync(file);
  }

  const description = options.description
    ?? skills[0]?.description
    ?? (specText ? intentParagraph(specText.toString("utf8")) : undefined);
  if (!description) refuse("No description was found in the first skill's SKILL.md or under the spec's Intent heading; pass --description <text>.");

  const licenseFile = join(root, "LICENSE");
  let licenseText: Buffer | undefined;
  try { if (statSync(licenseFile).isFile()) licenseText = readFileSync(licenseFile); } catch { licenseText = undefined; }
  const license = options.license ?? detectLicense(licenseText?.toString("utf8"));

  // Everything is written into a staging folder beside the destination,
  // renamed into place whole; only then are moved skill folders removed.
  const madePackages = !packagesStat;
  const madeParent = !parentStat;
  mkdirSync(parent, { recursive: true });
  // Made as any folder is, not owner-only as a temporary one.
  const staging = join(parent, `.${name}.init-${randomBytes(6).toString("hex")}`);
  mkdirSync(staging);
  try {
    writeFileSync(join(staging, "meta.yaml"), manifestText(options, description, license, skills));
    writeFileSync(join(staging, "README.md"), `# ${pkg}\n\n${description}\n`);
    if (licenseText) writeFileSync(join(staging, "LICENSE"), licenseText);
    for (const skill of skills) {
      const into = join(staging, "skills", language, skill.id);
      mkdirSync(into, { recursive: true });
      for (const dir of skill.dirs) mkdirSync(join(into, ...dir.split("/")), { recursive: true });
      for (const file of skill.files) copyFile(join(skill.folder, ...file.split("/")), join(into, ...file.split("/")));
    }
    if (specText) {
      mkdirSync(join(staging, "specs", language), { recursive: true });
      writeFileSync(join(staging, "specs", language, `${name}.md`), specText);
    }
    renameSync(staging, destination);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (madeParent) { try { rmdirSync(parent); } catch { /* holds something else now */ } }
    if (madePackages) { try { rmdirSync(packages); } catch { /* holds something else now */ } }
    throw error;
  }
  // Each moved skill now stands in the package: its former folder goes.
  const left: string[] = [];
  if (options.move) {
    for (const [index, skill] of skills.entries()) {
      try { rmSync(skill.folder, { recursive: true, force: true }); }
      catch (error) { left.push(`${options.skills[index]} (${(error as NodeJS.ErrnoException).code ?? "not removed"})`); }
    }
  }

  const folder = `spex-packages/${org}/${name}`;
  const made = [
    ...skills.map((skill) => `skill ${skill.id}`),
    ...(options.spec !== undefined ? [`spec ${name}`] : []),
  ].join(", ");
  console.log(`Made ${folder}/ for ${pkg} (${made}).`);
  if (left.length) process.stderr.write(`The package holds a copy, but these skill folders could not be removed; remove them yourself: ${left.join(", ")}\n`);

  // Requested by path and installed as `spex add --path` does (cli-2).
  await writeRequest(env, pkg, { path: folder }, read === null);
  await settleAndTell(env);

  // A skill moved from an agent folder of the root stands there again,
  // now as Spex's export.
  if (options.move) {
    for (const skill of skills) {
      for (const { folder: agentFolder } of projectFolders()) {
        if (actualPath(resolve(root, ...agentFolder.split("/"), skill.id)) === actualPath(skill.folder) && exportedIn(root, agentFolder).includes(skill.id)) {
          console.log(`The skill ${skill.id} moved from ${agentFolder}/${skill.id}/ now stands there as Spex's export.`);
        }
      }
    }
  }
  console.log([
    `Next: edit ${folder}/, then`,
    `  spex publish ${pkg} --dry-run`,
    `  spex publish ${pkg}`,
  ].join("\n"));
  if (left.length) throw new Refusal("some moved skill folders still stand; remove them yourself");
};
