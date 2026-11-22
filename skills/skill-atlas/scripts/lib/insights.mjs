// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Insights over the whole atlas (data-model.md), plus `invalid-frontmatter`
// for a SKILL.md whose frontmatter could not be read. Each carries `params`,
// the values its English message is built from, for the page to phrase.

import path from 'node:path';

export const OVERSIZED_LINES = 500; // data-model.md: a SKILL.md over 500 lines is oversized
const KIND_ORDER = ['invalid-frontmatter', 'duplicate-name', 'unresolved-link', 'cycle', 'oversized', 'missing-description', 'name-mismatch', 'no-steps', 'stale-translation', 'edited-translation', 'translation-steps'];

export function findInsights({ skills, edges, unresolved, roots }) {
  const out = [];
  const rootLabel = new Map(roots.map((r) => [r.id, r.label]));

  for (const s of skills) {
    if (s._fmError) out.push({ kind: 'invalid-frontmatter', skills: [s.id], params: {}, message: `${s.id}: ${s._fmError}; the folder name is used as its name` });
  }

  const byName = new Map();
  for (const s of skills) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  for (const [name, copies] of byName) {
    if (copies.length < 2) continue;
    const where = copies.map((c) => `${rootLabel.get(c.root) ?? c.root} (${c.dir})`).join('; ');
    out.push({
      kind: 'duplicate-name',
      skills: copies.map((c) => c.id),
      params: { name },
      message: `"${name}" is defined differently in ${copies.length} folders: ${where}. An agent loading several of these folders sees only one of them.`,
    });
  }

  const seenUnresolved = new Set();
  for (const u of unresolved) {
    const key = `${u.from}\0${u.name}`;
    if (seenUnresolved.has(key)) continue;
    seenUnresolved.add(key);
    out.push({ kind: 'unresolved-link', skills: [u.from], params: { name: u.name, from: u.from }, message: `${u.from} links to "${u.name}", which is not installed (line ${u.evidence.line ?? '?'})` });
  }

  for (const { members, path: cycle } of callCycles(skills, edges)) {
    out.push({
      kind: 'cycle',
      skills: [...members],
      params: { path: [...cycle] },
      message: `${members.join(', ')} call one another in a cycle, for example ${[...cycle, cycle[0]].join(' \u2192 ')}`,
    });
  }

  for (const s of skills) {
    if (s.lines > OVERSIZED_LINES) out.push({ kind: 'oversized', skills: [s.id], params: { lines: s.lines }, message: `${s.id}: SKILL.md has ${s.lines} lines (over ${OVERSIZED_LINES}); consider moving detail into reference files` });
  }
  for (const s of skills) {
    if (!s.description.trim()) out.push({ kind: 'missing-description', skills: [s.id], params: {}, message: `${s.id} has no description, so an agent cannot tell when to use it` });
  }
  for (const s of skills) {
    const declared = s.frontmatter?.name;
    const folder = path.basename(s.dir);
    if (!s._fmError && declared !== undefined && declared !== null && String(declared).trim() && String(declared).trim() !== folder) {
      out.push({ kind: 'name-mismatch', skills: [s.id], params: { name: String(declared).trim(), folder }, message: `${s.id}: frontmatter name "${String(declared).trim()}" differs from its folder "${folder}"` });
    }
  }
  for (const s of skills) {
    if (!s.steps.length) out.push({ kind: 'no-steps', skills: [s.id], params: {}, message: `${s.id}: no steps detected; read it to annotate its steps if it matters` });
  }
  for (const s of skills) {
    for (const lang of [...(s._staleByLang?.keys() ?? [])].sort()) {
      const files = [...s._staleByLang.get(lang)].sort();
      out.push({ kind: 'stale-translation', skills: [s.id], params: { lang, files }, message: `${s.id}: the ${lang} translation ${files.join(', ')} is behind its source; translate the change and run node <skill-dir>/scripts/atlas.mjs pin --state <state>` });
    }
  }
  for (const s of skills) {
    for (const lang of [...(s._editedByLang?.keys() ?? [])].sort()) {
      const files = [...s._editedByLang.get(lang)].sort();
      out.push({ kind: 'edited-translation', skills: [s.id], params: { lang, files }, message: `${s.id}: the ${lang} translation ${files.join(', ')} was edited apart from its source, which agents follow; carry the edit across and run node <skill-dir>/scripts/atlas.mjs pin --state <state>` });
    }
  }
  for (const s of skills) {
    for (const lang of [...(s._translationSteps?.keys() ?? [])].sort()) {
      const { steps, expected } = s._translationSteps.get(lang);
      out.push({ kind: 'translation-steps', skills: [s.id], params: { lang, steps, expected }, message: `${s.id}: the ${lang} translation of SKILL.md has ${steps} steps where the skill has ${expected}, so its steps are not shown` });
    }
  }
  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/**
 * Each strongly connected group of skills joined by `calls` edges (Tarjan's
 * algorithm, iterative so deep graphs cannot overflow), with one shortest
 * cycle through it as an example.
 * @returns {{ members:string[], path:string[] }[]} members in scan order; path as skill ids in call order
 */
export function callCycles(skills, edges) {
  const adj = new Map(skills.map((s) => [s.id, []]));
  for (const e of edges) {
    if (e.kind !== 'calls' || e.from === e.to || !adj.has(e.from) || !adj.has(e.to)) continue;
    if (!adj.get(e.from).includes(e.to)) adj.get(e.from).push(e.to);
  }
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  for (const start of adj.keys()) {
    if (index.has(start)) continue;
    const work = [{ v: start, i: 0 }];
    index.set(start, counter); low.set(start, counter); counter++;
    stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const next = adj.get(frame.v);
      if (frame.i < next.length) {
        const w = next[frame.i++];
        if (!index.has(w)) {
          index.set(w, counter); low.set(w, counter); counter++;
          stack.push(w); onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v), index.get(w)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent), low.get(frame.v)));
      }
      if (low.get(frame.v) === index.get(frame.v)) {
        const comp = [];
        let w;
        do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== frame.v);
        if (comp.length > 1) components.push(comp);
      }
    }
  }
  const order = new Map(skills.map((s, n) => [s.id, n]));
  return components.map((comp) => ({ members: [...comp].sort((a, b) => order.get(a) - order.get(b)), path: cycleIn(comp, adj) }));
}

// A shortest cycle through the component's first skill (breadth-first).
function cycleIn(comp, adj) {
  const members = new Set(comp);
  const start = [...comp].sort()[0];
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const v = queue.shift();
    for (const w of adj.get(v)) {
      if (!members.has(w)) continue;
      if (w === start) {
        const path = [];
        for (let x = v; x !== null; x = prev.get(x)) path.unshift(x);
        return path;
      }
      if (!prev.has(w)) { prev.set(w, v); queue.push(w); }
    }
  }
  return [...comp];
}
