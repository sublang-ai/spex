// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Translations of a skill's files (data-model.md "Languages"): a file beside
// its source named with a language tag before the extension, in the skill's
// folder or under translations/<skill id>/ of the state folder, recording the
// SHA-256 of the source it was made from and, in Markdown, its own.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fenceMask } from './markdown.mjs';
import { splitFrontmatter } from './frontmatter.mjs';

export const TRANSLATIONS_DIR = 'translations';
export const TRANSLATION_READ_MAX_BYTES = 4 * 1024 * 1024; // a larger file is no translation a reader studies
const WALK_MAX_FILES = 5000; // stop listing a pathological tree after this many files
const WALK_MAX_DIRS = 2000;
const SKIP = new Set(['node_modules', '__pycache__']);

// A two- or three-letter language with optional subtags, before an extension
// of a text file: `SKILL.zh-CN.md`, `prompts.zh.md`, `labels.en-US.json`.
const TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;
const TRANSLATION_NAME = /^(.+)\.([a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)\.(md|json|txt|yaml|yml)$/;

const HEX = /^[0-9a-f]{64}$/i;
const MD_RECORD = /^\s*<!--\s*skill-atlas:source\s+sha256=([0-9a-fA-F]{64})(?:\s+own=([0-9a-fA-F]{64}))?\s*-->\s*$/;
const HASH_RECORD = /^\s*#\s*skill-atlas:source\s+sha256=([0-9a-fA-F]{64})\s*$/;
const MD_SPDX = /^\s*<!--\s*SPDX-[A-Za-z-]+:.*-->\s*$/;
const HASH_SPDX = /^\s*#\s*SPDX-[A-Za-z-]+:/;
export const JSON_RECORD_KEY = 'translationOf';

let languageNames;
/**
 * A language tag in its canonical case (`zh-cn` -> `zh-CN`), or null when it
 * is none: a known language, written in its canonical form but for case, so a
 * word such as `dev`, `bak` (canonically `ba`) or `tmp` is no tag.
 */
export function canonicalTag(tag) {
  if (typeof tag !== 'string') return null;
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/.test(tag)) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(tag);
    if (!canonical || canonical.toLowerCase() !== tag.toLowerCase()) return null;
    languageNames ??= new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
    return languageNames.of(canonical.split('-')[0]) ? canonical : null;
  } catch {
    return null;
  }
}

/**
 * Read a file name as a translation's. A three-letter language names one only
 * with a subtag (`yue-HK`), since bare words such as `min` and `new` are
 * languages too and name minified and new files far more often.
 * @returns {{ tag:string, sourceName:string, ext:string } | null} tag canonical
 */
export function parseTranslationName(name) {
  const m = TRANSLATION_NAME.exec(name);
  if (!m || !TAG.test(m[2]) || /^[a-z]{3}$/.test(m[2])) return null;
  const tag = canonicalTag(m[2]);
  if (!tag) return null;
  return { tag, sourceName: `${m[1]}.${m[3]}`, ext: `.${m[3]}` };
}

/** The relative path of the source a translation's relative path translates, or null. */
export function sourceRelOf(rel) {
  const parsed = parseTranslationName(path.posix.basename(rel));
  if (!parsed) return null;
  const dir = path.posix.dirname(rel);
  return { ...parsed, sourceRel: dir === '.' ? parsed.sourceName : `${dir}/${parsed.sourceName}` };
}

/** The real path of `abs` when it is a regular file inside the real folder `baseReal`, else null. */
export function fileInside(baseReal, abs) {
  let real;
  try { real = fs.realpathSync(abs); } catch { return null; }
  const rel = path.relative(baseReal, real);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  try { if (!fs.statSync(real).isFile()) return null; } catch { return null; }
  return real;
}

/**
 * Every regular file under `dir` that stays inside it, as forward-slash
 * relative paths in name order; dot-entries, node_modules and links leading
 * out are left out.
 */
export function listFiles(dir, limits) {
  return listFilesBounded(dir, limits).files;
}

