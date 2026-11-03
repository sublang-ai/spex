#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The child of the packaging resume check (app-shell-44, DR-217). Its
// parent starts it with an isolated home and a loopback model API
// already in its environment, so the SDK reads only the temporary
// settings. It runs one Claude call through the Cligent the core
// resolves:
//
//   check-claude-resume-child.mjs fresh <model>
//   check-claude-resume-child.mjs resume <token>
//
// and prints one `RESULT <json>` line. Any failure exits non-zero.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MINIMUM_CLIGENT = [0, 38, 0];
const CALL_TIMEOUT_MS = 60_000;

function fail(message) {
  process.stderr.write(`check-claude-resume: ${message}\n`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The nearest package.json at or above `start` whose name is `name`. */
function findPackage(start, name) {
  for (let directory = start; ; directory = dirname(directory)) {
    const candidate = join(directory, "package.json");
    if (existsSync(candidate) && readJson(candidate).name === name) return { root: directory, manifest: readJson(candidate) };
    if (dirname(directory) === directory) return undefined;
  }
}

/** The installed SDK as Node resolves it from Cligent's own tree. */
function findSdk(start) {
  for (let directory = start; ; directory = dirname(directory)) {
    const candidate = join(directory, "node_modules", "@anthropic-ai", "claude-agent-sdk", "package.json");
    if (existsSync(candidate)) return readJson(candidate);
    if (dirname(directory) === directory) return undefined;
  }
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? match.slice(1, 4).map(Number) : undefined;
}

function compare(left, right) {
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}

/** Whether `version` meets a caret range, the form the core declares. */
function satisfiesCaret(version, range) {
  const floor = parseVersion(range.replace(/^\^/, ""));
  if (!range.startsWith("^") || !floor) fail(`the core declares @sublang/cligent as "${range}", which this check cannot read`);
  if (compare(version, floor) < 0) return false;
  if (floor[0] > 0) return version[0] === floor[0];
  if (floor[1] > 0) return version[0] === 0 && version[1] === floor[1];
  return version[0] === 0 && version[1] === 0 && version[2] === floor[2];
}

const adapterUrl = import.meta.resolve("@sublang/cligent/adapters/claude-code");
const adapterPath = realpathSync(fileURLToPath(adapterUrl));
const cligent = findPackage(dirname(adapterPath), "@sublang/cligent");
if (!cligent) fail(`no @sublang/cligent package.json above ${adapterPath}`);
const cligentVersion = parseVersion(cligent.manifest.version);
const sdk = findSdk(cligent.root);
if (!sdk) fail(`no @anthropic-ai/claude-agent-sdk above ${cligent.root}`);
process.stderr.write(`check-claude-resume: Cligent ${cligent.manifest.version}, Claude Agent SDK ${sdk.version}, Claude Code ${sdk.claudeCodeVersion}\n`);
const coreManifest = readJson(fileURLToPath(new URL("../package.json", import.meta.url)));
const declared = coreManifest.dependencies?.["@sublang/cligent"];
if (!cligentVersion) fail(`unreadable Cligent version ${cligent.manifest.version}`);
if (compare(cligentVersion, MINIMUM_CLIGENT) < 0) {
  fail(`Cligent ${cligent.manifest.version} is older than ${MINIMUM_CLIGENT.join(".")}, which admits a resumed Claude call on the provider default`);
}
if (!declared || !satisfiesCaret(cligentVersion, declared)) {
  fail(`Cligent ${cligent.manifest.version} at ${cligent.root} does not meet the core's declared range ${declared}`);
}
const [mode, value] = process.argv.slice(2);
if ((mode !== "fresh" && mode !== "resume") || !value) fail(`usage: ${process.argv[1]} fresh <model> | resume <token>`);

const { ClaudeCodeAdapter } = await import(adapterUrl);
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);
const events = [];
try {
  const options = { cwd: process.cwd(), maxTurns: 1, abortSignal: abort.signal, ...(mode === "fresh" ? { model: value } : { resume: value }) };
  for await (const event of new ClaudeCodeAdapter().run("Reply with ok.", options)) events.push(event);
} catch (cause) {
  fail(`the ${mode} call threw: ${cause instanceof Error ? cause.message : String(cause)}`);
} finally {
  clearTimeout(timer);
}

const types = events.map((event) => event.type).join(", ");
const error = events.find((event) => event.type === "error");
const done = events.find((event) => event.type === "done");
if (error) fail(`the ${mode} call reported an error (${error.payload?.code ?? "no code"}): ${error.payload?.message ?? "no message"}; events: ${types}`);
if (!done) fail(`the ${mode} call ended without a terminal event; events: ${types || "none"}`);
if (done.payload?.status !== "success") fail(`the ${mode} call ended ${done.payload?.status}; events: ${types}`);
const token = done.payload?.resumeToken;
if (!token) fail(`the ${mode} call yielded no resume token`);
const init = events.find((event) => event.type === "init");
console.log(`RESULT ${JSON.stringify({ token, reportedModel: init?.payload?.reportedModel })}`);
