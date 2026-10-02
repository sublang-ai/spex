#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// media-16: paid, real-provider Desktop acceptance, distinct from the
// credential-free browser-host gate and served fake-provider journeys.
// Run in a fresh installed checkout of the published dependency closure.
// Requires a signed-in Claude Captain and Claude (default) or Codex worker.
// Credentials stay in the user's normal provider home; all Spex state,
// governed files and browser cache are owned temporary directories.
// Source mode builds and flips/restores Electron's SQLite ABI unless the
// isolated checkout has SPEX_SMOKE_BUILD_READY=1 / SPEX_SMOKE_ABI_READY=1.
// SPEX_INSPECT_APP_EXECUTABLE selects an already prepared packaged app.
// SPEX_INSPECT_EVIDENCE_DIR retains safe screenshot/report artifacts.
import assert from "node:assert/strict";
import { nativeApprovalStage } from "./native-approval-stage.mjs";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { WebSocket } from "ws";
import { parse } from "yaml";
import { createSessionStore } from "@sublang/playbook/session-store";
import { parseAssetUri } from "@sublang/playbook/session-assets";
import { measure, record, setRail } from "../e2e/src/fit.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adapter = process.env.SPEX_INSPECT_ADAPTER ?? "claude";
assert.ok(["claude", "codex"].includes(adapter), "Inspect acceptance requires a native image-capable Claude or Codex worker");
// Refuse the old closure before launching an app or using a provider.
import.meta.resolve("@sublang/playbook/inspect/registry");
const executablePath = process.env.SPEX_INSPECT_APP_EXECUTABLE;
const flip = !executablePath && process.env.SPEX_SMOKE_ABI_READY !== "1";
const scratch = mkdtempSync(join(process.env.SPEX_SMOKE_SCRATCH_DIR ?? tmpdir(), "spex inspect host "));
const evidenceDir = process.env.SPEX_INSPECT_EVIDENCE_DIR
  ? resolve(process.env.SPEX_INSPECT_EVIDENCE_DIR) : mkdtempSync(join(tmpdir(), "spex inspect evidence "));
mkdirSync(evidenceDir, { recursive: true });
assert.ok(!evidenceDir.startsWith(`${scratch}/`), "retained evidence must be outside disposable scratch");
const profile = join(scratch, "user data");
const projectPath = join(scratch, "inspection fixture");
const handshake = join(scratch, "handshake.json");
const configPath = join(profile, "spex-home", "config", "playbook.config.yaml");
const env = { ...process.env, SPEX_SMOKE_HANDSHAKE: handshake, SPEX_SMOKE_USERDATA: profile,
  XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"),
  PLAYWRIGHT_BROWSERS_PATH: join(scratch, "managed browsers") };
