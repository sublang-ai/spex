#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Stage the Academy example corpus (DR-015): the repo-root demo/ dir
// is the single source of truth; this copy is gitignored and refreshed
// at build/test so the core assets never drift from it.

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "..", "demo");
const target = join(here, "..", "assets", "academy");

rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`staged academy corpus -> ${target}`);
