#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Live desktop smoke (DR-020, RELEASE-22): boots the real Electron
// app against a scratch home and walks the release-critical path over
// the app's own socket — seeded config, Academy example, session,
// live /code dispatch with real agents, abort, teardown. Requires a
// locally signed-in Claude adapter; NOT hermetic, NOT for CI. The
// driver owns the native-ABI flip to Electron and restores it on
// every exit path (skip flip with SPEX_SMOKE_ABI_READY=1).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const BUDGET_MS = 8 * 60_000;
const PROMPT =
  "/code Reply DONE as your whole answer; make no repository changes.";

let stage = "setup";
const say = (line) => process.stdout.write(`desktop-smoke: ${line}\n`);
const at = (name) => {
  stage = name;
  say(`— ${name}`);
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

async function waitFor(check, budgetMs, what) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > budgetMs) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const flip = process.env.SPEX_SMOKE_ABI_READY !== "1";
let electron;
let scratch;
try {
  if (flip) {
    at("abi-flip");
    run("npm", ["run", "rebuild:electron", "-w", "apps/desktop"]);
  }

  at("launch");
  scratch = mkdtempSync(join(tmpdir(), "spex-desktop-smoke-"));
  const handshakePath = join(scratch, "handshake.json");
  electron = spawn("npm", ["start", "-w", "apps/desktop"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SPEX_SMOKE_HANDSHAKE: handshakePath,
      SPEX_SMOKE_USERDATA: join(scratch, "userdata"),
      XDG_CONFIG_HOME: join(scratch, "config"),
    },
  });
  const exited = new Promise((resolve) => electron.once("exit", resolve));

  const { wsUrl } = JSON.parse(
    readFileSync(
      await waitFor(
        () => (existsSync(handshakePath) ? handshakePath : undefined),
        90_000,
        "the app's core handshake",
      ),
      "utf8",
    ),
  );
  say(`core at ${wsUrl}`);

  at("connect");
  const { WebSocket } = await import("ws");
  const socket = new WebSocket(wsUrl);
  const replies = new Map();
  const records = [];
  let seq = 0;
  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    if (message.type === "reply") replies.get(message.id)?.(message);
    if (message.type === "record") records.push(message);
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const command = (type, fields = {}) =>
    new Promise((resolve, reject) => {
      const id = `d${(seq += 1)}`;
      replies.set(id, (reply) =>
        reply.ok
          ? resolve(reply.result)
          : reject(new Error(`${type}: ${reply.error.message}`)),
      );
      socket.send(JSON.stringify({ type, id, ...fields }));
    });

  at("config");
  const config = await command("config.get");
  if (config.status !== "valid") {
    throw new Error(`seeded config invalid: ${JSON.stringify(config)}`);
  }
  if (config.summary.captain.adapter !== "claude") {
    throw new Error("seeded captain is not the single-vendor claude block");
  }

  at("academy");
  const project = await command("project.create", {
    path: join(scratch, "academy"),
    example: true,
  });
  const tree = await command("specs.get", { projectId: project.id });
  if (!tree.present || tree.legacy) throw new Error("Academy tree not parsed");

  at("session");
  const session = await command("session.create", { projectId: project.id });
  await command("subscribe", {
    channel: { kind: "session", sessionId: session.id },
  });

  at("dispatch");
  await command("turn.submit", { sessionId: session.id, text: PROMPT });
  // Dispatch evidence: the coder's prompt record; live-agent
  // evidence: its first streamed event. Real routing + first-token
  // latency sit inside the budget (DR-020).
  await waitFor(
    () =>
      records.find(
        (m) =>
          m.record?.type === "player_prompt" &&
          String(m.record.playerId ?? "").startsWith("code-"),
      ),
    BUDGET_MS,
    "the coder dispatch prompt",
  );
  say("coder dispatched");
  await waitFor(
    () =>
      records.find(
        (m) =>
          m.record?.type === "player_event" &&
          String(m.record.playerId ?? "").startsWith("code-"),
      ),
    BUDGET_MS,
    "live agent output",
  );
  say("live agent output observed");

  at("abort");
  await command("turn.abort", { sessionId: session.id });
  await waitFor(
    () => records.find((m) => m.record?.type === "turn_aborted"),
    60_000,
    "the aborted-turn record",
  );
  await command("session.dispose", { sessionId: session.id });

  at("teardown");
  socket.close();
  electron.kill("SIGTERM");
  const code = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 15_000)),
  ]);
  if (code === "timeout") {
    electron.kill("SIGKILL");
    throw new Error("app did not exit on SIGTERM");
  }

  say("critical path complete");
} catch (error) {
  process.stderr.write(`\ndesktop-smoke FAILED at ${stage}: ${error.message}\n`);
  electron?.kill("SIGKILL");
  process.exitCode = 1;
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  if (flip) {
    at("abi-restore");
    const restore = spawnSync(
      "npm",
      ["run", "rebuild:node", "-w", "apps/desktop"],
      { cwd: root, stdio: "inherit" },
    );
    if (restore.status !== 0) {
      process.stderr.write(
        "WARNING: ABI restore failed — run `npm run rebuild:node -w apps/desktop`\n",
      );
      process.exitCode = 1;
    }
  }
}