/**
 * listFiles, saying whether the listing is whole: `complete` is false where
 * the folder holds more files or folders than the limits let it list.
 * With `strict`, an entry that cannot be read makes the listing incomplete
 * rather than being left out.
 * With `every`, dot-entries and node_modules are listed too, a link inside
 * the folder is listed under `links` with its link text and not followed, and
 * a link leading out of the folder or one that cannot be read makes the
 * listing incomplete, so a listing that is complete holds every entry of the
 * folder (`strict` implied).
 * With `hidden`, dot-entries and `__pycache__` are listed too, only `.git`
 * and node_modules passed over.
 * With `follow`, a link is followed wherever it leads, each real folder walked
 * once, its files listed under the link's path; a link that cannot be
 * followed is listed under `broken` by its relative path.
 * @returns {{ files:string[], links:{ rel:string, target:string }[], broken:string[], complete:boolean }}
 */
export function listFilesBounded(dir, { maxFiles = WALK_MAX_FILES, maxDirs = WALK_MAX_DIRS, every = false, strict = every, hidden = false, follow = false } = {}) {
  const passOver = every ? () => false
    : hidden ? (name) => name === '.git' || name === 'node_modules'
      : (name) => name.startsWith('.') || SKIP.has(name);
  const out = [];
  const links = [];
  const broken = [];
  const seen = new Set();
  let dirs = 0;
  let complete = true;
  let base;
  try { base = fs.realpathSync(dir); } catch { return { files: out, links, broken, complete: !strict }; }
  const inside = (real) => {
    const rel = path.relative(base, real);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  const walk = (abs, rel) => {
    if (!complete) return;
    if (dirs >= maxDirs) { complete = false; return; }
    dirs++;
    let real;
    try { real = fs.realpathSync(abs); } catch { if (strict) complete = false; return; }
    if (seen.has(real)) return; // a symlink loop
    seen.add(real);
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { if (strict) complete = false; return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (!complete) return;
      if (passOver(e.name)) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      let stat;
      try {
        let childReal;
        try {
          childReal = fs.realpathSync(childAbs);
        } catch (err) {
          if (follow && e.isSymbolicLink()) { broken.push(childRel); continue; }
          throw err;
        }
        if (!follow && !inside(childReal)) {
          if (every) { complete = false; return; }
          continue;
        }
        if (every && e.isSymbolicLink()) {
          // Two folders alike hold the same links: compared by their text, never followed.
          if (out.length + links.length >= maxFiles) { complete = false; return; }
          links.push({ rel: childRel, target: fs.readlinkSync(childAbs) });
          continue;
        }
        stat = fs.statSync(childAbs);
      } catch {
        if (strict) { complete = false; return; }
        continue;
      }
      if (stat.isDirectory()) { walk(childAbs, childRel); continue; }
      if (!stat.isFile()) continue;
      if (out.length + links.length >= maxFiles) { complete = false; return; }
      out.push(childRel);
    }
  };
  walk(dir, '');
  return { files: out, links, broken, complete };
}

/** translations/<skill id>/ of the state folder, or null where the id cannot name a folder. */
export function stateTranslationsDir(stateDir, skillId) {
  if (typeof skillId !== 'string' || !skillId || skillId === '.' || skillId === '..' || /[\\/\0]/.test(skillId)) return null;
  return path.join(stateDir, TRANSLATIONS_DIR, skillId);
}

/**
 * The translations held under translations/<skill id>/ of the state folder
 * whose source exists in the skill's folder.
 * @returns {{ rel:string, sourceRel:string, tag:string, abs:string, origin:'state' }[]}
 */
export function stateTranslations(stateDir, skillId, skillDir) {
  const dir = stateTranslationsDir(stateDir, skillId);
  if (!dir) return [];
  let skillReal;
  try { skillReal = fs.realpathSync(skillDir); } catch { return []; }
  const out = [];
  for (const rel of listFiles(dir)) {
    const src = sourceRelOf(rel);
    if (!src || !fileInside(skillReal, path.join(skillDir, src.sourceRel))) continue;
    out.push({ rel, sourceRel: src.sourceRel, tag: src.tag, abs: path.join(dir, ...rel.split('/')), origin: 'state' });
  }
  return out;
}

// A tag's language and script, its likely script filled in (`zh` -> zh-Hans), or null.
function languageAndScript(tag) {
  try {
    const { language, script } = new Intl.Locale(tag).maximize();
    return `${language}-${script ?? ''}`;
  } catch {
    return null;
  }
}

/**
 * The tag of `tags` read for a reader of `want`: the same tag, else the first
 * in name order of the same language and script (`zh`, `zh-Hans` and `zh-SG`
 * for `zh-CN`, never `zh-TW` or `zh-Hant`); null where none does. The scan,
 * `/api/file` and annotations' words choose a tag through this alone, before
 * any folder is chosen [chooseTranslation].
 */
export function matchingTag(want, tags) {
  const exact = tags.find((t) => t.toLowerCase() === String(want).toLowerCase());
  if (exact !== undefined) return exact;
  const key = languageAndScript(want);
  if (!key) return null;
  return [...tags].sort().find((t) => languageAndScript(t) === key) ?? null;
}

/**
 * Of a file's translations under one tag, the one the scan reports and the
 * server returns: the skill folder's, except where it is behind its source and
 * the state folder's records its source's digest and that digest is the
 * source's, then the state folder's; a state translation recording no digest
 * never displaces the skill's own. Of several of one origin (names differing
 * in case alone), the first by name. Both the scan and the server choose
 * through this alone, within one tag [matchingTag].
 * @param {{ origin:'skill'|'state', abs:string }[]} candidates
 * @param {string} sourceFile the file they translate
 * @returns {object|null} the chosen candidate with its `stale`, `edited` and `current` [translationState]
 */
export function chooseTranslation(candidates, sourceFile, digestCache) {
  const firstOf = (origin) => candidates.filter((c) => c.origin === origin)
    .sort((a, b) => (a.abs < b.abs ? -1 : a.abs > b.abs ? 1 : 0))[0];
  const judged = (c) => (c ? { ...c, ...translationState(c.abs, sourceFile, digestCache) } : null);
  const own = judged(firstOf('skill'));
  const state = judged(firstOf('state'));
  if (own && !(own.stale && state?.current)) return own;
  return state;
}

/**
 * The translation of the skill file `rel` into `lang`: under the one tag
 * matchingTag reads among the file's translations, the skill folder's or the
 * state folder's as chooseTranslation picks within that tag; only a regular
 * file inside its folder counts.
 * @returns {{ abs:string, real:string, origin:'skill'|'state', tag:string, stale:boolean, edited:boolean } | null}
 */
export function findTranslation(skill, rel, lang, stateDir) {
  const want = canonicalTag(lang);
  if (!want) return null;
  const relPosix = rel.split(path.sep).join('/');
  const dirRel = path.posix.dirname(relPosix);
  const name = path.posix.basename(relPosix);
  const places = [{ base: skill.dir, origin: 'skill' }];
  const stateDirOfSkill = stateDir ? stateTranslationsDir(stateDir, skill.id) : null;
  if (stateDirOfSkill) places.push({ base: stateDirOfSkill, origin: 'state' });
  const found = []; // every translation of the file
  for (const { base, origin } of places) {
    let baseReal;
    try { baseReal = fs.realpathSync(base); } catch { continue; }
    const folder = dirRel === '.' ? base : path.join(base, ...dirRel.split('/'));
    let entries;
    try { entries = fs.readdirSync(folder); } catch { continue; }
    for (const entry of entries) {
      const parsed = parseTranslationName(entry);
      if (!parsed || parsed.sourceName !== name) continue;
      const abs = path.join(folder, entry);
      const real = fileInside(baseReal, abs);
      if (real) found.push({ abs, real, origin, tag: parsed.tag });
    }
  }
  // The tag first, then the folder within it: never compared across tags.
  const tag = matchingTag(want, [...new Set(found.map((t) => t.tag))]);
  if (tag === null) return null;
  return chooseTranslation(found.filter((t) => t.tag === tag), path.join(skill.dir, ...relPosix.split('/')));
}

export function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function lineForm(ext) {
  if (ext === '.yaml' || ext === '.yml') return { record: HASH_RECORD, spdx: HASH_SPDX, make: (hex) => `# skill-atlas:source sha256=${hex}` };
  return { record: MD_RECORD, spdx: MD_SPDX, make: (hex, own) => `<!-- skill-atlas:source sha256=${hex}${own ? ` own=${own}` : ''} -->` };
}

/** Only a Markdown translation records its own digest. */
export const recordsOwn = (ext) => ext === '.md';

// A text's lines, the index of its record line (-1 where none) and the record's match.
function recordLine(text, ext) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const mask = ext === '.md' ? fenceMask(lines) : null;
  const { record } = lineForm(ext);
  for (let i = 0; i < lines.length; i++) {
    if (mask?.[i]) continue;
    const m = record.exec(lines[i]);
    if (m) return { lines, at: i, m };
  }
  return { lines, at: -1, m: null };
}

