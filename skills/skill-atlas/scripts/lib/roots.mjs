// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Where agents load skills from, and which of them each agent loads a name
// from. Adding a folder is one line in AGENT_ROOTS; adding an agent one entry
// in AGENTS.

import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { warn } from './log.mjs';

/**
 * One row per skill folder an agent loads.
 * - key: slug used in root ids (`<scope>-<key>`)
 * - dir: path relative to a project folder or the home folder, `/`-separated
 * - agent: the agent the folder is named for, `universal` for a shared one
 * - scopes: where the folder is looked for
 * - env: an environment variable that replaces the home-relative config folder
 *   (its value stands for the first segment of `dir`, such as `.codex`); a
 *   home folder's `.config` is XDG_CONFIG_HOME where that is set
 * Which agents load a row's folder is AGENTS' to say.
 */
export const AGENT_ROOTS = [
  { key: 'claude', dir: '.claude/skills', agent: 'claude-code', label: 'Claude Code', scopes: ['project', 'user'], env: 'CLAUDE_CONFIG_DIR' },
  { key: 'agents', dir: '.agents/skills', agent: 'universal', label: 'Universal', scopes: ['project', 'user'] },
  { key: 'agents-config', dir: '.config/agents/skills', agent: 'universal', label: 'Universal', scopes: ['user'] },
  { key: 'codex', dir: '.codex/skills', agent: 'codex', label: 'Codex', scopes: ['project', 'user'], env: 'CODEX_HOME' },
  // The skills Codex ships with itself.
  { key: 'codex-system', dir: '.codex/skills/.system', agent: 'codex', label: 'Codex (bundled)', scopes: ['user'], env: 'CODEX_HOME' },
  { key: 'cursor', dir: '.cursor/skills', agent: 'cursor', label: 'Cursor', scopes: ['project', 'user'] },
  { key: 'gemini', dir: '.gemini/skills', agent: 'gemini-cli', label: 'Gemini CLI', scopes: ['project', 'user'] },
  { key: 'opencode', dir: '.opencode/skills', agent: 'opencode', label: 'OpenCode', scopes: ['project', 'user'] },
  { key: 'opencode-config', dir: '.config/opencode/skills', agent: 'opencode', label: 'OpenCode', scopes: ['user'] },
  { key: 'copilot', dir: '.github/skills', agent: 'copilot', label: 'GitHub Copilot', scopes: ['project'] },
  { key: 'copilot-home', dir: '.copilot/skills', agent: 'copilot', label: 'GitHub Copilot', scopes: ['user'] },
  { key: 'kimi', dir: '.kimi/skills', agent: 'kimi-code', label: 'Kimi Code', scopes: ['project', 'user'] },
  { key: 'windsurf', dir: '.windsurf/skills', agent: 'windsurf', label: 'Windsurf', scopes: ['project', 'user'] },
  { key: 'windsurf-codeium', dir: '.codeium/windsurf/skills', agent: 'windsurf', label: 'Windsurf', scopes: ['user'] },
  { key: 'roo', dir: '.roo/skills', agent: 'roo', label: 'Roo Code', scopes: ['project', 'user'] },
  { key: 'goose', dir: '.goose/skills', agent: 'goose', label: 'Goose', scopes: ['project', 'user'] },
  { key: 'goose-config', dir: '.config/goose/skills', agent: 'goose', label: 'Goose', scopes: ['user'] },
  // The project's own skill sources, in each project folder; listed only where
  // it holds skills, and loaded by no agent, so left out under any --agent.
  { key: 'source', dir: 'skills', agent: 'universal', label: 'source', scopes: ['project'], requireSkills: true },
];

/**
 * Each agent's loading, by its documentation (data-model.md "sameName"):
 * - name: what it invokes a skill by, its frontmatter `name` (`declared`,
 *   which defaults to the folder's) or its folder's name (`folder`); a
 *   plugin's skill is `<plugin>:<name>` [placeName];
 * - order: the places it loads, highest first, as tiers of patterns; places
 *   of one tier rank alike, except that a `near` tier ranks the nearer
 *   project folder first;
 * - also: places it loads in no documented order, so ranking alike with
 *   every other.
 * A pattern is `<scope>-<row key>`, or `plugin`, with an optional `@root`
 * (the repository's root, or --cwd's folder where there is none), `@nested`
 * (below the root), `@cwd` or `@above` (above --cwd) for a project's.
 * An agent whose documentation lists its folders loads those alone; one whose
 * documentation was not found loads its own folders and the shared ones, in no order.
 */
