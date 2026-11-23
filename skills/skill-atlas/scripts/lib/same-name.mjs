// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Differing skills of one name, each told from the others by the folders the
// agents load them from (data-model.md "sameName"): a conflict where an agent
// loads both with no precedence between their folders, an override where it
// has one, and another agent's copy where no agent loads both. A plugin's
// skills are named by their plugin, so they share a name only with skills of
// the same plugin.

import { AGENT_PRECEDENCE } from './roots.mjs';

// Where an agent loads both of two folders, the one it loads the name from
// ranks first [AGENT_PRECEDENCE]; two that rank alike are a conflict for it.
// Depth is a project folder's below the repository's root: the nearer, deeper.
const SCOPE_RANK = { project: 0, user: 1, plugin: 2, extra: 3 };
function rank(info, agent) {
  const depth = info.scope === 'project' ? info.depth ?? 0 : 0;
  const order = AGENT_PRECEDENCE[agent];
  if (order === 'none') return [0, 0, 0];
  if (order === 'home-first') return [info.scope === 'user' ? 0 : info.scope === 'project' ? 1 : 2, depth, 0];
  return [SCOPE_RANK[info.scope] ?? 3, -depth, order === 'shared-first' && info.agent !== 'universal' ? 1 : 0];
}
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Set `sameName` on every skill: one entry per other differing skill of its
 * name, `{ id, relation, agents, wins }`, or, where the agents loading both
 * differ in the one they load, one per skill they load.
 * @param {{ id:string, name:string, root:string, dir:string, copies:{ root:string, dir:string }[] }[]} skills in preference order
 * @param {Map<string, { scope:string, depth?:number, agents:string[], plugin:string|null }>} roots by id
 * @returns {Map<string, { agents:Set<string>, copies:Map<string, { id:string, path:string, root:string }> }>}
 *   per name holding a conflict, the agents that may load either copy and the folders they load them from
 */
export function relateSameNames(skills, roots) {
  const byName = new Map();
  for (const s of skills) {
    s.sameName = [];
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  const conflicts = new Map();
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const loads = new Map(group.map((s) => [s, loadedFrom(s, roots)]));
    for (const a of group) {
      for (const b of group) {
        if (a === b) continue;
        for (const rel of relate(loads.get(a), loads.get(b))) {
          a.sameName.push({ id: b.id, relation: rel.relation, agents: rel.agents, wins: rel.wins });
          if (rel.relation !== 'conflict') continue;
          if (!conflicts.has(name)) conflicts.set(name, { agents: new Set(), copies: new Map() });
          const c = conflicts.get(name);
          for (const agent of rel.agents) c.agents.add(agent);
          for (const [s, p] of rel.places) c.copies.set(`${s.id}\0${p.dir}`, { id: s.id, path: p.dir, root: p.root });
        }
      }
    }
  }
  return conflicts;
}

// The folder each agent loads a skill from, per plugin (`''` for none): of
// its folders, copies included, the one that agent prefers.
function loadedFrom(s, roots) {
  const best = new Map(); // "<plugin>\0<agent>" -> { place, rank, agent, space }
  const spaces = new Set();
  for (const place of [{ root: s.root, dir: s.dir }, ...(s.copies ?? [])]) {
    const info = roots.get(place.root);
    if (!info) continue;
    const space = info.plugin ?? '';
    spaces.add(space);
    for (const agent of info.agents) {
      const key = `${space}\0${agent}`;
      const r = rank(info, agent);
      if (!best.has(key) || compare(r, best.get(key).rank) < 0) best.set(key, { place, rank: r, agent, space });
    }
  }
  return { skill: s, best, spaces };
}

// How skill A stands to skill B: none where no agent could see both under one
// name; another agent's copy where no agent loads both, so no agent loads it
// with A; a conflict where one loading both ranks their folders alike; else an
// override per skill loaded, naming the agents loading it.
function relate(la, lb) {
  const b = lb.skill;
  if (![...la.spaces].some((x) => lb.spaces.has(x))) return [];
  const shared = [...la.best.keys()].filter((k) => lb.best.has(k));
  if (!shared.length) return [{ relation: 'other-agent', agents: [], wins: null }];
  const tied = [];
  const won = new Map(); // winner id -> agents
  for (const key of shared) {
    const pa = la.best.get(key);
    const pb = lb.best.get(key);
    const c = compare(pa.rank, pb.rank);
    if (!c) { tied.push([pa, pb]); continue; }
    const winner = c < 0 ? la.skill.id : b.id;
    won.set(winner, [...(won.get(winner) ?? []), pa.agent]);
  }
  if (tied.length) {
    const places = tied.flatMap(([pa, pb]) => [[la.skill, pa.place], [b, pb.place]]);
    return [{ relation: 'conflict', agents: sorted(tied.map(([pa]) => pa.agent)), wins: null, places }];
  }
  return [...won].map(([wins, agents]) => ({ relation: 'override', agents: sorted(agents), wins }))
    .sort((x, y) => (x.agents[0] < y.agents[0] ? -1 : 1));
}

const sorted = (xs) => [...new Set(xs)].sort();
