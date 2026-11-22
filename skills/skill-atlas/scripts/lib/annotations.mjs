// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// annotations.json: corrections a reader layers on the scan (data-model.md).
// Everything added is marked `"source": "annotation"`. A malformed file or
// entry is reported on stderr and the scan carries on without it. A name holds
// one entry or a list of them: the one recording its skill's SKILL.md digest
// applies, else one recording none; an entry recording the digest of another
// skill of that name applies to that one; where none applies and one records
// a digest no skill of the name has, that is reported as a `stale-annotation` insight.

import fs from 'node:fs';
import path from 'node:path';
import { warn } from './log.mjs';
import { tagInfo, mergeHits } from './tags.mjs';
import { canonicalTag, matchingTag } from './translations.mjs';
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
    if (!byKey.has(s.name)) byKey.set(s.name, s);
    byKey.set(s.id, s); // `<name>@<rootId>` addresses a duplicate copy
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  const resolveSkill = (ref) => (typeof ref === 'string' ? byKey.get(ref) ?? null : null);

  for (const [key, value] of Object.entries(doc.skills)) {
    const skill = byKey.get(key);
    if (!skill) { warn(`annotations: skill "${key}" is not installed; its entry is ignored`); continue; }
    // A name's entries serve every skill of that name, each the entry recording
    // its digest; a differing skill's own `<name>@<rootId>` key comes first.
    const sameName = key === skill.name ? byName.get(key) : [skill];
    const others = sameName.filter((s) => s !== skill && !Object.hasOwn(doc.skills, s.id));
    const digests = new Set(sameName.map((s) => s.digest).filter(Boolean));
    for (const [s, chosen] of entriesFor(skill, others, digests, value, `annotations for "${key}"`)) applyEntry(atlas, s, chosen, resolveSkill);
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
      // Links that were the former steps' are one per target at the skill, calls before mentions.
      for (const e of atlas.edges) if (e.from === skill.id) e.fromStep = null;
      atlas.edges = oneLinkEach(atlas.edges);
      const seen = new Set();
      atlas.unresolved = atlas.unresolved.filter((u) => {
        if (u.from !== skill.id) return true;
        u.fromStep = null;
        if (seen.has(u.name)) return false;
        seen.add(u.name);
        return true;
      });
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
    const target = resolveSkill(rm.to);
    const hits = (e) => e.from === skill.id && (!step || e.fromStep === step.id);
    atlas.edges = atlas.edges.filter((e) => !(hits(e) && (e.to === target?.id || e.to === rm.to)));
    atlas.unresolved = atlas.unresolved.filter((u) => !(hits(u) && u.name === rm.to));
  }
}

// The entries a key applies, as [skill, { ann, where }] pairs, `where` being
// the words its warnings name it by. A key holds one entry or a list of them,
// each written from another text of its skill (the state folder serves every
// project). To the key's skill applies the entry recording its digest, else
// the first recording none; to each other skill of the name (`others`), the
// entry recording its digest alone. Where none applies to the key's skill and
// an entry records a digest no skill of the name has (`digests`), its
// annotation is stale.
function entriesFor(skill, others, digests, value, where) {
  const many = Array.isArray(value);
  const entries = [];
  for (const [n, ann] of (many ? value : [value]).entries()) {
    const at = many ? `${where} (entry ${n + 1})` : where;
    if (!ann || typeof ann !== 'object' || Array.isArray(ann)) { warn(`${at}: the entry is not an object; ignored`); continue; }
    if (ann.source === undefined || ann.source === null) { entries.push({ ann, where: at, hex: null }); continue; }
    const hex = ann.source?.sha256;
    if (typeof ann.source !== 'object' || typeof hex !== 'string') { warn(`${at}: "source" is not { "sha256": "<64 hex>" }; entry not applied`); continue; }
    entries.push({ ann, where: at, hex: hex.toLowerCase() });
  }
  const recording = (s) => (s.digest ? entries.find((e) => e.hex === s.digest) : undefined);
  const out = [];
  const own = recording(skill) ?? entries.find((e) => e.hex === null);
  if (own) out.push([skill, own]);
  else if (entries.some((e) => e.hex !== null && !digests.has(e.hex))) skill._staleAnnotation = true;
  for (const s of others) {
    const e = recording(s);
    if (e) out.push([s, e]);
  }
  return out;
}

// An entry's words under a tag land in the skill's translation of exactly that
// tag, else in a translation file's under a tag of the same language and
// script, else in an entry of their own under the tag, origin "annotation".
// So words under two tags of one language, given by annotations alone, stay apart.
function applyTranslatedWords(skill, value, where) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) { warn(`${where}: "translations" is not a map of language tags; ignored`); return; }
  for (const [rawTag, words] of Object.entries(value)) {
    const wanted = canonicalTag(rawTag);
    if (!wanted) { warn(`${where}: translations key ${JSON.stringify(rawTag)} is not a language tag such as zh-CN; ignored`); continue; }
    if (!words || typeof words !== 'object' || Array.isArray(words)) { warn(`${where}: translations.${rawTag} is not an object; ignored`); continue; }
    // Words under zh-CN join a SKILL.zh.md translation: the page shows one translation per language and script.
    const tags = Object.keys(skill.translations);
    const tag = tags.find((t) => t.toLowerCase() === wanted.toLowerCase())
      ?? matchingTag(wanted, tags.filter((t) => skill.translations[t].origin !== 'annotation'))
      ?? wanted;
    const tr = skill.translations[tag] ?? { origin: 'annotation', file: null, frontmatter: null, description: null, summary: null, steps: null, stale: false, edited: false };
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