export const AGENTS = Object.freeze({
  // code.claude.com/docs/en/skills: personal over project, the repository
  // root's over a nested folder's; a plugin's skill is namespaced.
  'claude-code': { name: 'declared', order: [['user-claude'], ['project-claude@root'], ['project-claude@nested']], also: ['plugin'] },
  // learn.chatgpt.com/docs/build-skills: skills of one name both appear.
  codex: { name: 'declared', order: [], also: ['project-agents', 'user-agents', 'project-codex', 'user-codex', 'user-codex-system'] },
  // docs.github.com Copilot CLI reference, "Skill locations": first found wins.
  copilot: { name: 'declared', order: [['project-copilot@cwd'], ['project-agents@cwd'], ['project-claude@cwd'], ['project-copilot@above'], ['user-copilot-home'], ['user-agents']], also: [] },
  // cursor.com/help/customization/skills: named by its folder, no order.
  cursor: { name: 'folder', order: [], also: ['project-cursor@cwd', 'user-cursor', 'project-agents@cwd', 'user-agents', 'project-claude@cwd', 'user-claude', 'project-codex@cwd', 'user-codex'] },
  // geminicli.com/docs/cli/skills: workspace over user, `.agents` over `.gemini` in each.
  'gemini-cli': { name: 'declared', order: [['project-agents'], ['project-gemini'], ['user-agents'], ['user-gemini']], also: [] },
  // moonshotai.github.io/kimi-cli: project over user, kimi > claude > codex > the shared folders, at the project's root.
  'kimi-code': { name: 'declared', order: [['project-kimi@root'], ['project-claude@root'], ['project-codex@root'], ['project-agents@root'], ['user-kimi'], ['user-claude'], ['user-codex'], ['user-agents-config', 'user-agents']], also: [] },
  // opencode.ai/docs/skills: named by its folder, the later registered over the earlier,
  // registered `.claude`, then `.agents`, each the home folder's and then a project's
  // farthest first, then `~/.config/opencode`, then a project's `.opencode` nearest last.
  opencode: { name: 'folder', order: [{ near: ['project-opencode'] }, ['user-opencode-config'], { near: ['project-agents'] }, ['user-agents'], { near: ['project-claude'] }, ['user-claude']], also: ['user-opencode'] },
  // roocodeinc.github.io/Roo-Code/features/skills: named by its folder, project over global, `.roo` over `.agents` in each.
  roo: { name: 'folder', order: [['project-roo@root'], ['project-agents@root'], ['user-roo'], ['user-agents']], also: [] },
  windsurf: { name: 'declared', order: [], also: ['project-windsurf', 'user-windsurf', 'user-windsurf-codeium', 'project-agents', 'user-agents', 'user-agents-config'] },
  goose: { name: 'declared', order: [], also: ['project-goose', 'user-goose', 'user-goose-config', 'project-agents', 'user-agents', 'user-agents-config'] },
});

// Whether a pattern names a place: its scope, row and, for a project's, where it lies.
function matches(pattern, place) {
  const [what, where] = pattern.split('@');
  if (what === 'plugin') return place.scope === 'plugin';
  if (what !== `${place.scope}-${place.row}`) return false;
  if (!where) return true;
  return where === 'root' ? place.depth === 0 : where === 'nested' ? place.depth > 0 : where === 'cwd' ? place.dist === 0 : place.dist > 0;
}

/**
 * Where an agent ranks a place: `{ tier, dist }`, the lower first, `null` for
 * a place it loads in no order, `undefined` for one it does not load.
 * @param {string} agent
 * @param {{ scope:string, row?:string, depth?:number, dist?:number }} place a root
 */
