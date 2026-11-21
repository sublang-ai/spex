// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The files bundled with a skill, classified for the viewer, and the
// translations among them, which are no files of the skill's own.

import path from 'node:path';
import { listFiles, sourceRelOf } from './translations.mjs';

export const FILES_MAX = 200; // data-model.md: at most 200 bundled files per skill

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
 * @returns {{ files: { path:string, kind:string, linked:boolean, translations:string[] }[],
 *   translations: { rel:string, sourceRel:string, tag:string, abs:string, origin:'skill' }[] }}
 *   a file beside its source named with a language tag is a translation, not a file;
 *   `files[].translations` is filled in by the scan, which also reads the state folder.
 */
export function bundledFiles(dir, skillText) {
  const all = listFiles(dir);
  const present = new Set(all);
  const files = [];
  const translations = [];
  for (const rel of all) {
    const src = sourceRelOf(rel);
    if (src && present.has(src.sourceRel)) {
      translations.push({ rel, sourceRel: src.sourceRel, tag: src.tag, abs: path.join(dir, ...rel.split('/')), origin: 'skill' });
      continue;
    }
    if (rel === 'SKILL.md' || files.length >= FILES_MAX) continue;
    files.push({ path: rel, kind: kindOf(rel), linked: skillText.includes(rel), translations: [] });
  }
  return { files, translations };
}

function kindOf(rel) {
  const top = rel.includes('/') ? rel.split('/')[0].toLowerCase() : null;
  if (top && KIND_BY_DIR[top]) return KIND_BY_DIR[top];
  return KIND_BY_EXT[path.extname(rel).toLowerCase()] ?? 'other';
}
