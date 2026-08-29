#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A core for the demo recording: the user's real config and real
// adapters, but its own store and its own registered project, so a
// recording never touches the app's own data.
//
//   DEMO_PROJECT=~/spex-demo node scripts/demo-core.mjs

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CoreService } from "../packages/core/dist/service.js";

const project = resolve(
  (process.env.DEMO_PROJECT ?? "~/spex-demo").replace(/^~/, process.env.HOME),
);
const dir = mkdtempSync(join(tmpdir(), "spex-demo-core-"));

const service = await CoreService.start({
  port: Number(process.env.PORT ?? 8138),
  token: process.env.SPEX_TOKEN ?? "demo",
  dataDir: join(dir, "state"),
});

console.log(`[demo-core] project: ${project}`);
console.log(`[demo-core] store: ${dir}`);
console.log(
  `[demo-core] listening on ws://127.0.0.1:${service.port()}/?token=${service.token()}`,
);