export function rankIn(agent, place) {
  const spec = AGENTS[agent];
  if (!spec) return undefined;
  for (const [tier, t] of spec.order.entries()) {
    const near = !Array.isArray(t);
    if ((near ? t.near : t).some((p) => matches(p, place))) return { tier, dist: near ? place.dist ?? 0 : 0 };
  }
  return spec.also.some((p) => matches(p, place)) ? null : undefined;
}

/** How two ranks compare: below zero where the first outranks the second, zero where neither does. */
export function compareRanks(a, b) {
  if (!a || !b) return 0;
  return a.tier - b.tier || a.dist - b.dist;
}

/** The agents loading a place, by key. */
export function loadersOf(place) {
  return Object.keys(AGENTS).filter((agent) => rankIn(agent, place) !== undefined).sort();
}

const SCOPE_LABEL = { project: 'Project', user: 'User', plugin: 'Plugin', extra: 'Extra' };
const SKIP_DIRS = new Set(['node_modules']);

/** Each agent's name by its key: the label of the agent's first row. */
export const AGENT_LABELS = Object.freeze(Object.fromEntries(AGENT_ROOTS.filter((r) => r.agent !== 'universal').reverse().map((r) => [r.agent, r.label])));

/** The Claude Code config folder: CLAUDE_CONFIG_DIR, else ~/.claude. */
export function claudeConfigDir(home = os.homedir()) {
  return process.env.CLAUDE_CONFIG_DIR ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : path.join(home, '.claude');
}

/**
 * The project's folders, nearer first: --cwd's, then each folder above its
 * real path up to the root of its repository (the nearest folder holding a
 * `.git` entry, --cwd's own included); --cwd's alone where no folder above it
 * holds one. A --cwd reached through a link finds the folders above the one
 * it leads to; each is spelled as --cwd's own path spells it where one of the
 * folders on that path is it.
 */
export function projectDirs(cwd) {
  return projectPlaces(cwd).dirs;
}

// projectDirs, with the repository's root, or null where there is none.
function projectPlaces(cwd) {
  const given = path.resolve(cwd);
  const spelled = new Map(); // real folder -> the nearest folder of --cwd's path leading to it
  for (let dir = given; ; dir = path.dirname(dir)) {
    const real = realOr(dir);
    if (!spelled.has(real)) spelled.set(real, dir);
    if (path.dirname(dir) === dir) break;
  }
  const dirs = [];
  for (let real = realOr(given); ; real = path.dirname(real)) {
    const dir = spelled.get(real) ?? real;
    dirs.push(dir);
    if (fs.existsSync(path.join(real, '.git'))) return { dirs, repo: dir };
    if (path.dirname(real) === real) return { dirs: [dirs[0]], repo: null };
  }
}

/**
 * The roots to scan, in preference order (project, nearer folders first,
 * user, plugins, extra). A root's id is a function of its own folder alone,
 * never of what else is installed or of the order of the options: the rows of
 * the repository's root (or, with no repository, of --cwd's folder) keep ids
 * such as `project-agents`; those of a folder below it add `.` and its path
 * from the repository's root [placeId], `project-agents.packages.ui-kit`; a
 * --root's is `extra-` and its folder's name and real path [extraId]; a
 * plugin's names its install [pluginId].
 * @param {{ cwd:string, home:string, user:boolean, plugins:boolean, extra:string[], agents:string[] }} opts
 */
