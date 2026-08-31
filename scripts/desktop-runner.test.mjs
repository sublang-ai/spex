// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { runDesktop } from "./desktop-runner.mjs";

function harness(outcomes = {}) {
  const calls = [];
  const killed = [];
  const signalSource = new EventEmitter();
  let stdout = "";
  let stderr = "";
  const execute = async (step, onChild) => {
    calls.push(step.id);
    const child = {
      pid: calls.length + 100,
      exitCode: null,
      signalCode: null,
      kill: (signal) => killed.push({ step: step.id, signal }),
    };
    onChild(child);
    const outcome = outcomes[step.id];
    if (typeof outcome === "function") {
      return outcome({ child, signalSource });
    }
    return outcome ?? { code: 0, signal: null };
  };

  return {
    calls,
    killed,
    signalSource,
    stderr: () => stderr,
    run: () =>
      runDesktop({
        root: "/repo",
        desktopDir: "/repo/apps/desktop",
        electronBinary: "/electron",
        execute,
        platform: "win32",
        signalSource,
        stdout: { write: (text) => (stdout += text) },
        stderr: { write: (text) => (stderr += text) },
      }),
  };
}

test("a normal source run restores Node after Electron exits", async () => {
  const run = harness();
  assert.equal(await run.run(), 0);
  assert.deepEqual(run.calls, ["build", "electron-abi", "launch", "node-abi"]);
});

test("a build failure returns without an unnecessary restore", async () => {
  const run = harness({ build: { code: 2, signal: null } });
  assert.equal(await run.run(), 2);
  assert.deepEqual(run.calls, ["build"]);
});

test("a failed Electron rebuild still restores Node", async () => {
  const run = harness({ "electron-abi": { code: 3, signal: null } });
  assert.equal(await run.run(), 3);
  assert.deepEqual(run.calls, ["build", "electron-abi", "node-abi"]);
});

test("an app failure is reported only after the Node restore", async () => {
  const run = harness({ launch: { code: 4, signal: null } });
  assert.equal(await run.run(), 4);
  assert.deepEqual(run.calls, ["build", "electron-abi", "launch", "node-abi"]);
});

test("a restore failure warns loudly and overrides a green launch", async () => {
  const run = harness({ "node-abi": { code: 5, signal: null } });
  assert.equal(await run.run(), 1);
  assert.match(run.stderr(), /WARNING: ABI restore failed/);
  assert.match(run.stderr(), /npm run rebuild:node/);
});

for (const [signal, exitCode, stage] of [
  ["SIGINT", 130, "electron-abi"],
  ["SIGTERM", 143, "launch"],
]) {
  test(`${signal} stops ${stage} and restores Node`, async () => {
    const run = harness({
      [stage]: ({ signalSource }) => {
        signalSource.emit(signal);
        return { code: null, signal };
      },
    });
    assert.equal(await run.run(), exitCode);
    assert.deepEqual(run.calls.at(-1), "node-abi");
    assert.deepEqual(run.killed, [{ step: stage, signal }]);
  });
}

test("an interrupt cannot cancel a restore already in progress", async () => {
  const run = harness({
    "node-abi": ({ signalSource }) => {
      signalSource.emit("SIGINT");
      return { code: 0, signal: null };
    },
  });
  assert.equal(await run.run(), 130);
  assert.deepEqual(run.calls.at(-1), "node-abi");
  assert.deepEqual(run.killed, []);
  assert.match(run.stderr(), /waiting for the mandatory Node ABI restore/);
});
