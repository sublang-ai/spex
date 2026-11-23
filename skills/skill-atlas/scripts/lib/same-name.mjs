// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Differing skills of one name, each told from the others by the loading
// model [loading.mjs] (data-model.md "sameName"): per agent and name it
// loads them under, the skills it may run are those no other outranks; two of
// them are a conflict for it, one of them and a skill it outranks an
// override, and two skills going by one name that no agent loads both under
// it are each another agent's copy. Each agent loading both gives its own
// relation, so one agent's conflict hides no other's override.

import { compareRanks } from './roots.mjs';

/**
 * Set `sameName` on every skill: per other differing skill of a name it goes
 * by, `{ id, relation, agents, wins }`, a conflict naming the agents that may
 * run either and an override per skill the others run over the other, or one
 * other-agent entry where no agent loads both.
 * @param {ReturnType<import('./loading.mjs').loadingModel>} model
 * @returns {{ name:string, agents:string[], copies:{ id:string, path:string, root:string }[] }[]}
 *   one per name and set of skills an agent may run under it, with the agents and the folders they load them from
 */
export function relateSameNames(model) {
  const { skills, names } = model;
  const pair = new Map(); // a -> b -> { conflict:Set, wins:Map(id -> Set), shared:boolean }
  const of = (a, b) => {
    if (!pair.has(a)) pair.set(a, new Map());
    if (!pair.get(a).has(b)) pair.get(a).set(b, { conflict: new Set(), wins: new Map() });
    return pair.get(a).get(b);
  };
  const conflicts = new Map(); // "<name>\0<places>" -> { name, agents, copies }
  for (const { agent, name, members, top } of model.groups) {
    if (members.size < 2) continue;
    const tops = new Set(top);
    for (const a of members.keys()) {
      for (const b of members.keys()) {
        if (a === b) continue;
        const rel = of(a, b);
        if (tops.has(a) && tops.has(b) && tops.size > 1) rel.conflict.add(agent);
        else if (tops.has(a) !== tops.has(b)) {
          const [win, lose] = tops.has(a) ? [a, b] : [b, a];
          // A run skill ranked alike with the other overrides nothing.
          if (compareRanks(members.get(win).rank, members.get(lose).rank) >= 0) continue;
          const w = win.id;
          if (!rel.wins.has(w)) rel.wins.set(w, new Set());
          rel.wins.get(w).add(agent);
        }
      }
    }
    if (tops.size < 2) continue;
    const copies = top.map((s) => ({ id: s.id, path: members.get(s).place.dir, root: members.get(s).place.root }));
    const key = `${name}\0${copies.map((c) => c.path).join('\0')}`;
    if (!conflicts.has(key)) conflicts.set(key, { name, agents: new Set(), copies });
    conflicts.get(key).agents.add(agent);
  }
  const byName = new Map(); // name -> the skills going by it
  for (const s of skills) for (const n of names.get(s)) { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(s); }
  for (const a of skills) {
    a.sameName = [];
    const others = [...new Set([...names.get(a)].flatMap((n) => byName.get(n)))].filter((b) => b !== a);
    for (const b of skills.filter((x) => others.includes(x))) {
      const rel = pair.get(a)?.get(b);
      if (!rel) { a.sameName.push({ id: b.id, relation: 'other-agent', agents: [], wins: null }); continue; }
      if (rel.conflict.size) a.sameName.push({ id: b.id, relation: 'conflict', agents: sorted(rel.conflict), wins: null });
      // An agent loading both under the name and running neither, or running one ranked alike with the other, leaves no entry of its own.
      a.sameName.push(...[...rel.wins].map(([wins, agents]) => ({ id: b.id, relation: 'override', agents: sorted(agents), wins }))
        .sort((x, y) => (x.agents[0] < y.agents[0] ? -1 : 1)));
    }
  }
  return [...conflicts.values()].map((c) => ({ ...c, agents: sorted(c.agents) }));
}

const sorted = (xs) => [...new Set(xs)].sort();
