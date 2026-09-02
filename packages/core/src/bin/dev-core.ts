// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Dev harness: boot the core service for UI development.
//
//   node dist/bin/dev-core.js            # real config, real adapters
//   node dist/bin/dev-core.js --fake     # temp config, scripted captain,
//                                        # fake adapters (no credentials)
//
// Prints the WebSocket URL; the UI's default port is 8137.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CoreService, type CoreServiceOptions } from "../service.js";
import {
  DEMO_CONFIG,
  demoAdapterImports,
  demoCaptain,
  seedDemoProject,
} from "../testing/demo.js";

const args = process.argv.slice(2);
const fake = args.includes("--fake");
const portArg = args.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 8137;

async function main(): Promise<void> {
  const options: CoreServiceOptions = { port, token: process.env.SPEX_TOKEN ?? "dev" };

  if (fake) {
    const dir = mkdtempSync(join(tmpdir(), "spex-dev-"));
    const configPath = join(dir, "playbook.config.yaml");
    writeFileSync(configPath, DEMO_CONFIG);
    const projectDir = join(dir, "demo-project");
    seedDemoProject(projectDir);

    // The delays keep in-flight state watchable by a human at the
    // dev UI (DR-039 shares the narration with the browser suite,
    // which runs it near-instant).
    const { imports } = demoAdapterImports({ delayMs: 3200 });
    const captain = demoCaptain();

    options.configPath = configPath;
    options.dataDir = join(dir, "state");
    options.adapterImports = imports;
    options.adapterRuntime = () => ({ usable: true });
    options.captainFactory = async () => captain;
    options.env = {};
    options.home = dir;

    console.log(`[dev-core] fake mode; demo project: ${projectDir}`);
  }

  const service = await CoreService.start(options);
  console.log(`[dev-core] listening on ws://127.0.0.1:${service.port()}/?token=${service.token()}`);
  console.log(`[dev-core] config: ${JSON.stringify(service.configStateSnapshot().status)}`);

  process.on("SIGINT", () => {
    void service.stop().then(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
