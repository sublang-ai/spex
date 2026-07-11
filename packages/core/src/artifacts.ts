// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pipeline artifacts (PBLIB-24): locate a playbook's Source, Gears,
// and FSM next to its registry module, covering both the compiled
// library layout and the published-package layout, and derive the
// FSM's state list for display.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveModulePath } from "./config.js";
import { listFsmStates } from "./compile.js";
import type { PlaybookArtifacts } from "./protocol.js";

function firstExisting(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(candidate));
}

function readOrNull(path: string | undefined): string | null {
  return path ? readFileSync(path, "utf8") : null;
}

/**
 * Layouts covered:
 * - compiled library dir: `<dir>/<id>.md`,
 *   `<dir>/<id>.playbook/<id>.gears.md`, `<dir>/<id>.playbook/<id>.fsm.ts`
 *   (registry module lives in `<dir>`)
 * - published package: registry beside `<id>.gears.md` / `<id>.fsm.ts`,
 *   with the source one directory up (`../<id>.md`)
 */
export async function resolveArtifacts(
  playbook: { id: string; from: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<PlaybookArtifacts> {
  const modulePath = resolveModulePath(playbook.from, env);
  if (!modulePath || !existsSync(modulePath)) {
    return {
      source: null,
      gears: null,
      fsm: null,
      stateIds: null,
      missing: ["source", "gears", "fsm"],
    };
  }
  const dir = dirname(modulePath);
  const id = playbook.id;

  const sourcePath = firstExisting([
    join(dir, `${id}.md`),
    join(dir, "..", `${id}.md`),
  ]);
  const gearsPath = firstExisting([
    join(dir, `${id}.playbook`, `${id}.gears.md`),
    join(dir, `${id}.gears.md`),
  ]);
  const fsmPath = firstExisting([
    join(dir, `${id}.playbook`, `${id}.fsm.ts`),
    join(dir, `${id}.fsm.ts`),
  ]);

  const missing: string[] = [];
  if (!sourcePath) missing.push("source");
  if (!gearsPath) missing.push("gears");
  if (!fsmPath) missing.push("fsm");

  return {
    source: readOrNull(sourcePath),
    gears: readOrNull(gearsPath),
    fsm: readOrNull(fsmPath),
    stateIds: fsmPath ? await listFsmStates(fsmPath) : null,
    missing,
  };
}
