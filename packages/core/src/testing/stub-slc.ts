// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A stub `slc` for compile coverage (playbook-library-17): a CommonJS
// script that emits the `<id>.playbook/` layout and the registry
// entry module beside it, the way slc >= 0.2 does, with the role ids
// verbatim from the gears — capitalized on purpose, which the entry
// preserves and the compile flow re-keys onto case-insensitively.

import { ARTIFACT_SCHEMAS } from "../config.js";

export function stubSlcSource(rolesLiteral = "['Helper']"): string {
  return `
const fs = require("node:fs");
const path = require("node:path");
const src = process.argv[3];
const base = path.basename(src, ".md");
const dir = path.join(path.dirname(src), base + ".playbook");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, base + ".fsm.ts"),
  [
    'import { setup } from "xstate";',
    "export const demoMachine = setup({}).createMachine({",
    '  id: "demo",',
    '  initial: "ready",',
    "  states: {",
    "    ready: {},",
    "    working: {},",
    "    awaitBossReply: {},",
    "    failed: {},",
    '    done: { type: "final" },',
    "  },",
    "});",
  ].join("\\n"),
);
fs.writeFileSync(
  path.join(dir, base + ".playbook.ts"),
  [
    "export default function createDemoRuntime(options: unknown) {",
    "  return {",
    "    options,",
    "    async init(session: any) { this.session = session; },",
    "    async handleBossInput() {},",
    "    async dispose() {},",
    "  } as Record<string, unknown>;",
    "}",
  ].join("\\n"),
);
// The slc entry module: emitted beside the artifact dir, role ids
// verbatim from the gears (capitalized here on purpose, which schema 2
// preserves), an options allowlist with cwd, and the schema the shared
// runtime factory checks.
fs.writeFileSync(
  path.join(path.dirname(src), base + ".ts"),
  [
    "import createPlaybookRuntime from './" + base + ".playbook/" + base + ".playbook.ts';",
    "const REQUIRED_ROLE_IDS = ${rolesLiteral};",
    "const entry = {",
    "  id: '" + base + "',",
    "  command: '" + base + "',",
    "  intent: 'Stub Demo - a one-player workflow.',",
    "  artifactSchema: ${ARTIFACT_SCHEMAS[0]},",
    "  requiredRoleIds: [...REQUIRED_ROLE_IDS],",
    "  validateOptions(value) {",
    "    if (value === undefined) return {};",
    "    if (typeof value !== 'object' || value === null || Array.isArray(value)) {",
    "      throw new Error('playbook options must be an object');",
    "    }",
    "    for (const key of Object.keys(value)) {",
    "      if (key !== 'cwd') throw new Error('unknown option \\"' + key + '\\"');",
    "    }",
    "    return value;",
    "  },",
    "  createRuntime(options) {",
    "    const validated = entry.validateOptions(options.captainOptions);",
    "    return createPlaybookRuntime({ ...validated });",
    "  },",
    "};",
    "export default entry;",
  ].join("\\n"),
);
console.log("stub slc: compiled " + base);
`;
}
