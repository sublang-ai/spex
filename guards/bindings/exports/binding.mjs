// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The binding `exports` (DR-251): installs into a scratch project through
// the library's exportEnvironment, as built in the copy. Three packages
// each hold a spec `kit`, so all three want specs/packages/kit.md
// (environments-41). It reports what the install did and holds no
// expected outcome.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { exportEnvironment } from '../../../packages/cli/dist/lib/environment/exports.js';

const PACKAGES = ['acme/kit', 'mid/kit', 'zeta/kit'];
const MARKER = /^<!-- Placed by Spex from (\S+) \S+; an edit makes this file yours\. -->$/;

// A fresh project for one sequence: a root holding specs/, under the OS
// temp folder. The empty .git folder keeps an install from writing the
// exclude file of a repository above the temp folder.
export function start() {
  const root = mkdtempSync(join(tmpdir(), 'spex-guard-exports-'));
  mkdirSync(join(root, 'specs', 'packages'), { recursive: true });
  mkdirSync(join(root, '.git'));
  return { root };
}

// Write one package's release as installed under .spex/packages/, and
// return its entry in the lock. Release 1.0.0 provides its spec; release
// 2.0.0 keeps the spec file and provides only a skill.
function release(root, name, provides) {
  const [org, pkg] = name.split('/');
  const version = provides ? '1.0.0' : '2.0.0';
  const skill = `${org}-notes`;
  const ids = provides ? [pkg] : [pkg, skill];
  const files = {
    'meta.yaml': [
      'format: 2', `org: ${org}`, `name: ${pkg}`, `version: ${version}`,
      `description: The ${name} package`, 'license: Apache-2.0',
      ...(provides ? [] : ['provides: [skill]']),
      'artifacts:',
      ...ids.flatMap((id) => [`  ${id}:`, `    kind: ${id === pkg ? 'spec' : 'skill'}`, '    language: en']),
      '',
    ].join('\n'),
    [`specs/en/${pkg}.md`]: `# ${pkg}: ${pkg}\n\n## Intent\n\nThe ${pkg} of ${name} ${version}.\n\n## External Behavior\n\n### ${pkg}-1\n\nIt shall stand.\n`,
  };
  if (!provides) files[`skills/en/${skill}/SKILL.md`] = `---\nname: ${skill}\ndescription: Notes from ${name}\n---\n\nNotes.\n`;
  const dir = join(root, '.spex', 'packages', org, pkg);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return {
    source: { registry: 'https://spex.sublang.ai', version, checksum: '0'.repeat(64) },
    requiredBy: [],
    artifacts: Object.fromEntries(ids.map((id) => [id, { language: 'en', fallback: false }])),
    files: [],
    exports: Object.fromEntries(ids.map((id) => [id === pkg ? `${org}-${pkg}` : id, id])),
  };
}

export const events = {
  // One install: the lock holds the selected packages, each at the
  // release that provides its spec or at the one that does not.
  async install({ root }, { selected, providing }) {
    const packages = {};
    for (const name of PACKAGES) {
      rmSync(join(root, '.spex', 'packages', ...name.split('/')), { recursive: true, force: true });
      if (selected.includes(name)) packages[name] = release(root, name, providing.includes(name));
    }
    const report = await exportEnvironment({
      root,
      lock: { format: 1, requests: '0'.repeat(64), packages },
      workingFolder: root,
      userHome: null,
      agents: [],
    });
    return {
      placed: standing(root),
      blocked: report.specs.filter((spec) => spec.state === 'blocked').map((spec) => spec.name),
    };
  },
};

// Whose copy stands at specs/packages/kit.md, by its first line.
function standing(root) {
  let text;
  try {
    text = readFileSync(join(root, 'specs', 'packages', 'kit.md'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const match = MARKER.exec(text.split('\n', 1)[0]);
  if (match === null) throw new Error('specs/packages/kit.md stands with no line naming its package');
  return match[1];
}

export function stop(state) {
  if (state) rmSync(state.root, { recursive: true, force: true });
}
