// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Bundled files, the viewer config, and workflows.json in the state folder.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseTranslationName, canonicalTag } from './translations.mjs';
import { warn } from './log.mjs';

// The skill folder, found from this file (scripts/lib/), never from the cwd.
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BUNDLED = {
  rules: path.join(SKILL_DIR, 'references', 'tag-rules.json'),
  presets: path.join(SKILL_DIR, 'references', 'workflow-presets.json'),
  view: path.join(SKILL_DIR, 'references', 'view-settings.json'),
  viewer: path.join(SKILL_DIR, 'assets', 'viewer.html'),
  locales: path.join(SKILL_DIR, 'assets', 'locales'),
};
export const WORKFLOWS_FILE = 'workflows.json';
export const EMPTY_WORKFLOWS = Object.freeze({ version: 1, active: null, workflows: [] });
const STATE_DIR_MODE = 0o700; // workflows may name private skills; keep the folder to its owner

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${what} ${file}: ${err.message}`);
  }
}

/**
 * The viewer config, re-read on each call so edits apply on reload: the
 * presets and view settings, the language the command names, every catalog
 * in assets/locales/, and the labels of the label files beside the presets,
 * the view settings and the tag rules (data-model.md "Languages").
 * @param {{ stateDir:string, isStatic:boolean, lang?:string|null, rulesFile?:string }} opts
 */
export function viewerConfig({ stateDir, isStatic, lang = null, rulesFile = BUNDLED.rules }) {
  const presets = readJson(BUNDLED.presets, 'workflow presets');
  const view = readJson(BUNDLED.view, 'view settings');
  return {
    presets: Array.isArray(presets?.presets) ? presets.presets : [],
    view,
    static: isStatic,
    stateDir,
    lang: lang ?? null,
    locales: readLocales(BUNDLED.locales),
    labels: readLabels({ presets: BUNDLED.presets, view: BUNDLED.view, rules: rulesFile }),
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';

/** The catalogs: `{ <tag>: { name, messages } }`, one per readable assets/locales/<tag>.json. */
export function readLocales(dir) {
  const out = {};
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); } catch { return out; }
  for (const n of names) {
    const file = path.join(dir, n);
    const tag = canonicalTag(n.slice(0, -'.json'.length));
    if (!tag) { warn(`catalog ${file} is not named <language tag>.json; skipped`); continue; }
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { warn(`cannot read catalog ${file} (${err.message}); skipped`); continue; }
    if (!isObj(doc) || !isObj(doc.messages)) { warn(`catalog ${file} has no "messages" map; skipped`); continue; }
    const messages = {};
    for (const [k, v] of Object.entries(doc.messages)) if (isStr(v)) messages[k] = v;
    out[tag] = { name: isStr(doc.name) && doc.name ? doc.name : tag, messages };
  }
  return out;
}

/** Tags of the label files `<name>.<tag>.json` beside `file`, with their paths. */
export function labelFiles(file) {
  const dir = path.dirname(file);
  const sourceName = path.basename(file);
  let names;
  try { names = fs.readdirSync(dir).sort(); } catch { return []; }
  return names
    .map((n) => ({ n, parsed: parseTranslationName(n) }))
    .filter(({ parsed }) => parsed && parsed.ext === '.json' && parsed.sourceName === sourceName)
    .map(({ n, parsed }) => ({ tag: parsed.tag, file: path.join(dir, n) }));
}

/**
 * The labels per language, reduced to what the page reads: the title, a
 * category's label by key, a tag's label by id, and a preset's name,
 * description and phase names by id, its phases by position.
 */
export function readLabels(sources) {
  const out = {};
  const entry = (tag) => (out[tag] ??= { title: null, categories: {}, tags: {}, presets: {} });
  const read = (file) => {
    try {
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (isObj(doc)) return doc;
      warn(`label file ${file} is not a JSON object; skipped`);
    } catch (err) {
      warn(`cannot read label file ${file} (${err.message}); skipped`);
    }
    return null;
  };
  for (const { tag, file } of labelFiles(sources.view)) {
    const doc = read(file);
    if (!doc) continue;
    const e = entry(tag);
    if (isStr(doc.title)) e.title = doc.title;
    if (isObj(doc.categories)) {
      for (const [key, c] of Object.entries(doc.categories)) {
        if (isStr(c?.label)) e.categories[key] = c.label;
      }
    }
  }
  for (const { tag, file } of labelFiles(sources.rules)) {
    const doc = read(file);
    if (!doc) continue;
    const e = entry(tag);
    for (const t of Array.isArray(doc.tags) ? doc.tags : []) {
      if (isStr(t?.id) && isStr(t?.label)) e.tags[t.id] = t.label;
    }
  }
  for (const { tag, file } of labelFiles(sources.presets)) {
    const doc = read(file);
    if (!doc) continue;
    const e = entry(tag);
    for (const p of Array.isArray(doc.presets) ? doc.presets : []) {
      if (!isStr(p?.id)) continue;
      const preset = {};
      if (isStr(p.name)) preset.name = p.name;
      if (isStr(p.description)) preset.description = p.description;
      if (Array.isArray(p.phases)) preset.phases = p.phases.map((ph) => (isStr(ph?.name) ? ph.name : null));
      e.presets[p.id] = preset;
    }
  }
  return out;
}

/**
 * The stored workflows.json, read for a conditional update.
 * @returns {{ file:string, exists:boolean, valid:boolean, doc:object|null, etag:string|null, error:string|null }}
 *   etag is `"<sha256 hex of the file's bytes>"`, or `"none"` when no file exists;
 *   an invalid file has no etag and no doc.
 */
export function readWorkflowsState(stateDir) {
  const file = path.join(stateDir, WORKFLOWS_FILE);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') return { file, exists: false, valid: true, doc: structuredClone(EMPTY_WORKFLOWS), etag: NO_FILE_ETAG, error: null };
    return { file, exists: true, valid: false, doc: null, etag: null, error: `cannot read ${file}: ${err.message}` };
  }
  let doc;
  try {
    doc = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    return { file, exists: true, valid: false, doc: null, etag: null, error: `${file} is not valid JSON (${err.message})` };
  }
  const checked = validateWorkflows(doc);
  if (!checked.ok) return { file, exists: true, valid: false, doc: null, etag: null, error: `${file} is not a workflows document: ${checked.error}` };
  return { file, exists: true, valid: true, doc, etag: etagOf(bytes), error: null };
}

export const NO_FILE_ETAG = '"none"';
export function etagOf(bytes) { return `"${crypto.createHash('sha256').update(bytes).digest('hex')}"`; }

/**
 * Check a workflows document against data-model.md. Unknown extra fields are
 * kept; a missing phase `note` becomes "".
 * @returns {{ ok: true, doc: object } | { ok: false, error: string }}
 */
export function validateWorkflows(doc) {
  const fail = (error) => ({ ok: false, error });
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isStr = (v) => typeof v === 'string';
  if (!isObj(doc)) return fail('the document must be a JSON object');
  if (doc.version !== 1) return fail('"version" must be 1');
  if (doc.active !== null && !isStr(doc.active)) return fail('"active" must be a workflow id or null');
  if (!Array.isArray(doc.workflows)) return fail('"workflows" must be a list');
  const ids = new Set();
  const workflows = [];
  for (const [n, w] of doc.workflows.entries()) {
    const at = `workflows[${n}]`;
    if (!isObj(w)) return fail(`${at} must be an object`);
    if (!isStr(w.id) || !w.id) return fail(`${at}.id must be a non-empty string`);
    if (ids.has(w.id)) return fail(`${at}.id "${w.id}" is used twice`);
    ids.add(w.id);
    if (!isStr(w.name)) return fail(`${at}.name must be a string`);
    if (!Array.isArray(w.phases)) return fail(`${at}.phases must be a list`);
    const phaseIds = new Set();
    const phases = [];
    for (const [k, p] of w.phases.entries()) {
      const pat = `${at}.phases[${k}]`;
      if (!isObj(p)) return fail(`${pat} must be an object`);
      if (!isStr(p.id) || !p.id) return fail(`${pat}.id must be a non-empty string`);
      if (phaseIds.has(p.id)) return fail(`${pat}.id "${p.id}" is used twice in workflow "${w.id}"`);
      phaseIds.add(p.id);
      if (!isStr(p.name)) return fail(`${pat}.name must be a string`);
      if (p.note !== undefined && !isStr(p.note)) return fail(`${pat}.note must be a string`);
      if (!Array.isArray(p.skills) || !p.skills.every(isStr)) return fail(`${pat}.skills must be a list of skill names`);
      phases.push({ ...p, note: p.note ?? '', skills: [...p.skills] });
    }
    workflows.push({ ...w, phases });
  }
  if (doc.active !== null && !ids.has(doc.active)) return fail(`"active" names "${doc.active}", which is not a workflow id`);
  return { ok: true, doc: { ...doc, version: 1, active: doc.active, workflows } };
}

/**
 * Write workflows.json atomically (temp file, then rename).
 * @returns {{ doc: object, etag: string }}
 */
export function writeWorkflows(stateDir, doc) {
  fs.mkdirSync(stateDir, { recursive: true, mode: STATE_DIR_MODE });
  const file = path.join(stateDir, WORKFLOWS_FILE);
  const tmp = path.join(stateDir, `.${WORKFLOWS_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const bytes = Buffer.from(JSON.stringify(doc, null, 2) + '\n', 'utf8');
  try {
    fs.writeFileSync(tmp, bytes, { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* the temp file may not exist */ }
    throw err;
  }
  return { doc, etag: etagOf(bytes) };
}

export const WORKFLOWS_LOCK_FILE = `${WORKFLOWS_FILE}.lock`;
const LOCK_WAIT_MS = 1000; // a save holds the lock for milliseconds
const LOCK_RETRY_MS = 20;
export const LOCK_STALE_MS = 10_000; // a lock this old was left by a server that stopped mid-save

/** Thrown when another process holds the workflows lock past the wait. */
export class LockBusyError extends Error {
  constructor(file) {
    super(`another skill-atlas server sharing this state folder is saving workflows.json (${file} is held); save again in a moment`);
    this.code = 'ELOCKBUSY';
  }
}

/**
 * Run `fn` holding workflows.json.lock in the state folder, so that the
 * version check and the write are one step among every process sharing it.
 * Waits up to LOCK_WAIT_MS while another holds it, breaks a lock older than
 * LOCK_STALE_MS, and throws LockBusyError when it cannot be taken.
 */
export function withWorkflowsLock(stateDir, fn) {
  fs.mkdirSync(stateDir, { recursive: true, mode: STATE_DIR_MODE });
  const file = path.join(stateDir, WORKFLOWS_LOCK_FILE);
  const token = `${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
  const body = JSON.stringify({ pid: process.pid, time: new Date().toISOString(), token });
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.writeFileSync(file, body, { flag: 'wx', mode: 0o600 });
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    if (breakStaleLock(file)) continue;
    if (Date.now() >= deadline) throw new LockBusyError(file);
    Atomics.wait(sleeper, 0, 0, LOCK_RETRY_MS); // sleep without spinning
  }
  try {
    return fn();
  } finally {
    // Removed only while it is still this holder's: a lock broken as stale may be another's now.
    try { if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.rmSync(file, { force: true }); } catch { /* gone or another's */ }
  }
}

// Remove a lock older than LOCK_STALE_MS; true where it is gone. A live lock
// is never moved or removed: breakers take turns through a second file made
// with 'wx', and the one whose turn it is checks the lock again and removes it
// only while it is still stale. Only a holder removes its own lock, and only a
// breaker a stale one, so a lock seen stale in a turn is the one removed, and a
// lock another takes after that removal is seen fresh by every later turn.
function breakStaleLock(file) {
  if (!isStale(file)) return !fs.existsSync(file);
  const breaker = `${file}.break`;
  try {
    fs.writeFileSync(breaker, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    // Another breaks it now; a breaker's turn lasts microseconds, so one this
    // old was left by a process that stopped inside its turn.
    if (isStale(breaker)) fs.rmSync(breaker, { force: true });
    return false;
  }
  try {
    if (!isStale(file)) return !fs.existsSync(file);
    fs.rmSync(file, { force: true });
    return true;
  } finally {
    fs.rmSync(breaker, { force: true });
  }
}

// Whether `file` exists and was last written over LOCK_STALE_MS ago.
function isStale(file) {
  try {
    return Date.now() - fs.statSync(file).mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}

/** Move an invalid workflows.json aside as workflows.invalid-<n>.json (first free n). */
export function setAsideInvalid(stateDir) {
  const file = path.join(stateDir, WORKFLOWS_FILE);
  for (let n = 1; ; n++) {
    const aside = path.join(stateDir, `workflows.invalid-${n}.json`);
    if (fs.existsSync(aside)) continue;
    fs.renameSync(file, aside);
    return aside;
  }
}
