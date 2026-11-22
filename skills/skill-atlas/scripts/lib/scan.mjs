// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The scan: roots -> skills -> steps, links, tags -> translations -> annotations -> insights.
// A skill that cannot be read or parsed is recorded with an issue; it never
// aborts the scan.

import fs from 'node:fs';
import path from 'node:path';
import { listRoots, skillDirs, isDir, realOr } from './roots.mjs';
import { splitFrontmatter } from './frontmatter.mjs';
import { fenceMask, clipText } from './markdown.mjs';
import { detectSteps } from './steps.mjs';
import { buildLinkMatcher, findLinks } from './links.mjs';
import { loadRules, matchLines, allowedToolTags, addEvidence, mergeHits, CATEGORIES, EVIDENCE_TEXT_MAX } from './tags.mjs';
import { bundledFiles } from './files.mjs';
import { stateTranslations, readTextBounded, chooseTranslation, listFilesBounded, sha256Hex, TRANSLATIONS_DIR } from './translations.mjs';
import { loadAnnotations, applyAnnotations } from './annotations.mjs';
import { fileLanguage } from './language.mjs';
import { findInsights } from './insights.mjs';
import { warn } from './log.mjs';

export const ATLAS_VERSION = 1;
const SKILL_FILE_MAX_BYTES = 4 * 1024 * 1024; // a SKILL.md this large is not a skill an agent could load; skip its content
const COPY_COMPARE_MAX_BYTES = 64 * 1024 * 1024; // folders holding more are not read to tell copies apart
// Frontmatter keys whose lines are matched by tag rules: the description,
// and Claude Code's `context`/`agent` (a `context: fork` skill runs as a subagent).
// Link and tag detection read at most this many characters of a line: evidence
// shows 160 and excerpts 400, and a minified line must not make a scan quadratic.
export const LINE_SCAN_MAX = 4000;
const scanText = (line) => (line.length > LINE_SCAN_MAX ? line.slice(0, LINE_SCAN_MAX) : line);
const TAGGED_FRONTMATTER_KEYS = ['description', 'context', 'agent'];

/**
 * @param {{ cwd:string, home:string, user:boolean, plugins:boolean, extra:string[], agents:string[], rulesFile:string, stateDir:string }} opts
 */
export function scan(opts) {
  const { rules, catalog } = loadRules(opts.rulesFile);
  const roots = [];
  let skills = [];
  const seenRoots = new Set();
  const byReal = new Map(); // real folder -> its record

  for (const root of listRoots(opts)) {
    if (!isDir(root.path)) {
      if (root.explicit) warn(`--root ${root.path} is not a folder; skipped`);
      continue;
    }
    const realRoot = realOr(root.path);
    if (seenRoots.has(realRoot)) continue; // the same folder reached twice (cwd is the home folder)
    seenRoots.add(realRoot);
    let present = 0;
    for (const dir of skillDirs(root.path)) {
      present++;
      const real = realOr(dir);
      // `npx skills` links one folder into several agents' roots: one record listing the others.
      const seen = byReal.get(real);
      if (seen) { seen.copies.push({ root: root.id, dir }); continue; }
      const rec = readSkill(dir, root);
      byReal.set(real, rec);
      skills.push(rec);
    }
    if (root.requireSkills && !present) continue;
    const { requireSkills, explicit, ...rec } = root;
    roots.push({ ...rec, skillCount: present }); // copies included: the skills present in this folder
  }
  skills = mergeIdenticalCopies(skills);

  assignIds(skills);
  const matcher = buildLinkMatcher(skills, new Map(roots.map((r) => [r.id, r.plugin])));
  let edges = [];
  let unresolved = [];
  for (const s of skills) {
    analyze(s, rules, catalog);
    const found = findLinks(matcher, s, linkLines(s));
    edges.push(...found.edges);
    unresolved.push(...found.unresolved);
    readTranslations(s, opts.stateDir);
  }

  const state = { skills, edges, unresolved, catalog };
  const annotations = loadAnnotations(opts.stateDir);
  if (annotations) applyAnnotations(annotations, state);
  edges = state.edges;
  unresolved = state.unresolved;

  const order = new Map(skills.map((s, n) => [s.id, n]));
  const byLine = (a, b) => (order.get(a.from) - order.get(b.from)) || ((a.evidence?.line ?? Infinity) - (b.evidence?.line ?? Infinity));
  edges.sort(byLine);
  unresolved.sort(byLine);
  for (const s of skills) {
    for (const st of s.steps) st.calls = [...new Set(edges.filter((e) => e.from === s.id && e.fromStep === st.id).map((e) => e.to))];
    s.tags = mergeHits(s._baseTags, ...s.steps.map((st) => st.tags));
  }
  const insights = findInsights({ skills, edges, unresolved, roots, scanArgs: scanArgs(opts) });
  for (const s of skills) {
    s.issues = [...new Set(insights.filter((i) => i.skills.includes(s.id)).map((i) => i.kind))];
  }

  // The catalog is built from the hits themselves, so its labels are theirs (MCP tags included).
  const used = new Map();
  for (const s of skills) for (const t of s.tags) if (!used.has(t.id)) used.set(t.id, { id: t.id, category: t.category, label: t.label });
  const tagCatalog = [...used.values()];
  const ruleOrder = new Map([...catalog.keys()].map((id, n) => [id, n]));
  tagCatalog.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
    || (ruleOrder.get(a.id) ?? Infinity) - (ruleOrder.get(b.id) ?? Infinity) || a.id.localeCompare(b.id));

  return {
    version: ATLAS_VERSION,
    generatedAt: new Date().toISOString(),
    cwd: opts.cwd,
    roots,
    tagCatalog: tagCatalog.map(({ id, category, label }) => ({ id, category, label })),
    skills: skills.map(publicSkill),
    edges,
    unresolved,
    insights,
  };
}

