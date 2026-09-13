// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The reveal bridge's containment rule (app-shell-28, DR-008): the
// main process shows a path in the OS file manager only when it
// resolves inside the state root the core was started with. Both
// sides resolve through their real paths, so a symlink out of the root
// is outside it, and a path that does not exist reveals nothing.

import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

/** The real path to reveal, or null when the request lies outside the
 * root or names nothing on disk. */
export function resolveRevealTarget(root: string, requested: unknown): string | null {
  if (typeof requested !== "string" || requested.trim() === "") return null;
  let realRoot: string;
  let target: string;
  try {
    realRoot = realpathSync(root);
    target = realpathSync(resolve(realRoot, requested));
  } catch {
    return null;
  }
  const inside = relative(realRoot, target);
  if (inside === "") return target;
  if (inside.startsWith("..") || isAbsolute(inside)) return null;
  return target;
}
