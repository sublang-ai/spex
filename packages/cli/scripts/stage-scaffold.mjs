// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Stage the monorepo-root scaffold/ bundle into this package so npm
// can ship it: package.json "files" cannot reach outside the package
// directory. The staged copy is gitignored; the root folder is the
// source of truth. In a published tarball or standalone checkout the
// staged copy already exists and there is nothing to do.

import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageRoot, "..", "..", "scaffold");
const target = join(packageRoot, "scaffold");

if (!existsSync(join(source, "agent-specs.txt"))) {
  if (existsSync(join(target, "agent-specs.txt"))) {
    process.exit(0); // already staged (published package)
  }
  console.error(`scaffold bundle not found at ${source} or ${target}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
