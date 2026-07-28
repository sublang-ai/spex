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
 * Display hygiene (DR-015): served markdown drops leading HTML
 * comment blocks — SPDX and vendoring provenance headers are
 * maintainer-facing and render as literal text in the app.
 */
export function stripLeadingComments(markdown: string): string {
  let rest = markdown;
  for (;;) {
    const trimmed = rest.replace(/^\s+/, "");
    if (!trimmed.startsWith("<!--")) return trimmed;
    const end = trimmed.indexOf("-->");
    if (end === -1) return trimmed;
    rest = trimmed.slice(end + 3);
  }
}

/**
 * Resolve a built-in playbook's source from the installed package
 * (DR-019): playbook 3.1 ships reference/sdlc/<id>.md beside the
 * compiled <id>.playbook directory, so the registry module's parent
 * directory carries the prose source.
 */
export function packagedSourcePath(
  id: string,
  from: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const modulePath = resolveModulePath(from, env);
  if (!modulePath || !existsSync(modulePath)) return undefined;
  const candidate = join(dirname(modulePath), "..", `${id}.md`);
  return existsSync(candidate) ? candidate : undefined;
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

  const source = readOrNull(sourcePath);
  const gears = readOrNull(gearsPath);
  return {
    source: source === null ? null : stripLeadingComments(source),
    gears: gears === null ? null : stripLeadingComments(gears),
    fsm: readOrNull(fsmPath),
    stateIds: fsmPath ? await listFsmStates(fsmPath) : null,
    missing,
  };
}
