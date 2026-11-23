// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A short plain-text digest of an atlas, for an agent to read.

import { AGENT_LABELS } from './roots.mjs';

const TOP_LINKED = 10; // the digest names the ten most-linked skills

export function summarize(atlas) {
  const out = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const byId = new Map(atlas.skills.map((s) => [s.id, s]));
  const named = (id) => {
    const n = byId.get(id)?.copies?.length ?? 0;
    return n ? `${id} (also installed in ${plural(n, 'other folder')})` : id;
  };

  const copyCount = atlas.skills.reduce((n, s) => n + (s.copies?.length ?? 0), 0);
  const calls = atlas.edges.filter((e) => e.kind === 'calls').length;
  const mentions = atlas.edges.length - calls;
  const copyNote = copyCount ? ` (plus ${copyCount} ${copyCount === 1 ? 'copy' : 'copies'} in other folders)` : '';
  // An unresolved name a skill only mentions runs nothing, so calls and mentions are told apart.
  const unresolvedCalls = atlas.unresolved.filter((u) => u.kind === 'calls').length;
  const unresolvedNote = `${unresolvedCalls} ${unresolvedCalls === 1 ? 'call' : 'calls'} and ${atlas.unresolved.length - unresolvedCalls} ${atlas.unresolved.length - unresolvedCalls === 1 ? 'mention' : 'mentions'}`;
  out.push(`Skill Atlas: ${plural(atlas.skills.length, 'skill')}${copyNote} in ${plural(atlas.roots.length, 'folder')}; ${calls} calls, ${mentions} mentions, ${atlas.unresolved.length} unresolved (${unresolvedNote}).`);
  out.push(`Project: ${atlas.cwd}`);
  const problems = atlas.insights.filter((i) => i.level === 'problem').length;
  out.push(`Insights: ${plural(problems, 'problem')} to act on, ${plural(atlas.insights.length - problems, 'note')}.`);

  out.push('', 'Folders (skills present, copies included):');
  if (!atlas.roots.length) out.push('  (none found; pass --root <dir> to name a skill folder)');
  const idWidth = Math.max(0, ...atlas.roots.map((r) => r.id.length));
  for (const r of atlas.roots) out.push(`  ${r.id.padEnd(idWidth)}  ${String(r.skillCount).padStart(3)}  ${r.path}`);

  const degree = new Map(atlas.skills.map((s) => [s.id, { out: new Map(), in: new Map() }]));
  for (const e of atlas.edges) {
    degree.get(e.from)?.out.set(e.to, strongest(degree.get(e.from).out.get(e.to), e.kind));
    degree.get(e.to)?.in.set(e.from, strongest(degree.get(e.to).in.get(e.from), e.kind));
  }
  const ranked = [...degree.entries()]
    .map(([id, d]) => ({ id, d, n: d.out.size + d.in.size }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
    .slice(0, TOP_LINKED);
  out.push('', 'Most linked:');
  if (!ranked.length) out.push('  (no links between skills)');
  for (const { id, d } of ranked) {
    const parts = [];
    const pick = (m, kind) => [...m].filter(([, k]) => k === kind).map(([x]) => x).sort();
    const c = pick(d.out, 'calls'); if (c.length) parts.push(`calls ${c.join(', ')}`);
    const mo = pick(d.out, 'mentions'); if (mo.length) parts.push(`mentions ${mo.join(', ')}`);
    const ci = pick(d.in, 'calls'); if (ci.length) parts.push(`called by ${ci.join(', ')}`);
    const mi = pick(d.in, 'mentions'); if (mi.length) parts.push(`mentioned by ${mi.join(', ')}`);
    out.push(`  ${id}: ${parts.join('; ')}`);
  }

  out.push('', `Unresolved links (${atlas.unresolved.length}: ${unresolvedNote}):`);
  if (!atlas.unresolved.length) out.push('  (none)');
  for (const u of atlas.unresolved) {
    const step = u.fromStep ? ` step ${u.fromStep.split('#').pop()}` : '';
    out.push(`  ${u.from}${step} ${u.kind} ${u.name} (line ${u.evidence.line ?? '?'}: ${u.evidence.text})`);
  }

  const kinds = (k) => atlas.insights.filter((i) => i.kind === k);
  // Only a conflict is a problem; an override or another agent's copy is as intended.
  const conflicts = kinds('duplicate-name');
  out.push('', `Name conflicts (${conflicts.length}):`);
  if (!conflicts.length) out.push('  (none)');
  for (const i of conflicts) {
    out.push(`  ${i.params.name}: ${i.params.agents.map((a) => AGENT_LABELS[a] ?? a).join(', ')} may load either of ${i.params.copies.map((c) => `${c.id} [${c.root}] ${c.path}`).join(', ')}`);
  }

  const cycles = kinds('cycle');
  out.push('', `Cycles (${cycles.length}):`);
  if (!cycles.length) out.push('  (none)');
  for (const i of cycles) {
    const p = i.params.path;
    out.push(i.skills.length > p.length
      ? `  ${i.skills.join(', ')}: for example ${[...p, p[0]].join(' -> ')}`
      : `  ${[...p, p[0]].join(' -> ')}`);
  }

  const none = atlas.skills.filter((s) => s.stepKind === 'none');
  const section = atlas.skills.filter((s) => s.stepKind === 'section');
  out.push('', 'Candidates for a deeper read (steps not detected from numbered steps):');
  out.push(`  no steps (${none.length}): ${none.map((s) => `${s.id} (${s.lines} lines)`).join(', ') || '(none)'}`);
  out.push(`  sections only (${section.length}): ${section.map((s) => s.id).join(', ') || '(none)'}`);

  const shared = atlas.skills.filter((s) => s.copies?.length);
  if (shared.length) {
    out.push('', `Installed in several folders (${shared.length}):`);
    for (const s of shared) out.push(`  ${named(s.id)}: ${[s.root, ...s.copies.map((c) => c.root)].join(', ')}`);
  }

  // The insights' levels as the page shows them [insights.mjs levelOf]; each one not listed
  // above under its own heading, an unresolved link or a skill with no steps, is listed here.
  const listed = new Set(['duplicate-name', 'cycle', 'unresolved-link', 'no-steps']);
  for (const [level, heading] of [['problem', 'Other problems'], ['note', 'Other notes']]) {
    const rest = atlas.insights.filter((i) => i.level === level && !listed.has(i.kind));
    if (!rest.length) continue;
    out.push('', `${heading} (${rest.length}):`);
    for (const i of rest) out.push(`  ${i.kind}: ${i.message}`);
  }
  return out.join('\n') + '\n';
}

function strongest(prev, kind) { return prev === 'calls' || kind === 'calls' ? 'calls' : 'mentions'; }