delete env.ELECTRON_RUN_AS_NODE;
delete env.SPEX_ACCEPTANCE;
let app;
let appChild;
let client;
let stage = "setup";
let succeeded = false;
let flipped = false;
let sessionId;
let history = [];
const at = (value) => { stage = value; console.log(`inspect-host: ${value}`); };
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 600_000 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
};
async function waitFor(check, timeout, label) {
  const until = Date.now() + timeout;
  do {
    const value = await check();
    if (value) return value;
    if (app && app.process().exitCode !== null) throw new Error(`Desktop exited while waiting for ${label}`);
    await delay(500);
  } while (Date.now() < until);
  throw new Error(`Timed out waiting for ${label}`);
}
function killApp() {
  const child = appChild;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  // Playwright launches Electron in its own POSIX process group.
  try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
}
async function closeApp() {
  client?.close();
  client = undefined;
  if (!app) return;
  let timer;
  try {
    await Promise.race([app.close(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Desktop close exceeded 15 seconds")), 15_000);
    })]);
  } finally {
    clearTimeout(timer);
    killApp();
    app = undefined;
    appChild = undefined;
  }
}
function restoreAbi() {
  if (!flipped) return;
  flipped = false;
  run("npm", ["run", "rebuild:node", "-w", "apps/desktop"]);
}
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) process.once(signal, () => {
  killApp();
  try { restoreAbi(); } catch (error) { console.error(error.message); }
  console.error(`inspect-host interrupted at ${stage}; scratch retained: ${scratch}`);
  process.exit(code);
});

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let seq = 0;
  socket.on("message", (data) => {
    const reply = JSON.parse(String(data));
    if (reply.type === "reply") pending.get(reply.id)?.(reply);
  });
  socket.on("error", () => {});
  socket.on("close", () => { for (const reply of pending.values()) reply({ ok: false, error: { message: "socket closed" } }); });
  await new Promise((done, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("Core connection timed out")); }, 30_000);
    socket.once("open", () => { clearTimeout(timer); done(); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  return {
    close: () => socket.close(),
    command: (type, fields = {}) => new Promise((done, reject) => {
      const id = `inspect-${++seq}`;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${type} reply timed out`)); }, 60_000);
      pending.set(id, (reply) => {
        clearTimeout(timer); pending.delete(id);
        reply.ok ? done(reply.result) : reject(new Error(`${type}: ${reply.error.message}`));
      });
      socket.send(JSON.stringify({ type, id, ...fields }));
    }),
  };
}
async function launch() {
  rmSync(handshake, { force: true });
  app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [join(root, "apps", "desktop")] }), cwd: root, env, timeout: 90_000 });
  appChild = app.process();
  const page = await app.firstWindow();
  page.setDefaultTimeout(60_000);
  await waitFor(() => existsSync(handshake), 90_000, "core handshake");
  client = await connect(JSON.parse(readFileSync(handshake, "utf8")).wsUrl);
  await page.getByTestId("sidebar-collapse").waitFor();
  await page.setViewportSize({ width: 1440, height: 1100 });
  return page;
}

// The defect is deliberately absent from the agent prompt: a real observation
// must identify the tenfold discrepancy and suggest a concrete correction.
const fixtureHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Evergreen Billing</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f4f6f4;color:#18352a;font:18px system-ui}main{max-width:960px;margin:70px auto;padding:32px}header{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#526d60}h1{font-size:42px;margin:18px 0 40px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:30px}.card{background:white;border:1px solid #c6d7cc;border-radius:18px;padding:30px}.selected{border:3px solid #28744b}.tag{color:#28744b;font-weight:700}h2{font-size:24px}.price{font-size:42px;font-weight:750}.price small{font-size:16px;font-weight:400}.line{display:flex;justify-content:space-between;border-top:1px solid #d8e2dc;padding-top:20px;margin-top:24px}.total{font-size:28px;font-weight:750}button{border:0;border-radius:10px;padding:16px;background:#28744b;color:white;font:700 18px system-ui;width:100%;margin-top:28px}.note{font-size:14px;color:#526d60;margin-top:22px}</style>
<main><header>Evergreen · Account</header><h1>Confirm your subscription</h1><div class="grid"><section class="card selected"><span class="tag">✓ Selected plan</span><h2>Personal monthly</h2><div class="price">$8 <small>/ month</small></div><p>Your everyday workspace, billed monthly.</p><p class="note">Cancel whenever you like. No annual commitment.</p></section><section class="card"><h2>Order summary</h2><p>Personal monthly subscription</p><div class="line"><span>Due today</span><strong class="total">$80</strong></div><button>Pay now</button><p class="note">Your subscription begins immediately.</p></section></div></main></html>`;
const fixture = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(fixtureHtml);
});

async function assetBytes(asset) {
  const chunks = [];
  for (let offset = 0; offset < asset.byteLength;) {
    const part = await client.command("media.read", { owner: { kind: "session", id: sessionId }, assetId: asset.assetId, offset, length: 65536 });
    assert.equal(part.offset, offset);
    const bytes = Buffer.from(part.data, "base64");
    assert.ok(bytes.length > 0, "asset reads advance");
    chunks.push(bytes); offset += bytes.length;
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, asset.byteLength);
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes;
}
async function finishTurn() {
  await waitFor(async () => {
    history = (await client.command("history.get", { sessionId })).records;
    const failure = history.find(({ record }) => ["runtime_error", "turn_aborted"].includes(record.type));
    if (failure) throw new Error(`Inspect failed: ${failure.record.message ?? failure.record.reason ?? failure.record.type}`);
    const state = (await client.command("session.list")).find((entry) => entry.id === sessionId);
    return state && !state.turnActive && history.some(({ record }) => record.type === "turn_finished");
  }, 12 * 60_000, "completed Inspect turn");
}
function reportedModels(records, playerId) {
  // Runtime-named models are evidence; requested/fallback model names are not.
  return [...new Set(records.filter((record) => record.type === "player_event" && record.playerId === playerId &&
    record.event.type === "init" && typeof record.event.payload.reportedModel === "string")
    .map((record) => record.event.payload.reportedModel))];
}
function initializeRepository(path) {
  mkdirSync(path);
  run("git", ["init", "--quiet"], path);
  writeFileSync(join(path, "README.md"), "# Inspect acceptance fixture\n\nThis task-owned repository must remain unchanged.\n");
  run("git", ["add", "README.md"], path);
  run("git", ["-c", "user.name=Spex Acceptance", "-c", "user.email=acceptance@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Create owned inspection fixture"], path);
  assert.equal(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], path), "");
  return run("git", ["rev-parse", "HEAD"], path).trim();
}
async function assertUnchanged(path, head) {
  const store = createSessionStore({ sessionsDir: join(profile, "spex-home", "sessions") });
  const settled = await store.read(sessionId);
  assert.equal(settled.state, "settled");
  assert.equal(settled.snapshot.lastSettlementStatus, "ok");
  assert.equal(settled.snapshot.mode, "chat");
  assert.equal(settled.unresolvedEffects.length, 0);
  const stream = await store.readStream(sessionId);
  const terminal = stream.entries.map(({ record }) => record).findLast((record) => record.type === "captain_telemetry" &&
    record.topic === "playbook.trace" && record.payload?.playbookId === "inspect" && record.payload.depth === 0 &&
    record.payload.type === "boss.input.settled")?.payload.payload;
  assert.equal(terminal?.outcome, "terminal");
  assert.equal(terminal.state?.status, "done");
  assert.equal(terminal.terminal?.kind, "success");
  const boundaries = settled.effectLedger.boundaries.filter((entry) => entry.playbookId === "inspect" && entry.roleId === "inspector");
  assert.ok(boundaries.length > 0, "Inspect needs a durable working-call boundary");
  for (const boundary of boundaries) assert.equal(boundary.physicalReceipt?.classification, "unchanged");
  assert.equal(run("git", ["rev-parse", "HEAD"], path).trim(), head);
  assert.equal(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], path), "");
}
async function assertUnclipped(locator, label) {
  const visible = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        clip.left = Math.max(clip.left, rect.left + parent.clientLeft);
        clip.right = Math.min(clip.right, rect.left + parent.clientLeft + parent.clientWidth);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        clip.top = Math.max(clip.top, rect.top + parent.clientTop);
        clip.bottom = Math.min(clip.bottom, rect.top + parent.clientTop + parent.clientHeight);
      }
    }
    return box.width > 0 && box.height > 0 && box.left >= clip.left - 1 && box.right <= clip.right + 1 &&
      box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1;
  });
  assert.ok(visible, `${label} must be fully visible inside the conversation scrollport`);
}
async function showTogether(page, figure, observation) {
  await figure.scrollIntoViewIfNeeded();
  await observation.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await assertUnclipped(figure, "Decoded image figure");
  await assertUnclipped(observation, "Substantive Captain explanation");
}
async function assertRenderedImage(image, expectedBytes) {
  // The app's connect-src policy intentionally refuses fetch(blob:). Compare
  // decoded pixels through the allowed image surface without weakening CSP.
  const matches = await image.evaluate(async (element, base64) => {
    const expected = new Image();
    expected.src = `data:image/png;base64,${base64}`;
    await expected.decode();
    if (element.naturalWidth !== expected.naturalWidth || element.naturalHeight !== expected.naturalHeight) return false;
    const pixels = (source) => {
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(source, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const actual = pixels(element);
    const reference = pixels(expected);
    return actual.every((byte, index) => byte === reference[index]);
  }, expectedBytes.toString("base64"));
  assert.ok(matches, "the rendered figure must decode to the selected persisted image");
}
async function showEvidence(page, evidence, reply, expectedBytes) {
  const pane = page.getByTestId("captain-pane");
  const figure = pane.getByRole("figure").filter({ hasText: `Invocation ${evidence.callId}` })
    .filter({ hasText: `Turn ${evidence.turnId}` }).filter({ hasText: `Tool ${evidence.origin.toolUseId}` }).first();
  await figure.waitFor();
  const image = figure.getByRole("img");
  await waitFor(() => image.evaluate((node) => node.complete && node.naturalWidth > 0), 30_000, "decoded Captain image");
  await assertRenderedImage(image, expectedBytes);
  assert.ok((await figure.innerText()).includes(evidence.origin.actorId));
  const plain = (text) => text.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
  assert.ok(plain(await pane.innerText()).includes(plain(reply.text).slice(0, 35)), "Captain prose is rendered beside evidence");
  await setRail(page, false);
  const defects = [];
  for (const width of [320, 900]) {
    await page.setViewportSize({ width, height: 1100 });
    record(`Inspect ${width}px`, await measure(page), defects);
  }
  assert.deepEqual(defects, []);
  // A tall, ordinary viewport retains both the native figure and substantive
  // Captain prose. No DOM content or styling is rewritten for the artifact.
  await page.setViewportSize({ width: 1440, height: 1600 });
  const observation = pane.getByText(/\b80(?:\.00)?\b/).first();
  await showTogether(page, figure, observation);
  return { pane, figure };
}

try {
  if (flip) { at("Electron ABI"); flipped = true; run("npm", ["run", "rebuild:electron", "-w", "apps/desktop"]); }
  if (!executablePath && process.env.SPEX_SMOKE_BUILD_READY !== "1") { at("build"); run("npm", ["run", "build"]); }
  const beforeHead = initializeRepository(projectPath);
  await new Promise((done, reject) => { fixture.once("error", reject); fixture.listen(0, "127.0.0.1", done); });
  const preview = `http://127.0.0.1:${fixture.address().port}/`;

  at("fresh Desktop and explicit Inspector browser setup");
  let page = await launch();
  const config = await client.command("config.get");
  assert.equal(config.status, "valid");
  const inspector = config.summary.playbooks.find((entry) => entry.id === "inspect")?.roles.inspector.playerId;
  assert.ok(inspector, "fresh published configuration must seed Inspect");
  const seeded = parse(readFileSync(configPath, "utf8"));
  assert.notEqual(seeded.players[inspector].browser, true, "fresh Browser choice is off");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByTestId(`player-edit-${inspector}`).click();
  const editor = page.getByTestId(`player-row-${inspector}`);
  await editor.getByTestId(`agent-adapter-${adapter}`).click();
  const beforeSetup = readFileSync(configPath, "utf8");
  await editor.getByRole("button", { name: "Set up browser", exact: true }).click();
  await editor.getByText("Browser ready", { exact: true }).waitFor({ timeout: 930_000 });
  assert.equal(await editor.getByRole("checkbox", { name: "Browser", exact: true }).isChecked(), false);
  assert.equal(readFileSync(configPath, "utf8"), beforeSetup);
  await editor.getByRole("checkbox", { name: "Browser", exact: true }).check();
  await editor.getByTestId("agent-save").click();
  await editor.getByTestId("agent-editor").waitFor({ state: "hidden" });
  assert.equal(parse(readFileSync(configPath, "utf8")).players[inspector].browser, true);
  const runtime = await app.evaluate(({ app }) => ({ electron: process.versions.electron, node: process.versions.node, platform: process.platform, packaged: app.isPackaged, appVersion: app.getVersion() }));
  if (executablePath) assert.equal(runtime.packaged, true);

  const project = await client.command("project.register", { path: projectPath });
  // Fixture registration uses a separate core client; reload the renderer's
  // initial project listing before selecting that externally registered row.
  await page.reload();
  await page.getByTestId(`sidebar-project-${project.id}`).click();
  const prompt = `/inspect Open ${preview} in the browser and inspect the rendered subscription screen. Take a screenshot without a filename. In at most 120 words, explain the most important UX issue, quote the displayed plan and total prices, and suggest a practical fix. Do not change any repository files or make a commit.`;
  await page.getByTestId("start-composer").fill(prompt);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const session = await waitFor(async () => (await client.command("session.list")).find((entry) => entry.projectId === project.id), 60_000, "UI-created Inspect session");
  sessionId = session.id;
  const browserSessionId = sessionId;

  at("real provider inspection and Captain report");
  await finishTurn();
  const records = history.map(({ record }) => record);
  const turnId = records.find((record) => record.type === "turn_started")?.turnId;
  assert.equal(typeof turnId, "number");
  const workerEvents = records.filter((record) => record.type === "player_event" && record.turnId === turnId && record.playerId === inspector);
  const succeededTool = (use) => workerEvents.some(({ event }) => event.sessionId === use.event.sessionId && event.type === "tool_result" &&
    event.payload.toolUseId === use.event.payload.toolUseId && event.payload.status === "success");
  const navigated = workerEvents.find((record) => record.event.type === "tool_use" && record.event.payload.toolName.includes("browser_navigate") &&
    record.event.payload.input.url === preview && succeededTool(record));
  assert.ok(navigated, "the worker must successfully navigate to the exact owned fixture");
  const screenshotUse = workerEvents.find((record, index) => index > workerEvents.indexOf(navigated) &&
    record.event.sessionId === navigated.event.sessionId && record.event.type === "tool_use" &&
    record.event.payload.toolName.includes("browser_take_screenshot") && succeededTool(record));
  assert.ok(screenshotUse, "the worker must successfully take a screenshot after opening the fixture");
  const lastNavigation = workerEvents.slice(0, workerEvents.indexOf(screenshotUse)).findLast((record) =>
    record.event.sessionId === screenshotUse.event.sessionId && record.event.type === "tool_use" &&
    record.event.payload.toolName.includes("browser_navigate"));
  assert.equal(lastNavigation?.event.payload.input.url, preview, "the screenshot follows navigation to the owned fixture");
  assert.ok(succeededTool(lastNavigation));
  assert.ok(workerEvents.some(({ event }) => event.sessionId === screenshotUse.event.sessionId && event.type === "done" && event.payload.status === "success"),
    "the native Inspector must finish successfully");
  const screenshotToolId = screenshotUse.event.payload.toolUseId;
  const nativeMedia = workerEvents.find(({ event }) => event.sessionId === screenshotUse.event.sessionId && event.type === "media" &&
    event.payload.mimeType === "image/png" && event.payload.toolUseId === screenshotToolId && event.payload.source.type === "uri");
  assert.ok(nativeMedia, "the successful screenshot call must produce persisted native PNG media");
  const nativeAssetId = parseAssetUri(nativeMedia.event.payload.source.uri);
  assert.ok(nativeAssetId);
  const evidence = records.find((record) => record.type === "playbook_evidence" && record.turnId === turnId && record.origin.kind === "player" &&
    record.origin.actorId === inspector && record.origin.toolUseId === screenshotToolId && record.asset.assetId === nativeAssetId && record.asset.mimeType === "image/png");
  assert.ok(evidence, "the native worker must produce a visible screenshot asset");
  assert.equal(typeof evidence.callId, "string");
  const nativeTools = workerEvents.filter((entry) => entry.event.type === "tool_use")
    .map((entry) => entry.event.payload.toolName);
  const browserReportedModels = reportedModels(records, inspector);
  const replies = history.map(({ record }) => record).filter((record) => record.type === "captain_reply");
  const reply = replies.findLast((record) => /\b8(?:\.00)?\b/.test(record.text) && /\b80(?:\.00)?\b/.test(record.text));
  assert.ok(reply && reply.text.length >= 120, "Captain must explain the observed price discrepancy, not merely announce completion");
  assert.match(reply.text, /mismatch|discrep|inconsisten|confus|ten.?fold|ten.?times|10.?times|10.?[×x]|overcharg|differ|trust|surpris/i);
  assert.match(reply.text, /fix|correct|clarif|align|match|show|display|explain|update|change/i);
  const image = await assetBytes(evidence.asset);
  const digest = createHash("sha256").update(image).digest("hex");
  writeFileSync(join(evidenceDir, "native-inspection.png"), image);
  writeFileSync(join(evidenceDir, "captain-reply.md"), `${reply.text}\n`);
  await showEvidence(page, evidence, reply, image);
  await page.screenshot({ path: join(evidenceDir, "captain-inspect-before-reopen.png") });

  at("settled receipt and repository invariance");
  await closeApp();
  await assertUnchanged(projectPath, beforeHead);

  at("reopened native image and retained end-user screenshot");
  page = await launch();
  await setRail(page, true);
  await page.getByTestId(`sidebar-session-${sessionId}`).click();
  const reopened = (await client.command("history.get", { sessionId })).records;
  assert.ok(reopened.some(({ record }) => record.type === "playbook_evidence" && record.asset.assetId === evidence.asset.assetId && record.callId === evidence.callId));
  assert.ok(reopened.some(({ record }) => record.type === "captain_reply" && record.text === reply.text));
  assert.equal(createHash("sha256").update(await assetBytes(evidence.asset)).digest("hex"), digest);
  await showEvidence(page, evidence, reply, image);
  const screenshot = join(evidenceDir, "captain-inspect-reopened.png");
  await page.screenshot({ path: screenshot });

  at("fresh native attachment session with Browser explicitly off");
  await setRail(page, true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByTestId(`player-edit-${inspector}`).click();
  const offEditor = page.getByTestId(`player-row-${inspector}`);
  await offEditor.getByRole("checkbox", { name: "Browser", exact: true }).uncheck();
  await offEditor.getByTestId("agent-save").click();
  await offEditor.getByTestId("agent-editor").waitFor({ state: "hidden" });
  assert.equal(parse(readFileSync(configPath, "utf8")).players[inspector].browser, false);
  // Render a new visual fact only after the first conversation ended. It is
  // never written into a prompt, filename, governed file or previous session.
  const token = `ORCHID-${randomBytes(4).toString("hex").toUpperCase()}`;
  const inputImage = Buffer.from(await page.evaluate((reference) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000; canvas.height = 520;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f5f1e9"; context.fillRect(0, 0, 1000, 520);
    context.fillStyle = "#163a2c";
    context.font = "bold 42px sans-serif"; context.fillText("Parcel dispatch card", 70, 115);
    context.font = "28px sans-serif"; context.fillText("Dispatch reference", 70, 210);
    context.font = "bold 54px monospace"; context.fillText(reference, 70, 295);
    context.font = "26px sans-serif"; context.fillText("Keep this reference when collecting the parcel.", 70, 405);
    return canvas.toDataURL("image/png").split(",")[1];
  }, token), "base64");
  writeFileSync(join(evidenceDir, "attachment-input.png"), inputImage);
  const inputRepository = join(scratch, "attachment fixture");
  const inputHead = initializeRepository(inputRepository);
  const inputProject = await client.command("project.register", { path: inputRepository });
  await page.reload();
  await page.getByTestId(`sidebar-project-${inputProject.id}`).click();
  const inputPrompt = "/inspect Describe the attached card and quote its dispatch reference exactly. Use the supplied image directly; browser access is off. Keep your explanation under 80 words. Do not change any repository files or make a commit.";
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (await chooser).setFiles({ name: "reference.png", mimeType: "image/png", buffer: inputImage });
  await page.getByRole("list", { name: "Attachments", exact: true }).getByText("Ready", { exact: true }).waitFor();
  await page.getByTestId("start-composer").fill(inputPrompt);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const inputSession = await waitFor(async () => (await client.command("session.list")).find((entry) => entry.projectId === inputProject.id), 60_000, "fresh attachment session");
  sessionId = inputSession.id;
  assert.notEqual(sessionId, browserSessionId);
  await finishTurn();
  const inputRecords = history.map(({ record }) => record);
  const accepted = inputRecords.find((entry) => entry.type === "turn_started");
  assert.equal(accepted?.turn.prompt, inputPrompt);
  assert.equal(accepted.turn.attachments.length, 1);
  const inputAsset = accepted.turn.attachments[0];
  assert.equal(inputAsset.name, "reference.png");
  assert.deepEqual(await assetBytes(inputAsset), inputImage);
  const workerPrompts = inputRecords.filter((entry) => entry.type === "player_prompt" && entry.playerId === inspector);
  assert.ok(workerPrompts.length > 0, "the attachment must reach a working Inspector");
  assert.ok(workerPrompts.every((entry) => !entry.prompt.includes(token)), "no controller may leak the visual answer into the worker text prompt");
  assert.ok(inputRecords.some((entry) => entry.type === "player_event" && entry.playerId === inspector && entry.event.type === "done" &&
    entry.event.payload.status === "success" && entry.event.payload.result?.includes(token)), "the successful native worker must perceive the attached image's new token");
  assert.ok(!inputRecords.some((entry) => entry.type === "player_event" && entry.playerId === inspector && entry.event.type === "tool_use" && entry.event.payload.toolName.includes("browser_")), "Browser remains off for the attachment turn");
  const inputReply = inputRecords.findLast((entry) => entry.type === "captain_reply" && entry.text.includes(token));
  assert.ok(inputReply, "Captain must relay the worker's visual observation");
  await closeApp();
  await assertUnchanged(inputRepository, inputHead);
  page = await launch();
  await setRail(page, true);
  await page.getByTestId(`sidebar-session-${sessionId}`).click();
  const inputPane = page.getByTestId("captain-pane");
  const inputFigure = inputPane.getByRole("figure", { name: "reference.png", exact: true });
  await inputFigure.waitFor();
  await waitFor(() => inputFigure.getByRole("img").evaluate((node) => node.complete && node.naturalWidth > 0), 30_000, "reopened attachment image");
  await assertRenderedImage(inputFigure.getByRole("img"), inputImage);
  await inputPane.getByText(token, { exact: false }).first().waitFor();
  assert.deepEqual(await assetBytes(inputAsset), inputImage);
  const inputHistory = (await client.command("history.get", { sessionId })).records;
  assert.ok(inputHistory.some(({ record }) => record.type === "captain_reply" && record.text === inputReply.text));
  const attachmentScreenshot = join(evidenceDir, "captain-attachment-reopened.png");
  await page.setViewportSize({ width: 1440, height: 1400 });
  await showTogether(page, inputFigure, inputPane.getByText(token, { exact: false }).first());
  await page.screenshot({ path: attachmentScreenshot });
  const nativeApprovals = await nativeApprovalStage({page, client, inspector, scratch, profile, evidenceDir, initializeRepository, waitFor, run, at});
  at("restarted core retains approval history without live authority");
  await closeApp();
  page = await launch();
  assert.deepEqual((await client.command("approval.list")).pending, []);
  for (const approval of nativeApprovals) {
    const reopened = (await client.command("history.get", { sessionId: approval.sessionId })).records;
    const responses = reopened.filter(({ record }) => record.type === "player_event" &&
      record.event.type === "approval_response" && record.event.payload.requestId === approval.requestId &&
      record.event.payload.decision === approval.decision && record.event.payload.source === "host");
    assert.equal(responses.length, 1);
    approval.historyOnlyAfterCoreRestart = true;
  }
  const report = { ...runtime, adapter, inspector, nativeApprovals, sessionId: browserSessionId, nativeTools,
    nativeReportedModels: browserReportedModels, freshProfile: true, freshBrowserCache: true, explicitBrowserSave: true,
    nativeScreenshot: { assetId: evidence.asset.assetId, byteLength: image.length, sha256: digest, origin: evidence.origin, callId: evidence.callId,
      turnId, toolUseId: screenshotToolId, fixtureNavigation: preview },
    receipt: "unchanged", repositoryUnchanged: true, reopened: true, screenshot, evidenceDir,
    attachmentInput: { sessionId, browser: false, nativeReportedModels: reportedModels(inputRecords, inspector), token, assetId: inputAsset.assetId,
      sha256: createHash("sha256").update(inputImage).digest("hex"), nativeWorkerPerceived: true, captainRelayed: true, receipt: "unchanged", reopened: true, screenshot: attachmentScreenshot } };
  writeFileSync(join(evidenceDir, "acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  succeeded = true;
} catch (error) {
  console.error(`inspect-host FAILED at ${stage}: ${error.message}`);
  if (history.length) writeFileSync(join(evidenceDir, "record-types.json"), JSON.stringify(history.map(({ record }) => record.type)));
  if (app) await app.firstWindow().then((page) => page.screenshot({ path: join(evidenceDir, "failure.png"), timeout: 5000 })).catch(() => {});
  process.exitCode = 1;
} finally {
  await closeApp().catch((error) => { console.error(error.message); succeeded = false; process.exitCode = 1; });
  fixture.closeAllConnections();
  await new Promise((done) => fixture.close(done));
  try { restoreAbi(); } catch (error) { console.error(error.message); succeeded = false; process.exitCode = 1; }
  if (succeeded) rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  else console.error(`scratch retained for diagnosis: ${scratch}`);
  console.log(`retained evidence: ${evidenceDir}`);
}