function readSkill(dir, root) {
  const file = path.join(dir, 'SKILL.md');
  const s = {
    id: null, name: path.basename(dir), description: '', root: root.id, plugin: root.plugin ?? null,
    dir, file, digest: null, language: 'und', copies: [], frontmatter: {}, lines: 0, summary: null, files: [], translations: {}, stepKind: 'none', steps: [], tags: [], issues: [],
    _text: '', _raw: '', _readOk: false, _lines: [], _mask: [], _bodyStart: 0, _keyLines: {}, _fmError: null, _baseTags: [],
    _localTranslations: [], _staleByLang: new Map(), _editedByLang: new Map(), _translationSteps: new Map(), _listing: null,
  };
  let text;
  try {
    const size = fs.statSync(file).size;
    if (size > SKILL_FILE_MAX_BYTES) throw new Error(`it is ${size} bytes, over the ${SKILL_FILE_MAX_BYTES}-byte limit`);
    const bytes = fs.readFileSync(file);
    s.digest = sha256Hex(bytes); // an annotation written from this text records it
    text = bytes.toString('utf8');
  } catch (err) {
    s._fmError = `cannot read SKILL.md: ${err.message}`;
    return s;
  }
  s._raw = text; // compared byte for byte to find identical copies
  s.language = fileLanguage(text, { skillFile: true });
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  s._text = text;
  s._readOk = true;
  s._lines = lines;
  s.lines = lines.length;
  const fm = splitFrontmatter(text);
  s._fmError = fm.error;
  s._keyLines = fm.keyLines;
  s._bodyStart = fm.bodyStart;
  s.frontmatter = fm.data;
  // Frontmatter that did not parse is not trusted: the folder names the
  // skill and the description stays empty (data-model.md).
  if (!fm.error) {
    if (fm.data.name !== undefined && fm.data.name !== null && String(fm.data.name).trim()) s.name = String(fm.data.name).trim();
    if (typeof fm.data.description === 'string') s.description = fm.data.description.trim();
    else if (fm.data.description !== undefined && fm.data.description !== null) s.description = String(fm.data.description);
  }
  s._mask = fenceMask(lines);
  for (let i = 0; i < s._bodyStart; i++) s._mask[i] = false;
  try {
    const listed = bundledFiles(dir, text);
    s.files = listed.files;
    s._localTranslations = listed.translations;
  } catch (err) {
    warn(`cannot list the files of ${dir} (${err.message})`);
  }
  return s;
}

// A skill copied into several roots under one name, every file of its folder
// byte for byte the same, is one record; the later folders join the first
// one's `copies`. The rest of a folder is compared only once SKILL.md matches.
function mergeIdenticalCopies(skills) {
  const kept = [];
  const byName = new Map();
  for (const s of skills) {
    const same = s._readOk ? (byName.get(s.name) ?? []).find((k) => k._readOk && k._raw === s._raw && sameFolder(k, s)) : null;
    if (same) {
      same.copies.push({ root: s.root, dir: s.dir }, ...s.copies);
      continue;
    }
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
    kept.push(s);
  }
  return kept;
}

