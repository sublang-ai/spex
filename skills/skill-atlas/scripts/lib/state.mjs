// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Bundled files, the viewer config, and workflows.json in the state folder.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// The skill folder, found from this file (scripts/lib/), never from the cwd.
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BUNDLED = {
  rules: path.join(SKILL_DIR, 'references', 'tag-rules.json'),
  presets: path.join(SKILL_DIR, 'references', 'workflow-presets.json'),
  view: path.join(SKILL_DIR, 'references', 'view-settings.json'),
  viewer: path.join(SKILL_DIR, 'assets', 'viewer.html'),
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

/** The viewer config, re-read on each call so edits apply on reload. */
export function viewerConfig(stateDir, isStatic) {
  const presets = readJson(BUNDLED.presets, 'workflow presets');
  const view = readJson(BUNDLED.view, 'view settings');
  return { presets: Array.isArray(presets?.presets) ? presets.presets : [], view, static: isStatic, stateDir };
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
