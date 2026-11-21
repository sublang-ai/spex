// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Tagging: tag-rules.json patterns tried line by line, frontmatter
// `allowed-tools` mapped to tool tags, and `mcp__<server>__<tool>` names.

import fs from 'node:fs';
import { warn } from './log.mjs';

export const EVIDENCE_MAX = 3; // data-model.md: at most 3 evidence lines per TagHit
export const EVIDENCE_TEXT_MAX = 160; // characters of evidence text per line
export const CATEGORIES = ['input', 'output', 'tool', 'human'];
const TAG_ID = /^(input|output|tool|human)\.[a-z0-9][a-z0-9-]*$/;

// A merged hit reports the most deliberate source: an annotation outranks the
// scan, and a rule hit (with text evidence) outranks the frontmatter mapping.
const SOURCE_RANK = { frontmatter: 1, rule: 2, annotation: 3 };
function strongerSource(a, b) { return SOURCE_RANK[b] > SOURCE_RANK[a] ? b : a; }

/**
 * Load and compile tag rules. A bad entry or pattern is reported and skipped.
 * @throws {Error} when the file cannot be read or is not a rules document
 */
export function loadRules(file) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read tag rules ${file}: ${err.message}; fix the file or pass --rules <file>`);
  }
  if (!doc || !Array.isArray(doc.tags)) {
    throw new Error(`tag rules ${file} has no "tags" array; see references/tag-rules.json for the shape`);
  }
  const rules = [];
  const catalog = new Map();
  for (const [n, entry] of doc.tags.entries()) {
    if (!entry || typeof entry.id !== 'string' || !TAG_ID.test(entry.id)) {
      warn(`tag rules: entry ${n + 1} has no valid id (<category>.<slug>, category one of ${CATEGORIES.join(', ')}); skipped`);
      continue;
    }
    const category = entry.id.split('.')[0];
    if (entry.category && entry.category !== category) {
      warn(`tag rules: ${entry.id} names category "${entry.category}" but its id says "${category}"; using "${category}"`);
    }
    const label = typeof entry.label === 'string' && entry.label ? entry.label : entry.id.split('.')[1];
    const patterns = [];
    for (const p of Array.isArray(entry.patterns) ? entry.patterns : []) {
      try {
        new RegExp(p, 'i'); // the documented flags; reject the pattern here if they do
        patterns.push(new RegExp(p, 'gi')); // global only to try each match on a line in turn
      } catch (err) {
        warn(`tag rules: ${entry.id} pattern ${JSON.stringify(p)} is not a valid regular expression (${err.message}); skipped`);
      }
    }
    catalog.set(entry.id, { id: entry.id, category, label });
    if (entry.negatable !== undefined && typeof entry.negatable !== 'boolean') {
      warn(`tag rules: ${entry.id} "negatable" must be true or false; using true`);
    }
    rules.push({ id: entry.id, category, label, patterns, negatable: entry.negatable !== false });
  }
  return { rules, catalog };
}

/** A tag id usable from annotations: from the rules, dynamic, or `<category>.<slug>`. */
export function tagInfo(id, catalog) {
  if (catalog.has(id)) return catalog.get(id);
  if (!TAG_ID.test(id)) return null;
  const [category, slug] = id.split('.');
  return { id, category, label: slug };
}

/**
 * Match rules against lines.
 * @param {{ line:number, text:string }[]} lines 1-based file line numbers
 * @returns {Map<string, TagHit>}
 */
export function matchLines(rules, lines) {
  const hits = new Map();
  for (const { line, text } of lines) {
    const t = text.trim();
    if (!t) continue;
    for (const rule of rules) {
      const m = firstAffirmed(rule, t);
      if (m) addEvidence(hits, rule, 'rule', { line, text: evidenceText(t, m.index, m[0].length) });
    }
    for (const server of mcpServers(t)) {
      const info = mcpTag(server);
      const idx = t.indexOf(`mcp__${server}__`);
      addEvidence(hits, info, 'rule', { line, text: evidenceText(t, Math.max(0, idx), server.length + 5) });
    }
  }
  return hits;
}

// A match negated earlier in its own clause ("Do not ask the user to paste...",
// "You never write code") is not evidence, unless its rule sets
// "negatable": false (approval: "never push without approval" still asks).
const NEGATION = /\b(never|not|no|nor|without|avoid|don't|doesn't|won't|cannot|can't)\b/i;
const NEGATION_WINDOW = 60; // characters before a match searched for a negation
// Sentence-level breaks only: a negation carries across commas and brackets ("never use `npx`, `pnpm exec`").
const CLAUSE_BREAK = /[.;:!?](?=\s|$)|[|\u2014]/g;

function firstAffirmed(rule, text) {
  for (const re of rule.patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (!rule.negatable || !negated(text, m.index)) return m;
      if (m[0].length === 0) break;
    }
  }
  return null;
}

function negated(text, index) {
  const before = text.slice(Math.max(0, index - NEGATION_WINDOW), index);
  let start = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) start = m.index + 1;
  return NEGATION.test(before.slice(start));
}

// The server is everything up to the next double underscore (servers may hold single ones).
const MCP_NAME = /\bmcp__((?:[A-Za-z0-9-]|_(?!_))+)/g;

function mcpServers(text) {
  const out = new Set();
  for (const m of text.matchAll(MCP_NAME)) out.add(m[1]);
  return out;
}

/** The dynamic tag for an MCP server. */
export function mcpTag(server) {
  const slug = server.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'server';
  return { id: `tool.mcp-${slug}`, category: 'tool', label: `MCP: ${server}` };
}

// Claude Code tool names in `allowed-tools`, and the tags each implies.
const TOOL_TAGS = {
  Bash: ['tool.shell'],
  Read: ['input.files'],
  Write: ['tool.edit', 'output.files'],
  Edit: ['tool.edit', 'output.files'],
  MultiEdit: ['tool.edit', 'output.files'],
  NotebookEdit: ['tool.edit', 'output.files'],
  Grep: ['tool.search'],
  Glob: ['tool.search'],
  WebFetch: ['tool.web'],
  WebSearch: ['tool.web'],
  Task: ['tool.subagent'],
  Agent: ['tool.subagent'],
  AskUserQuestion: ['human.question'],
};
// A Bash permission scoped to one command names that command's tool too.
const BASH_COMMAND_TAGS = { git: 'tool.git', gh: 'tool.github', npm: 'tool.package-manager', npx: 'tool.package-manager', pnpm: 'tool.package-manager', yarn: 'tool.package-manager' };

/**
 * Tags from the frontmatter `allowed-tools` value.
 * @param {unknown} value a string ("Bash Read", "Bash(git:*), Read") or a list
 * @param {{ line:number, text:string }} evidence the frontmatter line
 */
export function allowedToolTags(value, evidence, catalog) {
  const hits = new Map();
  const tokens = [];
  const raw = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : [];
  for (const s of raw) tokens.push(...splitTools(s));
  for (const token of tokens) {
    const name = token.replace(/\(.*$/s, '').trim();
    const mcp = /^mcp__((?:[A-Za-z0-9-]|_(?!_))+)/.exec(name);
    if (mcp) { addEvidence(hits, mcpTag(mcp[1]), 'frontmatter', evidence); continue; }
    for (const id of TOOL_TAGS[name] ?? []) addEvidence(hits, tagInfo(id, catalog), 'frontmatter', evidence);
    if (name === 'Bash') {
      const cmd = /^Bash\(\s*([\w-]+)/.exec(token);
      const id = cmd && BASH_COMMAND_TAGS[cmd[1]];
      if (id) addEvidence(hits, tagInfo(id, catalog), 'frontmatter', evidence);
    }
  }
  return hits;
}

// Split on commas and whitespace outside parentheses.
function splitTools(s) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === ',' || /\s/.test(c))) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Add one evidence line to the hit for `info`, creating it when absent. */
export function addEvidence(hits, info, source, evidence) {
  let hit = hits.get(info.id);
  if (!hit) {
    hit = { id: info.id, category: info.category, label: info.label, source, evidence: [] };
    hits.set(info.id, hit);
  } else {
    hit.source = strongerSource(hit.source, source);
  }
  if (evidence && hit.evidence.length < EVIDENCE_MAX && !hit.evidence.some((e) => e.line === evidence.line && e.text === evidence.text)) {
    hit.evidence.push(evidence);
  }
  return hit;
}

/** Union several hit maps into one sorted array, at most EVIDENCE_MAX evidence lines each. */
export function mergeHits(...maps) {
  const out = new Map();
  for (const map of maps) {
    for (const hit of map instanceof Map ? map.values() : map) {
      const cur = out.get(hit.id);
      if (!cur) { out.set(hit.id, { ...hit, evidence: [...hit.evidence] }); continue; }
      cur.source = strongerSource(cur.source, hit.source);
      for (const e of hit.evidence) {
        if (!cur.evidence.some((x) => x.line === e.line && x.text === e.text)) cur.evidence.push(e);
      }
    }
  }
  const list = [...out.values()];
  for (const hit of list) {
    hit.evidence.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
    hit.evidence = hit.evidence.slice(0, EVIDENCE_MAX);
  }
  return sortHits(list);
}

export function sortHits(list) {
  return list.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.id.localeCompare(b.id));
}

// Evidence text: the trimmed line, or a window around the match when long.
function evidenceText(text, index, length) {
  if (text.length <= EVIDENCE_TEXT_MAX) return text;
  const room = EVIDENCE_TEXT_MAX - 2; // two ellipses at most
  let start = Math.max(0, index - Math.floor((room - length) / 2));
  start = Math.min(start, text.length - room);
  const end = start + room;
  return (start > 0 ? '\u2026' : '') + text.slice(start, end).trim() + (end < text.length ? '\u2026' : '');
}
