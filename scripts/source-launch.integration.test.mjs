// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runDesktop } from "./desktop-runner.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopDir = join(root, "apps", "desktop");
const TEST_TIMEOUT = 60_000;

function integrationTest(name, options, callback) {
  if (typeof options === "function") {
    return test(name, { timeout: TEST_TIMEOUT }, options);
  }
  return test(name, { ...options, timeout: TEST_TIMEOUT }, callback);
}

function tempDirectory(t, prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const cleanupCallbacks = [];
  t.after(() => {
    try {
      for (const cleanup of cleanupCallbacks) cleanup();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  return {
    beforeRemove: (cleanup) => cleanupCallbacks.push(cleanup),
    directory,
  };
}

function executable(directory, name, source) {
  const script = join(directory, `${name}.mjs`);
  writeFileSync(script, `#!/usr/bin/env node\n${source}`);
  if (process.platform === "win32") {
    const command = join(directory, `${name}.cmd`);
    writeFileSync(
      command,
      `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`,
    );
    return command;
  }
  chmodSync(script, 0o755);
  const command = join(directory, name);
  symlinkSync(script, command);
  return command;
}

function findExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = resolve(directory || ".", name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`${name} was not found on PATH`);
}

function readEvents(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function waitFor(predicate, description, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await delay(20);
  }
  throw new Error(`timed out waiting for ${description}`);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function stopProcess(pid, signal, group = false) {
  if (!pid) return;
  try {
    process.kill(group ? -pid : pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function capture(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exited = new Promise((resolveExit) => {
    let spawnError;
    child.once("error", (error) => (spawnError = error));
    child.once("close", (code, signal) =>
      resolveExit(
        spawnError ? { code, signal, error: spawnError } : { code, signal },
      ),
    );
  });
  return { exited, stdout: () => stdout, stderr: () => stderr };
}

function desktopFixture(
  t,
  outcomes = {},
  hangLaunch = false,
  delayedRestore = false,
) {
  const temporary = tempDirectory(t, "spex-desktop-source-");
  const { directory } = temporary;
  const log = join(directory, "events.jsonl");
  const npmCommand = executable(
    directory,
    "npm-stub",
    `import { appendFileSync } from "node:fs";
const append = (event) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(event) + "\\n");
const args = process.argv.slice(2);
const stage = args[1] === "build"
  ? "build"
  : args[1] === "rebuild:electron"
    ? "electron-abi"
    : "node-abi";
append({ stage, args, cwd: process.cwd(), pid: process.pid });
const code = ${JSON.stringify(outcomes)}[stage] ?? 0;
if (stage === "node-abi" && ${JSON.stringify(delayedRestore)}) {
  append({ stage: "node-abi-ready", pid: process.pid });
  setTimeout(() => process.exit(code), 250);
} else {
  process.exit(code);
}
`,
  );
  const electronBinary = executable(
    directory,
    "electron-stub",
    `import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
const append = (event) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(event) + "\\n");
const args = process.argv.slice(2);
append({ stage: "launch", args, cwd: process.cwd(), pid: process.pid });
if (!${JSON.stringify(hangLaunch)}) process.exit(${outcomes.launch ?? 0});
const grandchildSource = ${JSON.stringify(`
  const { appendFileSync } = require("node:fs");
  const append = (event) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(event) + "\\n");
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      append({ stage: "grandchild-signal", signal, pid: process.pid });
      process.exit(0);
    });
  }
  append({ stage: "grandchild-ready", pid: process.pid });
  setInterval(() => {}, 1000);
`)};
const grandchild = spawn(process.execPath, ["-e", grandchildSource], {
  stdio: "ignore",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    append({ stage: "launch-signal", signal, pid: process.pid });
    setTimeout(() => process.exit(0), 25);
  });
}
append({ stage: "launch-ready", pid: process.pid, grandchildPid: grandchild.pid });
setInterval(() => {}, 1000);
`,
  );
  return {
    beforeRemove: temporary.beforeRemove,
    directory,
    electronBinary,
    events: () => readEvents(log),
    npmCommand,
  };
}

async function runDesktopFixture(fixture, launchArgs = []) {
  let stdout = "";
  let stderr = "";
  const code = await runDesktop({
    root,
    desktopDir,
    npmCommand: fixture.npmCommand,
    electronBinary: fixture.electronBinary,
    launchArgs,
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
  });
  return { code, stdout, stderr };
}

function startDesktopHarness(fixture) {
  const path = join(fixture.directory, "run-desktop.mjs");
  writeFileSync(
    path,
    `import { runDesktop } from ${JSON.stringify(pathToFileURL(join(root, "scripts", "desktop-runner.mjs")).href)};
process.exitCode = await runDesktop({
  root: ${JSON.stringify(root)},
  desktopDir: ${JSON.stringify(desktopDir)},
  npmCommand: ${JSON.stringify(fixture.npmCommand)},
  electronBinary: ${JSON.stringify(fixture.electronBinary)},
});
`,
  );
  const child = spawn(process.execPath, [path], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let complete = false;
  fixture.beforeRemove(() => {
    if (complete) return;
    const launch = fixture.events().find(({ stage }) => stage === "launch");
    if (launch) stopProcess(launch.pid, "SIGKILL", true);
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
  });
  return {
    child,
    complete: () => (complete = true),
    output: capture(child),
  };
}

integrationTest("desktop source launch uses real stage processes (APP-SHELL-27)", async (t) => {
  const fixture = desktopFixture(t);
  const result = await runDesktopFixture(fixture, ["--inspect=0", "--trace-warnings"]);
  const events = fixture.events();

  assert.equal(result.code, 0);
  assert.deepEqual(
    events.map(({ stage }) => stage),
    ["build", "electron-abi", "launch", "node-abi"],
  );
  assert.deepEqual(
    events.map(({ args }) => args),
    [
      ["run", "build"],
      ["run", "rebuild:electron", "-w", "apps/desktop"],
      [".", "--inspect=0", "--trace-warnings"],
      ["run", "rebuild:node", "-w", "apps/desktop"],
    ],
  );
  assert.equal(events[0].cwd, root);
  assert.equal(events[2].cwd, desktopDir);
});

integrationTest("desktop source launch preserves failure and restore outcomes (APP-SHELL-27)", async (t) => {
  const cases = [
    {
      outcomes: { build: 2 },
      code: 2,
      stages: ["build"],
      errors: [/workspace build exited 2/],
    },
    {
      outcomes: { "electron-abi": 3 },
      code: 3,
      stages: ["build", "electron-abi", "node-abi"],
      errors: [/Electron ABI rebuild exited 3/],
    },
    {
      outcomes: { launch: 4 },
      code: 4,
      stages: ["build", "electron-abi", "launch", "node-abi"],
      errors: [/Electron launch exited 4/],
    },
    {
      outcomes: { "node-abi": 5 },
      code: 1,
      stages: ["build", "electron-abi", "launch", "node-abi"],
      errors: [/WARNING: ABI restore failed/, /Node ABI restore exited 5/],
    },
    {
      outcomes: { launch: 4, "node-abi": 5 },
      code: 4,
      stages: ["build", "electron-abi", "launch", "node-abi"],
      errors: [
        /Electron launch exited 4/,
        /WARNING: ABI restore failed/,
        /Node ABI restore exited 5/,
      ],
    },
  ];

  for (const expected of cases) {
    const fixture = desktopFixture(t, expected.outcomes);
    const result = await runDesktopFixture(fixture);
    assert.equal(result.code, expected.code);
    assert.deepEqual(
      fixture.events().map(({ stage }) => stage),
      expected.stages,
    );
    for (const pattern of expected.errors) {
      assert.match(result.stderr, pattern);
    }
  }
});

for (const [signal, exitCode, restoreFails] of [
  ["SIGINT", 130, false],
  ["SIGTERM", 143, true],
]) {
  integrationTest(
    `desktop ${signal} stops the real process group and restores Node (APP-SHELL-27)`,
    { skip: process.platform === "win32" },
    async (t) => {
      const fixture = desktopFixture(
        t,
        restoreFails ? { "node-abi": 5 } : {},
        true,
      );
      const harness = startDesktopHarness(fixture);
      let ready;
      ready = await waitFor(() => {
        const events = fixture.events();
        const launch = events.find(({ stage }) => stage === "launch-ready");
        const grandchild = events.find(
          ({ stage }) => stage === "grandchild-ready",
        );
        return launch && grandchild ? launch : undefined;
      }, "the fixture Electron process group");

      harness.child.kill(signal);
      const exit = await harness.output.exited;
      assert.deepEqual(exit, { code: exitCode, signal: null });
      await waitFor(
        () =>
          fixture
            .events()
            .find(
              (event) =>
                event.stage === "grandchild-signal" && event.signal === signal,
            ),
        `the fixture grandchild to receive ${signal}`,
      );
      const events = fixture.events();
      assert.deepEqual(
        events
          .filter(({ stage }) =>
            ["build", "electron-abi", "launch", "node-abi"].includes(stage),
          )
          .map(({ stage }) => stage),
        ["build", "electron-abi", "launch", "node-abi"],
      );
      assert.ok(
        events.some(
          (event) => event.stage === "launch-signal" && event.signal === signal,
        ),
      );
      await waitFor(
        () => !isAlive(ready.pid) && !isAlive(ready.grandchildPid),
        "the fixture process group to exit",
      );
      ready = undefined;
      if (restoreFails) {
        assert.match(harness.output.stderr(), /WARNING: ABI restore failed/);
        assert.match(harness.output.stderr(), /Node ABI restore exited 5/);
      }
      harness.complete();
    },
  );
}

integrationTest(
  "restore-time signals obey desktop failure precedence (APP-SHELL-27)",
  { skip: process.platform === "win32" },
  async (t) => {
    const cases = [
      { outcomes: { "node-abi": 5 }, code: 130 },
      {
        outcomes: { launch: 4, "node-abi": 5 },
        code: 4,
        priorFailure: /Electron launch exited 4/,
      },
    ];

    for (const expected of cases) {
      const fixture = desktopFixture(t, expected.outcomes, false, true);
      const harness = startDesktopHarness(fixture);
      await waitFor(
        () => fixture.events().find(({ stage }) => stage === "node-abi-ready"),
        "the mandatory Node restore",
      );

      harness.child.kill("SIGINT");
      assert.deepEqual(await harness.output.exited, {
        code: expected.code,
        signal: null,
      });
      assert.match(harness.output.stderr(), /WARNING: ABI restore failed/);
      assert.match(harness.output.stderr(), /Node ABI restore exited 5/);
      assert.match(
        harness.output.stderr(),
        /waiting for the mandatory Node ABI restore/,
      );
      if (expected.priorFailure) {
        assert.match(harness.output.stderr(), expected.priorFailure);
      }
      harness.complete();
    }
  },
);

integrationTest(
  "root server source launch builds, forwards args, and shuts down (SERVER-SHELL-15)",
  { skip: process.platform === "win32" },
  async (t) => {
    const temporary = tempDirectory(t, "spex-server-source-");
    const { directory } = temporary;
    const log = join(directory, "npm.jsonl");
    const configPath = join(directory, "playbook.config.yaml");
    const dataDir = join(directory, "state");
    writeFileSync(configPath, "captain: [\n");
    executable(
      directory,
      "npm",
      `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  parentPid: process.ppid,
}) + "\\n");
`,
    );

    const npmCommand = findExecutable("npm");
    const child = spawn(
      npmCommand,
      [
        "run",
        "start:server",
        "--",
        "--host=127.0.0.1",
        "--port=0",
        "--token=source-token",
        `--config=${configPath}`,
        `--data-dir=${dataDir}`,
      ],
      {
        cwd: root,
        detached: true,
        env: {
          ...process.env,
          PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let launcherPid;
    temporary.beforeRemove(() => {
      if (launcherPid) stopProcess(launcherPid, "SIGKILL");
      if (child.exitCode == null && child.signalCode == null) {
        stopProcess(child.pid, "SIGKILL", true);
      }
    });
    const output = capture(child);
    let build;
    try {
      build = await waitFor(
        () => readEvents(log)[0],
        "the repository-root build invocation",
        15_000,
      );
    } catch (error) {
      throw new Error(
        `${error.message}\nstdout:\n${output.stdout()}\nstderr:\n${output.stderr()}`,
      );
    }
    launcherPid = build.parentPid;
    let url;
    try {
      url = await waitFor(
        () => /\[spex-server\] serving at (\S+)/.exec(output.stdout())?.[1],
        "the server access URL",
        15_000,
      );
    } catch (error) {
      throw new Error(
        `${error.message}\nstdout:\n${output.stdout()}\nstderr:\n${output.stderr()}`,
      );
    }
    await waitFor(
      () => output.stdout().includes('[spex-server] config: "invalid"'),
      "the explicit config status",
    );
    assert.deepEqual(build.args, ["run", "build"]);
    assert.equal(build.cwd, root);

    const parsed = new URL(url);
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.searchParams.get("token"), "source-token");
    assert.ok(existsSync(dataDir));
    const page = await fetch(url);
    assert.equal(page.status, 200);

    process.kill(launcherPid, "SIGTERM");
    const exit = await output.exited;
    assert.deepEqual(exit, { code: 0, signal: null });
    await assert.rejects(fetch(url));
    assert.equal(isAlive(launcherPid), false);
    launcherPid = undefined;
  },
);