export function listRoots(opts) {
  const roots = [];
  // --agent keeps a folder that agent loads [AGENTS], and a shared folder under `universal`.
  const wanted = (row, agents) => !opts.agents.length
    || agents.length > 0 && [row.agent, ...agents].some((agent) => opts.agents.includes(agent));
  const xdg = process.env.XDG_CONFIG_HOME ? path.resolve(process.env.XDG_CONFIG_HOME) : null;
  const { dirs, repo } = projectPlaces(opts.cwd);
  const places = dirs.map((base) => {
    const rel = repo ? placeIn(repo, base) : '';
    return { scope: 'project', base, rel };
  });
  if (opts.user) places.push({ scope: 'user', base: opts.home, rel: '' });
  for (const [n, { scope, base, rel }] of places.entries()) {
    // How far below the repository's root the folder lies; plain skill ids
    // are given in this order [scan.mjs assignIds], so a folder only some
    // scans cover never takes a name from one every scan covers.
    const depth = rel ? rel.split('/').length : 0;
    // How far above --cwd's folder it lies, the nearer first.
    const dist = scope === 'project' ? n : 0;
    for (const row of AGENT_ROOTS) {
      if (!row.scopes.includes(scope)) continue;
      const agents = loadersOf({ scope, row: row.key, depth, dist });
      if (!wanted(row, agents)) continue;
      const [configDir, ...rest] = row.dir.split('/');
      let from;
      let segs = rest;
      if (scope === 'user' && row.env && process.env[row.env]) from = path.resolve(process.env[row.env]);
      else if (scope === 'user' && configDir === '.config' && xdg) from = xdg;
      else { from = base; segs = [configDir, ...rest]; }
      const dir = path.join(from, ...segs);
      roots.push({
        id: `${scope}-${row.key}${rel ? `.${placeId(rel)}` : ''}`,
        path: dir,
        scope,
        agent: row.agent,
        // A folder below the repository's root says which, by its path from there.
        label: `${SCOPE_LABEL[scope]}${rel ? ` (${rel})` : ''} \u00B7 ${row.label}`,
        requireSkills: !!row.requireSkills,
        plugin: null,
        depth,
        dist,
        row: row.key,
        agents,
        linked: linkedBelow(from, segs),
      });
    }
  }
  if (opts.plugins && wanted({ agent: 'claude-code' }, loadersOf({ scope: 'plugin' }))) roots.push(...pluginRoots(opts.cwd));
  // One folder named twice, however spelled, is one root under one id [extraId].
  const extras = new Set();
  opts.extra.forEach((dir) => {
    const id = extraId(path.resolve(dir));
    if (extras.has(id)) return;
    extras.add(id);
    roots.push({ id, path: path.resolve(dir), scope: 'extra', agent: 'universal', label: `${SCOPE_LABEL.extra} \u00B7 ${dir}`, requireSkills: false, plugin: null, explicit: true, agents: [], linked: false });
  });
  return roots;
}

// Whether the folder `segs` names below `from` is reached through a link of
// its own: its real path is not that of `from` with `segs` after it.
function linkedBelow(from, segs) {
  const dir = path.join(from, ...segs);
  return isDir(dir) && realOr(dir) !== path.join(realOr(from), ...segs);
}

// A folder's path from the repository's root, `/`-separated, read from both
// real paths, so a folder is named by its own place, however it was reached
// (every folder of the project lies at or below the root's real path).
function placeIn(repo, base) {
  return path.relative(realSpelling(repo), realSpelling(base)).split(path.sep).join('/');
}

/**
 * A path, `/`-separated, as words of an id, one to one: its segments joined by
 * `.`, each kept as it is where it is lowercase letters and digits in runs
 * joined by single hyphens, else its slug, `_` and eight hex digits of the
 * SHA-256 of the segment itself (`packages/ui-kit` is `packages.ui-kit`,
 * `packages/UI kit` `packages.ui-kit_<hex>`). A kept segment holds no `.` or
 * `_`, and a digested one ends in `_` and its digest, so no two paths share words.
 */
export function placeId(rel) { return rel.split('/').map(idWord).join('.'); }

/** One segment, or a skill's name, as a word of an id [placeId]. */
export function idWord(seg) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seg) ? seg : `${slug(seg, '')}_${hash8(seg)}`; }
function hash8(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 8); }

// A --root's id: the name and `_` and eight hex digits of the SHA-256 of its
// folder's real path as the file system spells it, so the same however the
// folder is spelled or reached and whatever other --root is given in whatever order.
function extraId(dir) {
  const real = realSpelling(dir);
  return `extra-${idWord(path.basename(real) || 'root')}_${hash8(real)}`;
}

