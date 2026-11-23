// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// annotations.json: corrections a reader layers on the scan (data-model.md).
// Everything added is marked `"source": "annotation"`. A malformed file or
// entry is reported on stderr and the scan carries on without it. A name holds
// one entry or a list of them: of those recording a skill's SKILL.md digest
// the last is that skill's, applied where each other file it lists under
// `source.files` has its digest and otherwise reported as a
// `stale-annotation` insight, no earlier entry revived [entriesFor]; skills of
// one name sharing their SKILL.md are told apart by keys of their own ids.

import fs from 'node:fs';
import path from 'node:path';
import { warn } from './log.mjs';
import { tagInfo, mergeHits } from './tags.mjs';
import { canonicalTag, matchingTag, fileInside, digestOf } from './translations.mjs';
import { oneLinkEach } from './links.mjs';

export const ANNOTATIONS_FILE = 'annotations.json';

/** Read annotations from the state folder; null when absent or unusable. */
export function loadAnnotations(stateDir) {
  const file = path.join(stateDir, ANNOTATIONS_FILE);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') warn(`cannot read ${file} (${err.message}); annotations not applied`);
    return null;
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    warn(`${file} is not valid JSON (${err.message}); annotations not applied \u2014 fix the file and rescan`);
    return null;
  }
  if (!doc || typeof doc !== 'object' || !doc.skills || typeof doc.skills !== 'object' || Array.isArray(doc.skills)) {
    warn(`${file} has no "skills" map (see references/data-model.md); annotations not applied`);
    return null;
  }
  return doc;
}

/**
 * Apply annotations to scanned skills, edges and unresolved links in place.
 * @param {object} doc from loadAnnotations
 * @param {{ skills: object[], edges: object[], unresolved: object[], catalog: Map }} atlas
 */
export function applyAnnotations(doc, atlas) {
  const byKey = new Map();
  const byName = new Map(); // name -> every scanned skill of it, the first first
  for (const s of atlas.skills) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  // A name is the key of the skill reported under it (its id holding no `@`),
  // else of the first of the name; an id is its own skill's key.
  for (const [name, list] of byName) byKey.set(name, list.find((s) => !s.id.includes('@')) ?? list[0]);
  for (const s of atlas.skills) byKey.set(s.id, s);
  // A link's target: a name reaches the skill a scanned link from the same
  // skill reaches [links.mjs resolve]; an id that is no name, its own skill.
  const byId = new Map(atlas.skills.map((s) => [s.id, s]));
  const targetFrom = (from) => (ref) => (typeof ref !== 'string' ? null
    : byId.get(atlas.resolve?.(ref, from.root)) ?? byKey.get(ref) ?? null);

  for (const [key, value] of Object.entries(doc.skills)) {
    const skill = byKey.get(key);
    if (!skill) { warn(`annotations: skill "${key}" is not installed; its entry is ignored`); continue; }
    // A name's entries serve every skill of that name, each the entry recording
    // its digest; a differing skill's own `<name>@<rootId>` key comes first.
    const sameName = key === skill.name ? byName.get(key) : [skill];
    const others = sameName.filter((s) => s !== skill && !Object.hasOwn(doc.skills, s.id));
    for (const [s, chosen] of entriesFor(skill, others, sameName, value, `annotations for "${key}"`)) applyEntry(atlas, s, chosen, targetFrom(s));
  }
}

