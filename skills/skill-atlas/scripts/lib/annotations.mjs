// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// annotations.json: corrections a reader layers on the scan (data-model.md).
// Everything added is marked `"source": "annotation"`. A malformed file or
// entry is reported on stderr and the scan carries on without it.

import fs from 'node:fs';
import path from 'node:path';
import { warn } from './log.mjs';
import { tagInfo, mergeHits } from './tags.mjs';
import { canonicalTag } from './translations.mjs';

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
  for (const s of atlas.skills) {
    if (!byKey.has(s.name)) byKey.set(s.name, s);
    byKey.set(s.id, s); // `<name>@<rootId>` addresses a duplicate copy
  }
  const resolveSkill = (ref) => (typeof ref === 'string' ? byKey.get(ref) ?? null : null);

  for (const [key, ann] of Object.entries(doc.skills)) {
    const skill = byKey.get(key);
    if (!skill) { warn(`annotations: skill "${key}" is not installed; its entry is ignored`); continue; }
    if (!ann || typeof ann !== 'object') { warn(`annotations: entry for "${key}" is not an object; ignored`); continue; }
    const where = `annotations for "${key}"`;
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
        for (const e of atlas.edges) if (e.from === skill.id) e.fromStep = null;
        for (const u of atlas.unresolved) if (u.from === skill.id) u.fromStep = null;
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
}

// An entry's words per language land in the skill's translation of that
// language, created with origin "annotation" where no file gives one.
function applyTranslatedWords(skill, value, where) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) { warn(`${where}: "translations" is not a map of language tags; ignored`); return; }
  for (const [rawTag, words] of Object.entries(value)) {
    const tag = canonicalTag(rawTag);
    if (!tag) { warn(`${where}: translations key ${JSON.stringify(rawTag)} is not a language tag such as zh-CN; ignored`); continue; }
    if (!words || typeof words !== 'object' || Array.isArray(words)) { warn(`${where}: translations.${rawTag} is not an object; ignored`); continue; }
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