/**
 * The digests a translation records, lowercase: `source`, its source's, and
 * `own`, a Markdown translation's own; null where it records none.
 */
export function recordedDigests(text, ext) {
  if (ext === '.json') {
    let doc;
    try { doc = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { return { source: null, own: null }; }
    const hex = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc[JSON_RECORD_KEY]?.sha256 : null;
    return { source: typeof hex === 'string' && HEX.test(hex) ? hex.toLowerCase() : null, own: null };
  }
  const { m } = recordLine(text, ext);
  return { source: m ? m[1].toLowerCase() : null, own: m?.[2] && recordsOwn(ext) ? m[2].toLowerCase() : null };
}

/** The source digest a translation records, lowercase, or null when it records none. */
export function recordedDigest(text, ext) {
  return recordedDigests(text, ext).source;
}

/**
 * A Markdown translation's own digest: the SHA-256 of its UTF-8 text without
 * a byte order mark, with LF line ends and with its record line left out.
 */
export function ownDigest(text, ext) {
  const { lines, at } = recordLine(text, ext);
  if (at >= 0) lines.splice(at, 1);
  return sha256Hex(Buffer.from(lines.join('\n'), 'utf8'));
}

/** Read a file's text, or null when it is missing, too large or unreadable. */
export function readTextBounded(file) {
  try {
    if (fs.statSync(file).size > TRANSLATION_READ_MAX_BYTES) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Whether a translation is behind its source (the source's digest it records
 * is not the source's), edited apart from it (the own digest it records is
 * not its own), and current (the source's digest it records is the source's).
 * One recording none is none of them.
 * @returns {{ stale:boolean, edited:boolean, current:boolean }}
 */
export function translationState(translationFile, sourceFile, digestCache) {
  const text = readTextBounded(translationFile);
  if (text === null) return { stale: false, edited: false, current: false };
  const ext = path.extname(translationFile).toLowerCase();
  const recorded = recordedDigests(text, ext);
  const current = recorded.source ? digestOf(sourceFile, digestCache) : null;
  return {
    stale: current !== null && recorded.source !== current,
    edited: recorded.own !== null && recorded.own !== ownDigest(text, ext),
    current: current !== null && recorded.source === current,
  };
}

/** Whether a translation is behind its source; see translationState. */
export function isStale(translationFile, sourceFile, digestCache) {
  return translationState(translationFile, sourceFile, digestCache).stale;
}

export function digestOf(file, cache) {
  if (cache?.has(file)) return cache.get(file);
  let hex = null;
  try { hex = sha256Hex(fs.readFileSync(file)); } catch { /* an unreadable source has no digest */ }
  cache?.set(file, hex);
  return hex;
}

/**
 * The translation's text with `hex` recorded as its source's digest and, in
 * Markdown, its own digest beside it: an existing record rewritten in place,
 * else a new one inserted (Markdown and text after any frontmatter and the
 * SPDX comment lines that open the file; JSON as the first top-level key,
 * keeping the file's formatting). Every other line keeps its own line end.
 * @throws {Error} when the text cannot hold the record
 */
export function withRecordedDigest(text, ext, hex) {
  if (ext === '.json') return jsonWithRecord(text, hex);
  const placed = withRecordLine(text, ext, lineForm(ext).make(hex, recordsOwn(ext) ? '0'.repeat(64) : null));
  if (!recordsOwn(ext)) return placed;
  // The own digest leaves the record line out, so placing it changes nothing it covers.
  return withRecordLine(placed, ext, lineForm(ext).make(hex, ownDigest(placed, ext)));
}

function withRecordLine(text, ext, line) {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? text.slice(1) : text;
  const parts = body.split(/(?<=\n)/); // each line with its own terminator
  const lines = parts.map((p) => p.replace(/\r?\n$/, ''));
  if (body === '') { parts.length = 0; lines.length = 0; }
  const form = lineForm(ext);
  const mask = ext === '.md' ? fenceMask(lines) : null;
  const existing = lines.findIndex((l, i) => !mask?.[i] && form.record.test(l));
  if (existing >= 0) {
    parts[existing] = line + parts[existing].slice(lines[existing].length);
    return bom + parts.join('');
  }
  let at = 0;
  if (ext === '.md') {
    const fm = splitFrontmatter(lines.join('\n'));
    if (fm.present && fm.bodyStart > 0) at = fm.bodyStart;
  }
  // After the SPDX comment lines that open the file (or follow its frontmatter).
  let lastSpdx = -1;
  for (let i = at; i < lines.length; i++) {
    if (form.spdx.test(lines[i]) || (ext === '.txt' && HASH_SPDX.test(lines[i]))) { lastSpdx = i; continue; }
    if (lines[i].trim() === '') continue;
    break;
  }
  if (lastSpdx >= 0) at = lastSpdx + 1;
  // The new line ends as the line before it does, else as the first line does.
  const eolOf = (p) => (p ? (p.endsWith('\r\n') ? '\r\n' : p.endsWith('\n') ? '\n' : '') : '');
  const eol = eolOf(parts[at - 1]) || eolOf(parts[0]) || '\n';
  let end = eol;
  if (at > 0 && at === parts.length && !eolOf(parts[at - 1])) { parts[at - 1] += eol; end = ''; } // after a last line with no end
  parts.splice(at, 0, line + end);
  return bom + parts.join('');
}

function jsonWithRecord(text, hex) {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? text.slice(1) : text;
  let doc;
  try { doc = JSON.parse(body); } catch (err) { throw new Error(`it is not valid JSON (${err.message})`); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('it is not a JSON object, so it cannot hold a "translationOf" key');
  const value = `{ "sha256": "${hex}" }`;
  const { open, close, members } = topLevelMembers(body);
  let out;
  const found = members.filter((m) => m.key === JSON_RECORD_KEY).pop();
  if (found) {
    out = body.slice(0, found.valueStart) + value + body.slice(found.valueEnd);
  } else if (!members.length) {
    out = `${body.slice(0, open + 1)} "${JSON_RECORD_KEY}": ${value} ${body.slice(close)}`;
  } else {
    const first = members[0];
    const lead = body.slice(open + 1, first.keyStart);
    out = `${body.slice(0, first.keyStart)}"${JSON_RECORD_KEY}": ${value},${lead}${body.slice(first.keyStart)}`;
  }
  const check = JSON.parse(out);
  if (check?.[JSON_RECORD_KEY]?.sha256 !== hex) throw new Error('the record could not be written into it');
  return bom + out;
}

// The top-level members of a valid JSON object text, by character offsets.
function topLevelMembers(text) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const str = () => { // at an opening quote; returns past the closing one
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    return ++i;
  };
  ws();
  const open = i;
  i++;
  const members = [];
  for (;;) {
    ws();
    if (text[i] === '}') break;
    const keyStart = i;
    const keyEnd = str();
    const key = JSON.parse(text.slice(keyStart, keyEnd));
    ws();
    i++; // ':'
    ws();
    const valueStart = i;
    let depth = 0;
    let last = i;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') { str(); last = i; continue; }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { if (depth === 0) break; depth--; } else if (c === ',' && depth === 0) break;
      i++;
      if (!/\s/.test(c)) last = i;
    }
    members.push({ key, keyStart, valueStart, valueEnd: last });
    if (text[i] === ',') { i++; continue; }
    break;
  }
  ws();
  return { open, close: i, members };
}
