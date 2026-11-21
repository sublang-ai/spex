// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The files bundled with a skill, classified for the viewer.

import fs from 'node:fs';
import path from 'node:path';

export const FILES_MAX = 200; // data-model.md: at most 200 bundled files per skill
const DIRS_MAX = 2000; // stop walking a pathological tree after this many folders
const SKIP = new Set(['node_modules', '__pycache__']);

const KIND_BY_DIR = {
  references: 'reference', reference: 'reference', docs: 'reference', doc: 'reference', examples: 'reference',
  scripts: 'script', script: 'script', bin: 'script', tools: 'script',
  assets: 'asset', asset: 'asset', templates: 'asset', template: 'asset', static: 'asset', images: 'asset', fonts: 'asset',
};
const KIND_BY_EXT = {
  '.md': 'reference', '.mdx': 'reference', '.txt': 'reference', '.rst': 'reference', '.adoc': 'reference',
  '.py': 'script', '.sh': 'script', '.bash': 'script', '.zsh': 'script', '.mjs': 'script', '.cjs': 'script', '.js': 'script',
  '.ts': 'script', '.rb': 'script', '.ps1': 'script', '.pl': 'script', '.go': 'script',
  '.png': 'asset', '.jpg': 'asset', '.jpeg': 'asset', '.gif': 'asset', '.svg': 'asset', '.webp': 'asset', '.ico': 'asset',
  '.html': 'asset', '.css': 'asset', '.woff': 'asset', '.woff2': 'asset', '.ttf': 'asset', '.pdf': 'asset',
};

/**
 * @param {string} dir the skill folder
 * @param {string} skillText SKILL.md text, to tell which files it mentions
 * @returns {{ path:string, kind:string, linked:boolean }[]}
 */
export function bundledFiles(dir, skillText) {
  const out = [];
  const seen = new Set();
  let dirs = 0;
  let base;
  try { base = fs.realpathSync(dir); } catch { return out; }
  // A link leading out of the skill folder is not one of its files (the server refuses those too).
  const inside = (real) => {
    const rel = path.relative(base, real);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  const walk = (abs, rel) => {
    if (out.length >= FILES_MAX || dirs >= DIRS_MAX) return;
    dirs++;
    let real;
    try { real = fs.realpathSync(abs); } catch { return; }
    if (seen.has(real)) return; // a symlink loop
    seen.add(real);
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= FILES_MAX) return;
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      let stat;
      try {
        if (!inside(fs.realpathSync(childAbs))) continue;
        stat = fs.statSync(childAbs);
      } catch { continue; }
      if (stat.isDirectory()) { walk(childAbs, childRel); continue; }
      if (!stat.isFile() || childRel === 'SKILL.md') continue;
      out.push({ path: childRel, kind: kindOf(childRel), linked: skillText.includes(childRel) });
    }
  };
  walk(dir, '');
  return out;
}

function kindOf(rel) {
  const top = rel.includes('/') ? rel.split('/')[0].toLowerCase() : null;
  if (top && KIND_BY_DIR[top]) return KIND_BY_DIR[top];
  return KIND_BY_EXT[path.extname(rel).toLowerCase()] ?? 'other';
}
