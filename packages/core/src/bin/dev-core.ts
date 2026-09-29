// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Dev harness: boot the core service for UI development.
//
//   node dist/bin/dev-core.js            # real config, real adapters
//   node dist/bin/dev-core.js --fake     # temp config, scripted captain,
//                                        # fake adapters (no credentials)
//
// Prints the WebSocket URL; the UI's default port is 8137.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  // The fake mode's scratch home, removed when the core stops.
  let scratch: string | undefined;

  const removeScratch = (): void => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  };

  if (fake) {
    const dir = mkdtempSync(join(tmpdir(), "spex-dev-"));
    scratch = dir;
    try {
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
    } catch (error) {
      // A failed seed leaves no scratch home behind either.
      removeScratch();
      throw error;
    }
  }

  let service: CoreService;
  try {
    service = await CoreService.start(options);
  } catch (error) {
    removeScratch();
    throw error;
  }
  console.log(`[dev-core] listening on ws://127.0.0.1:${service.port()}/?token=${service.token()}`);
  console.log(`[dev-core] config: ${JSON.stringify(service.configStateSnapshot().status)}`);

  // Ctrl-C and a plain `kill` both stop the core and remove the fake
  // mode's scratch home; a second signal while stopping changes nothing.
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void service
      .stop()
      .finally(removeScratch)
      .then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(error);
          process.exit(1);
        },
      );
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
