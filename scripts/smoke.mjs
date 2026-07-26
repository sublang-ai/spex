#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pre-release smoke suite (RELEASE-20, docs/release-smoke.md): the
// automated stages a release candidate must pass before tagging.
// Fail-fast; each stage names itself so a failure is actionable.
// `--desktop` adds the Electron render stage (flips the native ABI
// to Electron and back — do not run it mid-development).

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const desktop = process.argv.includes("--desktop");
let stage = "";

function run(name, command, args, options = {}) {
  stage = name;
  process.stdout.write(`\n=== smoke: ${name} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`stage "${name}" failed (${command} ${args.join(" ")})`);
  }
}

async function coreRoundTrip() {
  stage = "core-round-trip";
  process.stdout.write(`\n=== smoke: core-round-trip ===\n`);
  const { CoreService } = await import(
    pathToFileURL(join(root, "packages/core/dist/service.js")).href
  );
  const { WebSocket } = await import("ws");
  const home = mkdtempSync(join(tmpdir(), "spex-smoke-"));
  const service = await CoreService.start({
    token: "smoke",
    configPath: join(home, "playbook.config.yaml"),
    dbPath: ":memory:",
    env: {},
    home,
    watchConfig: false,
  });
  const socket = new WebSocket(
    `ws://127.0.0.1:${service.port()}/?token=smoke`,
  );
  const replies = new Map();
  let seq = 0;
  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    if (message.type === "reply") replies.get(message.id)?.(message);
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const command = (type, fields = {}) =>
    new Promise((resolve, reject) => {
      const id = `s${(seq += 1)}`;
      replies.set(id, (reply) =>
        reply.ok
          ? resolve(reply.result)
          : reject(new Error(`${type}: ${reply.error.message}`)),
      );
      socket.send(JSON.stringify({ type, id, ...fields }));
    });

  const config = await command("config.get");
  if (config.status !== "valid") {
    throw new Error(`seeded template did not compose: ${config.error ?? config.status}`);
  }
  const commands = config.summary.playbooks.map((p) => p.command).sort();
  if (!commands.includes("code") || !commands.includes("discuss")) {
    throw new Error(`template playbooks incomplete: ${commands.join(", ")}`);
  }
  const { builtins } = await command("library.builtins");
  for (const id of ["code", "discuss"]) {
    const entry = builtins.find((b) => b.id === id);
    if (!entry) throw new Error(`builtin catalog missing ${id}`);
    if (!entry.source?.startsWith(`# ${id[0].toUpperCase()}${id.slice(1)}`)) {
      throw new Error(`builtin ${id} source missing or unstripped`);
    }
  }
  const artifacts = await command("playbook.artifacts", { playbookId: "code" });
  if (artifacts.missing.length > 0) {
    throw new Error(`code artifacts missing: ${artifacts.missing.join(", ")}`);
  }
  const project = await command("project.create", {
    path: join(home, "academy"),
    example: true,
  });
  const tree = await command("specs.get", { projectId: project.id });
  const packages = tree.files.filter((f) => f.kind === "package").length;
  const compositions = tree.files.filter((f) => f.kind === "composition").length;
  if (!tree.present || tree.legacy || packages < 6 || compositions < 6) {
    throw new Error(
      `Academy tree unexpected: present=${tree.present} legacy=${tree.legacy} packages=${packages} compositions=${compositions}`,
    );
  }
  socket.close();
  await service.stop();
  rmSync(home, { recursive: true, force: true });
  process.stdout.write(
    `core round-trip ok: template valid, catalog + artifacts served, Academy seeded (${packages} packages, ${compositions} compositions)\n`,
  );
}

try {
  run("build", "npm", ["run", "build"]);
  run("lint", "node", ["packages/cli/dist/cli.js", "lint"]);
  run("unit", "npm", ["test"]);
  run("integration", "npm", ["run", "test:integration", "-w", "packages/core"]);
  await coreRoundTrip();
  if (desktop) {
    // The ABI flip must never outlive the run: restore the Node build
    // even when the render or screenshot check fails, so a red smoke
    // does not leave better-sqlite3 built for Electron.
    run("desktop-abi", "npm", ["run", "rebuild:electron", "-w", "apps/desktop"]);
    try {
      const shot = join(tmpdir(), `spex-smoke-${Date.now()}.png`);
      run("desktop-render", "npm", ["start", "-w", "apps/desktop"], {
        env: { ...process.env, SPEX_ACCEPTANCE: shot },
      });
      if (!existsSync(shot)) {
        throw new Error("desktop render wrote no screenshot");
      }
      process.stdout.write(`desktop screenshot: ${shot}\n`);
    } finally {
      const restore = spawnSync(
        "npm",
        ["run", "rebuild:node", "-w", "apps/desktop"],
        { cwd: root, stdio: "inherit" },
      );
      if (restore.status !== 0) {
        process.stderr.write(
          "WARNING: ABI restore failed — run `npm run rebuild:node -w apps/desktop` before using system-Node tooling\n",
        );
      }
    }
  } else {
    process.stdout.write(
      "\n(desktop render skipped — pass --desktop before a release)\n",
    );
  }
  process.stdout.write("\nsmoke: all stages passed\n");
} catch (error) {
  process.stderr.write(`\nsmoke FAILED at ${stage}: ${error.message}\n`);
  process.exit(1);
}
