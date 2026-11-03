#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The packaging resume check (app-shell-44, DR-217). Cligent 0.38.0
// admits a resumed Claude call on the provider default by omitting the
// model, which holds only while Claude Code resumes on the default
// current at that resume. The shells take the agent SDKs at any
// version, so packaging checks the installed one under the attendee's
// setup — a settings file whose `env.ANTHROPIC_MODEL` is the default —
// against a loopback model API, and stops where it fails.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { freshVerdict, resumeVerdict } from "./check-claude-resume-verdict.mjs";

const CHILD = fileURLToPath(new URL("./check-claude-resume-child.mjs", import.meta.url));
const CHILD_TIMEOUT_MS = 90_000;
const EXPLICIT = "probe-explicit";
const DEFAULT_A = "probe-default-a";
const DEFAULT_B = "probe-default-b";

class CheckError extends Error {}

/** A minimal streamed Messages reply naming the requested model. */
function reply(response, model) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send("message_start", {
    message: { id: "msg_check", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } },
  });
  send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  send("content_block_delta", { index: 0, delta: { type: "text_delta", text: "ok" } });
  send("content_block_stop", { index: 0 });
  send("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
  send("message_stop", {});
  response.end();
}

function startFixture(requests) {
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const url = request.url ?? "";
      if (!url.startsWith("/v1/messages") || url.includes("count_tokens")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ input_tokens: 5 }));
        return;
      }
      let model = "";
      try {
        model = String(JSON.parse(Buffer.concat(chunks).toString("utf8")).model ?? "");
      } catch {
        // An unreadable body is recorded as naming no model.
      }
      requests.push(model);
      reply(response, model);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** The parent's environment less every Anthropic and Claude variable,
 * then only the temporary home and the fixture, so the child's SDK
 * reads nothing of this machine's own Claude setup. */
function childEnvironment(home, endpoint) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(ANTHROPIC|CLAUDE)_/i.test(key)));
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    ANTHROPIC_BASE_URL: endpoint,
    ANTHROPIC_AUTH_TOKEN: "spex-resume-check-not-a-real-token",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };
}

function runChild(args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new CheckError(`the ${args[0]} call did not finish within ${CHILD_TIMEOUT_MS / 1000} seconds`));
    }, CHILD_TIMEOUT_MS);
    child.on("error", (cause) => {
      clearTimeout(timer);
      reject(new CheckError(`the ${args[0]} call could not start: ${cause.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new CheckError(`the ${args[0]} call failed (exit ${code})${stderr.trim() ? "" : " with no diagnostic"}`));
        return;
      }
      const line = stdout.split("\n").find((entry) => entry.startsWith("RESULT "));
      if (!line) {
        reject(new CheckError(`the ${args[0]} call printed no result`));
        return;
      }
      resolve(JSON.parse(line.slice("RESULT ".length)));
    });
  });
}

function writeDefault(home, model) {
  return writeFile(join(home, ".claude", "settings.json"), JSON.stringify({ env: { ANTHROPIC_MODEL: model } }));
}

async function check() {
  const root = await mkdtemp(join(tmpdir(), "spex-resume-check-"));
  const home = join(root, "home");
  const project = join(root, "project");
  const requests = [];
  let server;
  try {
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(project, { recursive: true });
    await writeDefault(home, DEFAULT_A);
    server = await startFixture(requests);
    const { port } = server.address();
    const env = childEnvironment(home, `http://127.0.0.1:${port}`);

    const fresh = await runChild(["fresh", EXPLICIT], env, project);
    const freshFailure = freshVerdict({ explicit: EXPLICIT, requests });
    if (freshFailure) throw new CheckError(freshFailure);

    await writeDefault(home, DEFAULT_B);
    requests.length = 0;
    const resumed = await runChild(["resume", fresh.token], env, project);
    const resumeFailure = resumeVerdict({
      explicit: EXPLICIT,
      changedDefault: DEFAULT_B,
      freshToken: fresh.token,
      resumeToken: resumed.token,
      requests,
    });
    if (resumeFailure) throw new CheckError(resumeFailure);
  } finally {
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

try {
  await check();
  console.log("check-claude-resume: a resumed Claude call with no model runs the current default");
} catch (cause) {
  console.error(`check-claude-resume: FAILED — ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
}
