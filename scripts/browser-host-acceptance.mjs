#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Credential-free Desktop browser acceptance (settings-45). Run from an
// isolated build with Electron's SQLite ABI, or provide the packaged app
// executable. No provider prompt is submitted and no shared profile is used.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "spex browser host "));
const profile = join(scratch, "user data");
const home = join(scratch, "home");
mkdirSync(home);
const emptyBin = join(scratch, "empty bin");
mkdirSync(emptyBin);
const executablePath = process.env.SPEX_BROWSER_APP_EXECUTABLE;
const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (process.platform === "darwin"
  ? join(homedir(), "Library", "Caches", "ms-playwright") : join(homedir(), ".cache", "ms-playwright"));
const freshCache = process.env.SPEX_BROWSER_REQUIRE_EMPTY_CACHE === "1";
const env = { ...process.env, HOME: home, SHELL: "/bin/sh", PATH: emptyBin,
  SPEX_SMOKE_HANDSHAKE: join(scratch, "handshake.json"), SPEX_SMOKE_USERDATA: profile,
  XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"),
  PLAYWRIGHT_BROWSERS_PATH: cache };
for (const key of Object.keys(env)) {
  if (/^(ANTHROPIC|OPENAI|CODEX|GEMINI|GOOGLE|AZURE|AWS)_/.test(key)) delete env[key];
}
delete env.ELECTRON_RUN_AS_NODE;
delete env.SPEX_ACCEPTANCE;
let app;
try {
  if (freshCache) assert.ok(!existsSync(cache) || readdirSync(cache).length === 0, "fresh setup requires an empty browser cache");
  app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [join(root, "apps", "desktop")] }), cwd: root, env, timeout: 60_000 });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Settings", exact: true }).click({ timeout: 60_000 });
  const captain = page.getByTestId("captain-section");
  await captain.getByTestId("captain-edit").click();
  await captain.getByTestId("agent-adapter-codex").click();
  const configPath = join(profile, "spex-home", "config", "playbook.config.yaml");
  const before = readFileSync(configPath, "utf8");
  const browser = captain.getByRole("checkbox", { name: "Browser", exact: true });
  assert.equal(await browser.isChecked(), false);
  await captain.getByRole("button", { name: "Set up browser" }).click({ timeout: 60_000 });
  await captain.getByText("Browser ready", { exact: true }).waitFor({ timeout: 930_000 });
  assert.equal(await browser.isChecked(), false);
  assert.equal(readFileSync(configPath, "utf8"), before, "setup must not save a choice");
  if (process.env.SPEX_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.SPEX_BROWSER_SCREENSHOT });
  await browser.check();
  await captain.getByTestId("agent-save").click();
  await captain.getByTestId("agent-editor").waitFor({ state: "hidden" });
  const after = parse(readFileSync(configPath, "utf8"));
  assert.equal(after.captain.adapter, "codex");
  assert.equal(after.captain.browser, true);
  const runtime = await app.evaluate(({ app }) => {
    const { spawnSync } = process.getBuiltinModule("child_process");
    const lookup = spawnSync("node", ["--version"], { encoding: "utf8" });
    const child = spawnSync(process.execPath, ["-e", "process.stdout.write(process.versions.node)"], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", timeout: 10_000,
    });
    return { electron: process.versions.electron, node: process.versions.node, platform: process.platform,
      packaged: app.isPackaged, nodeLookupError: lookup.error?.code,
      absoluteNodeChild: child.status === 0 && child.stdout === process.versions.node };
  });
  assert.equal(runtime.nodeLookupError, "ENOENT", "there must be no Node on the app PATH");
  assert.equal(runtime.absoluteNodeChild, true, "the owned Electron executable runs Node children");
  if (executablePath) assert.equal(runtime.packaged, true);
  console.log(JSON.stringify({ ...runtime, browser: "ready", setupKeptChoiceOff: true, explicitSave: true, globalNodeRequired: false, freshCache }));
} finally {
  if (app) {
    const child = app.process();
    let deadline;
    try {
      await Promise.race([
        app.close(),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Desktop close timed out")), 10_000); }),
      ]);
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 5000);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
        });
      }
      rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  } else rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