// Whether two skill folders hold the same files (same relative paths, same
// bytes) and the same links (same relative paths, same link text), dot-files
// and node_modules included: a folder too large to list whole, holding a link
// that leads out of it or an entry that cannot be read, or whose files
// together exceed COPY_COMPARE_MAX_BYTES, differs.
function sameFolder(a, b) {
  const listing = (s) => (s._listing ??= listFilesBounded(s.dir, { every: true }));
  const la = listing(a);
  const lb = listing(b);
  if (!la.complete || !lb.complete || la.files.length !== lb.files.length || la.links.length !== lb.links.length) return false;
  if (la.files.some((rel, n) => rel !== lb.files[n])) return false;
  if (la.links.some((l, n) => l.rel !== lb.links[n].rel || l.target !== lb.links[n].target)) return false;
  let total = 0;
  for (const rel of la.files) {
    const fa = path.join(a.dir, ...rel.split('/'));
    const fb = path.join(b.dir, ...rel.split('/'));
    try {
      const size = fs.statSync(fa).size;
      if (size !== fs.statSync(fb).size) return false;
      total += size;
      if (total > COPY_COMPARE_MAX_BYTES) return false;
      if (!fs.readFileSync(fa).equals(fs.readFileSync(fb))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// id = name; the 2nd+ differing skill of a name gets `<name>@<rootId>`.
function assignIds(skills) {
  const taken = new Set();
  for (const s of skills) {
    let id = taken.has(s.name) ? `${s.name}@${s.root}` : s.name;
    for (let n = 2; taken.has(id); n++) id = `${s.name}@${s.root}-${n}`;
    taken.add(id);
    s.id = id;
  }
}

function analyze(s, rules, catalog) {
  const { kind, steps } = detectSteps(s._lines, s._mask, s._bodyStart);
  s.stepKind = kind;
  const inStep = new Array(s._lines.length).fill(null);
  s.steps = steps.map((st, n) => {
    const id = `${s.id}#${n + 1}`;
    for (let i = st.start; i <= st.end; i++) inStep[i] = id;
    const lines = [];
    for (let i = st.start; i <= st.end; i++) lines.push({ line: i + 1, text: scanText(s._lines[i]) });
    return { id, index: n + 1, title: st.title, line: st.start + 1, endLine: st.end + 1, excerpt: st.excerpt, tags: [...matchLines(rules, lines).values()], calls: [] };
  });
  s._inStep = inStep;

  // Tags outside every step: the frontmatter and the rest of the body.
  const outside = [];
  for (const key of TAGGED_FRONTMATTER_KEYS) {
    const span = s._keyLines[key];
    if (span) for (let i = span.start; i <= span.end; i++) outside.push({ line: i + 1, text: scanText(s._lines[i]) });
  }
  for (let i = s._bodyStart; i < s._lines.length; i++) if (!inStep[i]) outside.push({ line: i + 1, text: scanText(s._lines[i]) });
  const base = matchLines(rules, outside);
  const fmHits = new Map();
  const tools = s._keyLines['allowed-tools'];
  if (tools) {
    const ev = { line: tools.start + 1, text: clipText(s._lines[tools.start].trim(), EVIDENCE_TEXT_MAX) };
    for (const hit of allowedToolTags(s.frontmatter['allowed-tools'], ev, catalog).values()) fmHits.set(hit.id, hit);
  }
  const hint = s._keyLines['argument-hint'];
  if (hint && catalog.has('input.arguments')) {
    addEvidence(fmHits, catalog.get('input.arguments'), 'frontmatter', { line: hint.start + 1, text: clipText(s._lines[hint.start].trim(), EVIDENCE_TEXT_MAX) });
  }
  s._baseTags = mergeHits(fmHits, base);
  for (const st of s.steps) st.tags = mergeHits(st.tags);
}

/**
 * A skill's translations (data-model.md "Languages"): of those in its folder
 * and those under translations/<skill id>/ of the state folder, one per file
 * and tag as chooseTranslation picks. Each
 * translation of SKILL.md gives words per language; every translation is
 * checked against its source's digest and its own. Steps, links and tags stay SKILL.md's.
 */
function readTranslations(s, stateDir) {
  const byKey = new Map(); // "<source rel>\0<tag>" -> every translation found, the skill folder's first
  let fromState = [];
  try {
    fromState = stateTranslations(stateDir, s.id, s.dir);
  } catch (err) {
    warn(`cannot read the translations of ${s.id} in ${stateDir} (${err.message})`);
  }
  for (const t of [...s._localTranslations, ...fromState]) {
    const key = `${t.sourceRel}\0${t.tag}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t);
  }
  const digests = new Map();
  const chosen = [];
  for (const candidates of byKey.values()) {
    const t = chooseTranslation(candidates, path.join(s.dir, ...candidates[0].sourceRel.split('/')), digests);
    if (t) chosen.push(t);
  }
  const tagsBySource = new Map();
  for (const t of chosen) {
    if (!tagsBySource.has(t.sourceRel)) tagsBySource.set(t.sourceRel, new Set());
    tagsBySource.get(t.sourceRel).add(t.tag);
    // A repair command names the translation: its path in the skill's folder, or under the state folder's translations/.
    const target = t.origin === 'state' ? `<state>/${shellWord(`${TRANSLATIONS_DIR}/${s.id}/${t.rel}`)}` : shellWord(t.abs);
    for (const [flag, byLang] of [[t.stale, s._staleByLang], [t.edited, s._editedByLang]]) {
      if (!flag) continue;
      if (!byLang.has(t.tag)) byLang.set(t.tag, []);
      byLang.get(t.tag).push({ rel: t.rel, target });
    }
  }
  for (const f of s.files) f.translations = [...(tagsBySource.get(f.path) ?? [])].sort();
  const skillTranslations = chosen.filter((t) => t.sourceRel === 'SKILL.md').sort((a, b) => a.tag.localeCompare(b.tag));
  for (const t of skillTranslations) s.translations[t.tag] = readSkillTranslation(s, t);
}

function readSkillTranslation(s, t) {
  const out = { origin: t.origin, file: t.abs, frontmatter: {}, description: null, summary: null, steps: null, stale: t.stale, edited: t.edited };
  const raw = readTextBounded(t.abs);
  if (raw === null) {
    warn(`cannot read the ${t.tag} translation of ${s.id} at ${t.abs}; its words are not shown`);
    return out;
  }
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const fm = splitFrontmatter(text);
  // Frontmatter that did not parse gives no words: each key then reads as the skill's own.
  if (!fm.error) out.frontmatter = fm.data;
  if (!fm.error && fm.data.description !== undefined && fm.data.description !== null) out.description = String(fm.data.description).trim();
  const mask = fenceMask(lines);
  for (let i = 0; i < fm.bodyStart; i++) mask[i] = false;
  // A translation's steps are read as a skill's and kept only where they
  // number as the skill's own: a step of one is then the step of the other.
  const { steps } = detectSteps(lines, mask, fm.bodyStart);
  if (steps.length === s.steps.length) out.steps = steps.map((st) => ({ title: st.title, excerpt: st.excerpt }));
  else s._translationSteps.set(t.tag, { steps: steps.length, expected: s.steps.length });
  return out;
}

// Lines searched for links: the description, then the body outside fenced code.
function linkLines(s) {
  const out = [];
  const span = s._keyLines.description;
  if (span) for (let i = span.start; i <= span.end; i++) out.push({ line: i + 1, text: scanText(s._lines[i]), step: null });
  for (let i = s._bodyStart; i < s._lines.length; i++) {
    if (!s._mask[i]) out.push({ line: i + 1, text: scanText(s._lines[i]), step: s._inStep[i] });
  }
  return out;
}

// The options of this scan as words of a `pin` command, so that its scan finds
// the same skills from any folder: --cwd always, then each --root, --agent,
// --no-user and --no-plugins given.
function scanArgs(opts) {
  return [
    '--cwd', shellWord(path.resolve(opts.cwd)),
    ...(opts.extra ?? []).flatMap((dir) => ['--root', shellWord(path.resolve(dir))]),
    ...(opts.agents ?? []).flatMap((agent) => ['--agent', shellWord(agent)]),
    ...(opts.user === false ? ['--no-user'] : []),
    ...(opts.plugins === false ? ['--no-plugins'] : []),
  ].join(' ');
}

// A path as one word of a POSIX shell command: quoted where it holds anything but safe characters.
function shellWord(p) {
  return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`;
}

function publicSkill(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) if (!k.startsWith('_')) out[k] = v;
  return out;
}
