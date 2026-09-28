#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A core for the demo recording: the user's real config and real
// adapters, but its own store and its own registered project, so a
// recording never touches the app's own data.
//
//   DEMO_PROJECT=~/spex-demo node scripts/demo-core.mjs

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CoreService } from "../packages/core/dist/service.js";

const project = resolve(
  (process.env.DEMO_PROJECT ?? "~/spex-demo").replace(/^~/, process.env.HOME),
);
// The store lives only as long as this core: nothing reads it after a
// recording, so stopping the core removes it.
const dir = mkdtempSync(join(tmpdir(), "spex-demo-core-"));
const removeStore = () => rmSync(dir, { recursive: true, force: true });

let service;
try {
  service = await CoreService.start({
    port: Number(process.env.PORT ?? 8138),
    token: process.env.SPEX_TOKEN ?? "demo",
    dataDir: join(dir, "state"),
  });
} catch (error) {
  removeStore();
  throw error;
}

// Ctrl-C in the foreground or `kill %1` after `&` both stop the core
// and remove its store; a second signal while stopping changes nothing.
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  void service
    .stop()
    .finally(removeStore)
    .then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log(`[demo-core] project: ${project}`);
console.log(`[demo-core] store: ${dir}`);
console.log(
  `[demo-core] listening on ws://127.0.0.1:${service.port()}/?token=${service.token()}`,
);