// One entry applied to one skill.
function applyEntry(atlas, skill, { ann, where }, resolveSkill) {
  const tag = (id, note) => {
    const info = typeof id === 'string' ? tagInfo(id, atlas.catalog) : null;
    if (!info) { warn(`${where}: tag ${JSON.stringify(id)} is not <category>.<slug> with category input, output, tool or human; skipped`); return null; }
    if (!atlas.catalog.has(info.id)) atlas.catalog.set(info.id, { id: info.id, category: info.category, label: info.label });
    return { id: info.id, category: info.category, label: info.label, source: 'annotation', evidence: note ? [{ line: null, text: String(note) }] : [] };
  };
  const stepAt = (n) => {
    if (n === undefined || n === null) return undefined;
    const step = Number.isInteger(n) ? skill.steps.find((st) => st.index === n) : null;
    if (!step) warn(`${where}: step ${JSON.stringify(n)} does not exist (the skill has ${skill.steps.length} steps); entry skipped`);
    return step ?? null;
  };

  if (typeof ann.summary === 'string') skill.summary = ann.summary;

  if (ann.steps !== undefined) {
    if (!Array.isArray(ann.steps)) {
      warn(`${where}: "steps" is not a list; detected steps kept`);
    } else {
      // Replacing the steps detaches scanned links and tags from the old
      // steps: they stay on the skill as a whole.
      // Links that were the former steps' are one per target, or name, at the skill, calls before mentions.
      for (const e of atlas.edges) if (e.from === skill.id) e.fromStep = null;
      atlas.edges = oneLinkEach(atlas.edges);
      for (const u of atlas.unresolved) if (u.from === skill.id) u.fromStep = null;
      atlas.unresolved = oneLinkEach(atlas.unresolved);
      skill._baseTags = mergeHits(skill._baseTags, ...skill.steps.map((st) => st.tags));
      skill.steps = ann.steps.map((st, n) => {
        const index = n + 1;
        const id = `${skill.id}#${index}`;
        const step = { id, index, title: typeof st?.title === 'string' ? st.title : `Step ${index}`, line: null, endLine: null, excerpt: typeof st?.summary === 'string' ? st.summary : '', tags: [], calls: [] };
        // Entries carry title and summary; `tags` and `calls` are still read when present.
        for (const t of Array.isArray(st?.tags) ? st.tags : []) { const hit = tag(t); if (hit) step.tags.push(hit); }
        for (const c of Array.isArray(st?.calls) ? st.calls : []) addCall(atlas, skill, step, resolveSkill(c), c, 'calls', null, where);
        return step;
      });
      skill.stepKind = 'step';
      // A translation's steps were read against the detected steps, which
      // are gone: only an annotation's words per language stand for these.
      for (const tr of Object.values(skill.translations ?? {})) tr.steps = null;
      skill._translationSteps?.clear();
    }
  }

  applyTranslatedWords(skill, ann.translations, where);

  for (const add of list(ann.addTags, 'addTags', where)) {
    const step = stepAt(add?.step);
    if (step === null) continue;
    const hit = tag(add?.id, add?.note);
    if (!hit) continue;
    if (step) step.tags = mergeHits(step.tags, [hit]);
    else skill._baseTags = mergeHits(skill._baseTags, [hit]);
  }
  for (const rm of list(ann.removeTags, 'removeTags', where)) {
    const step = stepAt(rm?.step);
    if (step === null || typeof rm?.id !== 'string') continue;
    if (step) step.tags = step.tags.filter((t) => t.id !== rm.id);
    else {
      skill._baseTags = skill._baseTags.filter((t) => t.id !== rm.id);
      for (const st of skill.steps) st.tags = st.tags.filter((t) => t.id !== rm.id);
    }
  }
  for (const add of list(ann.addCalls, 'addCalls', where)) {
    const step = stepAt(add?.step);
    if (step === null) continue;
    const kind = add?.kind === 'mentions' ? 'mentions' : 'calls';
    addCall(atlas, skill, step ?? null, resolveSkill(add?.to), add?.to, kind, add?.note, where);
  }
  for (const rm of list(ann.removeCalls, 'removeCalls', where)) {
    const step = stepAt(rm?.step);
    if (step === null || typeof rm?.to !== 'string') continue;
    // A name or id reaching a skill removes the links to that skill alone; one
    // reaching none, the unresolved links by that name.
    const target = resolveSkill(rm.to);
    const hits = (e) => e.from === skill.id && (!step || e.fromStep === step.id);
    if (target) atlas.edges = atlas.edges.filter((e) => !(hits(e) && e.to === target.id));
    else atlas.unresolved = atlas.unresolved.filter((u) => !(hits(u) && u.name === rm.to));
  }
}

// The entries a key applies, as [skill, { ann, where }] pairs, `where` being
// the words its warnings name it by. A key holds one entry or a list of them;
// the `SKILL.md` digest an entry records tells which skill of the name it was
// written for (the state folder serves every project). Of the entries
// recording a skill's digest the last is its annotation, superseding the
// earlier ones outright: it applies where every file it lists under
// `source.files` has its digest [filesMatch], else the skill's annotation is
// stale and no earlier entry stands in. A skill no entry records the digest of
// is given, the key's skill alone, the last entry recording none; else it is
// stale where an entry records a digest no skill of the name (`sameName`) has,
// written for an earlier text of any of them.
function entriesFor(skill, others, sameName, value, where) {
  const many = Array.isArray(value);
  const entries = [];
  for (const [n, ann] of (many ? value : [value]).entries()) {
    const at = many ? `${where} (entry ${n + 1})` : where;
    if (!ann || typeof ann !== 'object' || Array.isArray(ann)) { warn(`${at}: the entry is not an object; ignored`); continue; }
    if (ann.source === undefined || ann.source === null) { entries.push({ ann, where: at, hex: null, files: null }); continue; }
    const hex = ann.source?.sha256;
    const files = ann.source?.files;
    if (typeof ann.source !== 'object' || typeof hex !== 'string') { warn(`${at}: "source" is not { "sha256": "<64 hex>" }; entry not applied`); continue; }
    if (files !== undefined && (!files || typeof files !== 'object' || Array.isArray(files) || !Object.values(files).every((v) => typeof v === 'string'))) {
      warn(`${at}: "source.files" is not { "<relative path>": "<64 hex>" }; entry not applied`);
      continue;
    }
    entries.push({ ann, where: at, hex: hex.toLowerCase(), files: files ?? null });
  }
  const digestCache = new Map(); // a listed file's real path -> its digest, read once
  const lastOf = (list) => list[list.length - 1] ?? null;
  const out = [];
  for (const s of [skill, ...others]) {
    const own = lastOf(entries.filter((e) => e.hex !== null && !!s.digest && e.hex === s.digest));
    if (own) {
      if (filesMatch(own.files, s, digestCache)) out.push([s, own]);
      else s._staleAnnotation = true;
      continue;
    }
    const undated = s === skill ? lastOf(entries.filter((e) => e.hex === null)) : null;
    if (undated) out.push([s, undated]);
    else if (entries.some((e) => e.hex !== null && !sameName.some((o) => o.digest === e.hex))) s._staleAnnotation = true;
  }
  return out;
}

