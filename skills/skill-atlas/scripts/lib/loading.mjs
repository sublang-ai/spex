// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The loading model (data-model.md "sameName"): for every skill, each place it
// is loaded from, by which agent, under which name and at which rank
// [AGENTS]. How differing skills of one name stand to each other
// [same-name.mjs] and which skill a link reaches [links.mjs] are both read
// from it, so they agree.

import path from 'node:path';
import { AGENTS, rankIn, compareRanks } from './roots.mjs';

/**
 * @param {{ id:string, name:string, root:string, dir:string, copies:{ root:string, dir:string }[] }[]} skills in preference order
 * @param {Map<string, { scope:string, plugin:string|null, agents:string[] }>} roots by id
 */
export function loadingModel(skills, roots) {
  const order = new Map(skills.map((s, n) => [s, n]));
  // "<agent>\0<name>" -> Map(skill -> { place, rank }): the place of each skill
  // the agent loads under that name, the one it ranks first of the skill's own.
  const groups = new Map();
  // The same for a plugin's skill by its bare name, which it answers to only
  // where no other skill the agent loads has that name.
  const bare = new Map();
  const loaders = new Map(); // skill -> the agents loading it
  const names = new Map(); // skill -> every name it goes by: its agents' names, else its own where no agent loads it
  const put = (map, key, s, place, rank) => {
    if (!map.has(key)) map.set(key, new Map());
    const g = map.get(key);
    const prev = g.get(s);
    if (!prev || compareRanks(rank, prev.rank) < 0) g.set(s, { place, rank });
  };
  for (const s of skills) {
    loaders.set(s, new Set());
    names.set(s, new Set());
    for (const place of [{ root: s.root, dir: s.dir }, ...(s.copies ?? [])]) {
      const root = roots.get(place.root);
      if (!root) continue;
      const qualify = (n) => (root.plugin ? `${root.plugin}:${n}` : n);
      if (!root.agents.length) names.get(s).add(qualify(s.name));
      for (const agent of root.agents) {
        const own = AGENTS[agent].name === 'folder' ? path.basename(place.dir) : s.name;
        const rank = rankIn(agent, root);
        loaders.get(s).add(agent);
        names.get(s).add(qualify(own));
        put(groups, `${agent}\0${qualify(own)}`, s, place, rank);
        if (root.plugin) put(bare, `${agent}\0${own}`, s, place, rank);
      }
    }
  }
  const byOrder = (a, b) => order.get(a) - order.get(b);
  // The skills an agent may run under a name: those no other one outranks.
  const top = (g) => [...g.keys()].filter((s) => ![...g].some(([o, x]) => o !== s && compareRanks(x.rank, g.get(s).rank) < 0)).sort(byOrder);
  return {
    skills,
    loaders,
    names,
    groups: [...groups].map(([key, g]) => { const [agent, name] = key.split('\0'); return { agent, name, members: g, top: top(g) }; }),
    /** Every name a link may name a skill by. */
    linkNames() {
      const all = new Set([...bare.keys()].map((key) => key.split('\0')[1]));
      for (const set of names.values()) for (const n of set) all.add(n);
      return all;
    },
    /**
     * The skill a link from `caller` to `name` reaches: the one an agent
     * loading the caller runs under that name, the agent its first folder is
     * named for deciding, else the first by key that runs one, and of several
     * it may run the first in preference order; where none runs one, a skill
     * going by the name in one of the caller's folders, else the first going by it.
     */
    resolve(name, caller) {
      const own = roots.get(caller.root)?.agent;
      const agents = [...(loaders.get(caller) ?? [])].sort((a, b) => (a === own ? -1 : b === own ? 1 : a < b ? -1 : 1));
      for (const agent of agents) {
        const g = groups.get(`${agent}\0${name}`);
        if (g) return top(g)[0];
        const b = bare.get(`${agent}\0${name}`);
        if (b && b.size === 1) return [...b.keys()][0];
      }
      const going = skills.filter((s) => names.get(s).has(name));
      const mine = new Set([caller.root, ...(caller.copies ?? []).map((c) => c.root)]);
      return going.find((s) => [s.root, ...(s.copies ?? []).map((c) => c.root)].some((r) => mine.has(r))) ?? going[0] ?? null;
    },
  };
}
