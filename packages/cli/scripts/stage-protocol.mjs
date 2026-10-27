// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
// Only build-time compatibility constants cross the private core boundary.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function protocolConstants(source) {
  const values = {};
  for (const name of ['PROTOCOL_VERSION', 'ATTACHED_CLI_VERSION']) {
    const declarations = [...source.matchAll(new RegExp(`^\\s*export\\s+const\\s+${name}\\b[^\\n]*`, 'gm'))];
    if (declarations.length !== 1) throw new Error(`Expected one canonical ${name} declaration`);
    const match = new RegExp(`^\\s*export\\s+const\\s+${name}\\s*=\\s*([1-9][0-9]*)\\s*;\\s*$`).exec(declarations[0][0]);
    const value = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(value)) throw new Error(`Canonical ${name} must be a positive integer literal`);
    values[name] = value;
  }
  return values;
}

export function stageProtocol() {
  const source = readFileSync(new URL('../../core/src/protocol.ts', import.meta.url), 'utf8');
  const constants = protocolConstants(source);
  const output = '// SPDX-License-Identifier: Apache-2.0\n// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>\n// Generated from core/src/protocol.ts; do not edit.\n' + Object.entries(constants)
    .map(([name, value]) => `export const ${name} = ${value};\n`).join('');
  writeFileSync(new URL('../src/generated-protocol.ts', import.meta.url), output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) stageProtocol();