// Whether each file an entry lists has the digest it records in the skill's
// folder: a listed file that is missing, outside the folder or unreadable does
// not match. Only the listed files are read.
function filesMatch(files, skill, cache) {
  if (!files) return true;
  let base;
  try { base = fs.realpathSync(skill.dir); } catch { return false; }
  for (const [rel, hex] of Object.entries(files)) {
    const real = fileInside(base, path.resolve(skill.dir, ...rel.split('/')));
    if (!real) return false;
    if (!cache.has(real)) cache.set(real, digestOf(real));
    if (cache.get(real) !== hex.toLowerCase()) return false;
  }
  return true;
}

// An entry's words under a tag T are reported under exactly T. They overlay
// T's own entry where there is one; else a copy of a translation file's entry
// under the first tag in order of the same language and script [matchingTag],
// re-keyed to T; else an entry of their own under T, origin "annotation". A
// file's own entry is never changed by words for another tag, so words under
// en-US and en-GB over a SKILL.en.md give three entries: en, en-US and en-GB.
function applyTranslatedWords(skill, value, where) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) { warn(`${where}: "translations" is not a map of language tags; ignored`); return; }
  // The files' entries as they stood before any words were laid over them.
  const files = Object.fromEntries(Object.entries(skill.translations).filter(([, tr]) => tr.origin !== 'annotation').map(([t, tr]) => [t, copyEntry(tr)]));
  for (const [rawTag, words] of Object.entries(value)) {
    const wanted = canonicalTag(rawTag);
    if (!wanted) { warn(`${where}: translations key ${JSON.stringify(rawTag)} is not a language tag such as zh-CN; ignored`); continue; }
    if (!words || typeof words !== 'object' || Array.isArray(words)) { warn(`${where}: translations.${rawTag} is not an object; ignored`); continue; }
    const exact = Object.keys(skill.translations).find((t) => t.toLowerCase() === wanted.toLowerCase());
    const like = exact === undefined ? matchingTag(wanted, Object.keys(files)) : null;
    const tag = exact ?? wanted;
    const tr = exact !== undefined ? skill.translations[exact]
      : like !== null ? copyEntry(files[like])
        : { origin: 'annotation', file: null, frontmatter: null, description: null, summary: null, steps: null, stale: false, edited: false };
    let changed = false;
    if (typeof words.summary === 'string') { tr.summary = words.summary; changed = true; }
    if (words.steps !== undefined) {
      if (!Array.isArray(words.steps)) {
        warn(`${where}: translations.${rawTag}.steps is not a list; ignored`);
      } else if (words.steps.length !== skill.steps.length) {
        warn(`${where}: translations.${rawTag}.steps has ${words.steps.length} entries but the skill has ${skill.steps.length} steps; ignored`);
      } else {
        // By index; a field left out keeps the translation file's words, else the skill's own.
        tr.steps = words.steps.map((st, n) => {
          const prior = tr.steps?.[n];
          const own = skill.steps[n];
          return {
            title: typeof st?.title === 'string' ? st.title : prior?.title ?? own.title,
            excerpt: typeof st?.summary === 'string' ? st.summary : prior?.excerpt ?? own.excerpt,
          };
        });
        changed = true;
      }
    }
    if (changed) skill.translations[tag] = tr;
  }
  skill.translations = Object.fromEntries(Object.entries(skill.translations).sort(([a], [b]) => a.localeCompare(b)));
}

// A translation entry's copy, its steps' words apart from the original's.
function copyEntry(tr) {
  return { ...tr, frontmatter: tr.frontmatter ? { ...tr.frontmatter } : tr.frontmatter, steps: tr.steps ? tr.steps.map((st) => ({ ...st })) : tr.steps };
}

function addCall(atlas, skill, step, target, ref, kind, note, where) {
  if (!target) { warn(`${where}: call to ${JSON.stringify(ref)} names no installed skill; skipped`); return; }
  if (target.id === skill.id) { warn(`${where}: a skill cannot call itself; skipped`); return; }
  const fromStep = step ? step.id : null;
  // An annotation replaces the scanned edge for the same (step, target).
  atlas.edges = atlas.edges.filter((e) => !(e.from === skill.id && e.fromStep === fromStep && e.to === target.id));
  atlas.edges.push({ from: skill.id, fromStep, to: target.id, kind, source: 'annotation', evidence: { line: null, text: note ? String(note) : '' } });
}

function list(value, field, where) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { warn(`${where}: "${field}" is not a list; ignored`); return []; }
  return value;
}
