// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The privileged lane's stubborn agent (hub-10): an agent that ignores
// SIGTERM and holds a child of its own that ignores it too, each
// logging the SIGTERM it receives. Run as
// `node lane-stubborn-agent.cjs <log> agent`; it prints its child's pid
// once that child is listening for SIGTERM.

const { spawn } = require("node:child_process");
const { appendFileSync } = require("node:fs");

const [log, role] = process.argv.slice(2);
process.on("SIGTERM", () => appendFileSync(log, `${role} ${process.pid} SIGTERM ${Date.now()}\n`));
setInterval(() => {}, 1000);
if (role === "agent") {
  const child = spawn(process.execPath, [__filename, log, "child"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  child.stdout.once("data", () => process.stdout.write(`${child.pid}\n`));
} else {
  process.stdout.write("ready\n");
}