// A plugin install's id: `plugin-`, its name and marketplace as the file's key
// gives them [idWord], and, for an install recorded for a project, its scope
// and eight hex digits of the SHA-256 of that project's path, all read from
// the install's own record, so no other install changes it.
function pluginId(key, inst) {
  const at = key.indexOf('@');
  const name = at < 0 ? key : key.slice(0, at);
  const market = at < 0 ? null : key.slice(at + 1);
  const words = [idWord(name), ...(market !== null ? [idWord(market)] : [])];
  if (typeof inst.projectPath === 'string' && inst.projectPath) {
    const scope = typeof inst.scope === 'string' && inst.scope ? inst.scope : 'project';
    words.push(`${idWord(scope)}_${hash8(path.resolve(inst.projectPath))}`);
  }
  return `plugin-${words.join('.')}`;
}

// A real path as the file system spells it, letter case included.
function realSpelling(p) {
  try { return fs.realpathSync.native(p); } catch { return realOr(p); }
}

/** Skill folders of Claude Code plugins that are installed and enabled for this project. */
function pluginRoots(cwd) {
  const config = claudeConfigDir();
  const file = path.join(config, 'plugins', 'installed_plugins.json');
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') warn(`cannot read ${file} (${err.message}); plugin skills skipped`);
    return [];
  }
  const plugins = doc && typeof doc.plugins === 'object' && doc.plugins ? doc.plugins : null;
  if (!plugins) { warn(`${file} has no "plugins" map; plugin skills skipped`); return []; }
  const enabled = enabledPlugins(config, cwd);
  const realCwd = realOr(cwd);
  const roots = [];
  const used = new Set();
  for (const [key, installs] of Object.entries(plugins)) {
    const name = key.split('@')[0];
    for (const inst of Array.isArray(installs) ? installs : []) {
      if (!inst || typeof inst.installPath !== 'string') continue;
      const id = pluginId(key, inst);
      if (enabled.get(key) === false) continue;
      // Two records of one plugin for one place are one install: the first stands.
      if (used.has(id)) { warn(`${file} records ${key} twice for one place; the first record is used`); continue; }
      used.add(id);
      if (inst.projectPath) {
        const project = realOr(path.resolve(inst.projectPath));
        const rel = path.relative(project, realCwd);
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue; // installed for another project
      }
      roots.push({ id, path: path.join(inst.installPath, 'skills'), scope: 'plugin', agent: 'claude-code', label: `${SCOPE_LABEL.plugin} \u00B7 ${name}`, requireSkills: false, plugin: name, agents: loadersOf({ scope: 'plugin' }), linked: linkedBelow(inst.installPath, ['skills']) });
    }
  }
  return roots;
}

// `enabledPlugins: { "name@marketplace": false }` disables a plugin and `true`
// enables it, read from the user's settings, then the project's and the
// project's local ones, a later file's value for a key over an earlier one's.
// The project's are those of each of its folders [projectDirs], the farther first.
// A plugin no file names counts as enabled.
function enabledPlugins(config, cwd) {
  const out = new Map();
  const farFirst = projectDirs(cwd).reverse();
  const files = [
    path.join(config, 'settings.json'),
    ...farFirst.map((dir) => path.join(dir, '.claude', 'settings.json')),
    ...farFirst.map((dir) => path.join(dir, '.claude', 'settings.local.json')),
  ];
  for (const file of files) {
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') warn(`cannot read ${file} (${err.message}); its enabledPlugins are not applied`);
      continue;
    }
    const map = settings?.enabledPlugins;
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const [k, v] of Object.entries(map)) if (typeof v === 'boolean') out.set(k, v);
  }
  return out;
}

/**
 * Skill folders in a root: children holding SKILL.md, and one level of
 * nesting for namespaced layouts. Dot-folders and node_modules are skipped.
 * @returns {string[]} absolute folder paths, sorted
 */
export function skillDirs(root) {
  const out = [];
  for (const child of listDirs(root)) {
    if (hasSkillFile(child)) { out.push(child); continue; }
    for (const grand of listDirs(child)) if (hasSkillFile(grand)) out.push(grand);
  }
  return out;
}

function listDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory() || (e.isSymbolicLink() && isDir(full))) out.push(full);
  }
  return out;
}

function hasSkillFile(dir) {
  try {
    return fs.statSync(path.join(dir, 'SKILL.md')).isFile();
  } catch {
    return false;
  }
}

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function realOr(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function slug(s, empty = '') { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || empty; }
