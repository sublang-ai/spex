// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Where agents load skills from. Adding an agent is one line in AGENT_ROOTS.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { warn } from './log.mjs';

/**
 * One row per skill folder an agent loads.
 * - key: slug used in root ids (`<scope>-<key>`)
 * - dir: path relative to the project (cwd) or the home folder, `/`-separated
 * - scopes: where the folder is looked for
 * - env: an environment variable that replaces the home-relative config folder
 *   (its value stands for the first segment of `dir`, such as `.codex`)
 * - loadedBy: the other agents that load this folder too, kept by `--agent`
 *   for any of them
 */
export const AGENT_ROOTS = [
  { key: 'claude', dir: '.claude/skills', agent: 'claude-code', label: 'Claude Code', scopes: ['project', 'user'], env: 'CLAUDE_CONFIG_DIR' },
  // Every agent but Claude Code loads the shared folder.
  { key: 'agents', dir: '.agents/skills', agent: 'universal', label: 'Universal', scopes: ['project', 'user'],
    loadedBy: ['codex', 'gemini-cli', 'kimi-code', 'opencode', 'cursor', 'windsurf', 'roo', 'goose', 'copilot'] },
  { key: 'codex', dir: '.codex/skills', agent: 'codex', label: 'Codex', scopes: ['project', 'user'], env: 'CODEX_HOME' },
  // The skills Codex ships with itself.
  { key: 'codex-system', dir: '.codex/skills/.system', agent: 'codex', label: 'Codex (bundled)', scopes: ['user'], env: 'CODEX_HOME' },
  { key: 'cursor', dir: '.cursor/skills', agent: 'cursor', label: 'Cursor', scopes: ['project', 'user'] },
  { key: 'gemini', dir: '.gemini/skills', agent: 'gemini-cli', label: 'Gemini CLI', scopes: ['project', 'user'] },
  { key: 'opencode', dir: '.opencode/skills', agent: 'opencode', label: 'OpenCode', scopes: ['project', 'user'] },
  { key: 'opencode-config', dir: '.config/opencode/skills', agent: 'opencode', label: 'OpenCode', scopes: ['user'] },
  { key: 'copilot', dir: '.github/skills', agent: 'copilot', label: 'GitHub Copilot', scopes: ['project'] },
  { key: 'kimi', dir: '.kimi/skills', agent: 'kimi-code', label: 'Kimi Code', scopes: ['project', 'user'] },
  { key: 'windsurf', dir: '.windsurf/skills', agent: 'windsurf', label: 'Windsurf', scopes: ['project', 'user'] },
  { key: 'roo', dir: '.roo/skills', agent: 'roo', label: 'Roo Code', scopes: ['project', 'user'] },
  { key: 'goose', dir: '.goose/skills', agent: 'goose', label: 'Goose', scopes: ['project', 'user'] },
  // The project's own skill sources; listed only when it holds skills.
  { key: 'source', dir: 'skills', agent: 'universal', label: 'source', scopes: ['project'], requireSkills: true },
];

const SCOPE_LABEL = { project: 'Project', user: 'User', plugin: 'Plugin', extra: 'Extra' };
const SKIP_DIRS = new Set(['node_modules']);

/** The Claude Code config folder: CLAUDE_CONFIG_DIR, else ~/.claude. */
export function claudeConfigDir(home = os.homedir()) {
  return process.env.CLAUDE_CONFIG_DIR ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : path.join(home, '.claude');
}

/**
 * The roots to scan, in preference order (project, user, plugins, extra).
 * @param {{ cwd:string, home:string, user:boolean, plugins:boolean, extra:string[], agents:string[] }} opts
 */
export function listRoots(opts) {
  const roots = [];
  const wanted = (row) => !opts.agents.length
    || [row.agent, ...(row.loadedBy ?? [])].some((agent) => opts.agents.includes(agent));
  for (const scope of ['project', 'user']) {
    if (scope === 'user' && !opts.user) continue;
    for (const row of AGENT_ROOTS) {
      if (!row.scopes.includes(scope) || !wanted(row)) continue;
      const [configDir, ...rest] = row.dir.split('/');
      let dir;
      if (scope === 'user' && row.env && process.env[row.env]) dir = path.join(path.resolve(process.env[row.env]), ...rest);
      else dir = path.join(scope === 'project' ? opts.cwd : opts.home, configDir, ...rest);
      roots.push({
        id: `${scope}-${row.key}`,
        path: dir,
        scope,
        agent: row.agent,
        label: `${SCOPE_LABEL[scope]} \u00B7 ${row.label}`,
        requireSkills: !!row.requireSkills,
        plugin: null,
      });
    }
  }
  if (opts.plugins && wanted({ agent: 'claude-code' })) roots.push(...pluginRoots(opts.cwd));
  opts.extra.forEach((dir, n) => {
    roots.push({ id: `extra-${n + 1}`, path: path.resolve(dir), scope: 'extra', agent: 'universal', label: `${SCOPE_LABEL.extra} \u00B7 ${dir}`, requireSkills: false, plugin: null, explicit: true });
  });
  return roots;
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
    if (enabled.get(key) === false) continue;
    const name = key.split('@')[0];
    for (const inst of Array.isArray(installs) ? installs : []) {
      if (!inst || typeof inst.installPath !== 'string') continue;
      if (inst.projectPath) {
        const project = realOr(path.resolve(inst.projectPath));
        const rel = path.relative(project, realCwd);
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue; // installed for another project
      }
      let id = `plugin-${slug(name)}`;
      for (let n = 2; used.has(id); n++) id = `plugin-${slug(name)}-${n}`;
      used.add(id);
      roots.push({ id, path: path.join(inst.installPath, 'skills'), scope: 'plugin', agent: 'claude-code', label: `${SCOPE_LABEL.plugin} \u00B7 ${name}`, requireSkills: false, plugin: name });
    }
  }
  return roots;
}

// `enabledPlugins: { "name@marketplace": false }` disables a plugin and `true`
// enables it, read from the user's settings, then the project's and the
// project's local ones, a later file's value for a key over an earlier one's.
// A plugin no file names counts as enabled.
function enabledPlugins(config, cwd) {
  const out = new Map();
  const files = [path.join(config, 'settings.json'), path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json')];
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

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plugin'; }
