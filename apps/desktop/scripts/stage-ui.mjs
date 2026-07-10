#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Stage the built UI into the desktop app so packaging is
// self-contained. Builds the UI first if its dist is missing.

import { cpSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const uiDir = resolve(appDir, "..", "..", "packages", "ui");
const uiDist = join(uiDir, "dist");

if (!existsSync(join(uiDist, "index.html"))) {
  execSync("npm run build", { cwd: uiDir, stdio: "inherit" });
}

const target = join(appDir, "ui-dist");
rmSync(target, { recursive: true, force: true });
cpSync(uiDist, target, { recursive: true });
console.log(`[stage-ui] copied ${uiDist} -> ${target}`);
