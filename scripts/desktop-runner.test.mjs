// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { runDesktop } from "./desktop-runner.mjs";

function harness(outcomes = {}, options = {}) {
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
        platform: options.platform ?? "win32",
        signalSource,
        stdout: { write: (text) => (stdout += text) },
        stderr: { write: (text) => (stderr += text) },
        killProcess: options.killProcess,
        escalationMs: options.escalationMs,
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

test("a restore failure preserves and reports an earlier failure", async () => {
  const run = harness({
    launch: { code: 4, signal: null },
    "node-abi": { code: 5, signal: null },
  });
  assert.equal(await run.run(), 4);
  assert.match(run.stderr(), /Electron launch exited 4/);
  assert.match(run.stderr(), /Node ABI restore exited 5/);
  assert.match(run.stderr(), /WARNING: ABI restore failed/);
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

test("a restore failure does not replace an interrupt status", async () => {
  const run = harness({
    launch: ({ signalSource }) => {
      signalSource.emit("SIGTERM");
      return { code: null, signal: "SIGTERM" };
    },
    "node-abi": { code: 5, signal: null },
  });
  assert.equal(await run.run(), 143);
  assert.match(run.stderr(), /WARNING: ABI restore failed/);
  assert.match(run.stderr(), /Node ABI restore exited 5/);
});

test("a vanished POSIX process group is tolerated", async () => {
  const error = Object.assign(new Error("already exited"), { code: "ESRCH" });
  const run = harness(
    {
      launch: ({ signalSource }) => {
        signalSource.emit("SIGTERM");
        return { code: null, signal: "SIGTERM" };
      },
    },
    {
      platform: "darwin",
      killProcess: () => {
        throw error;
      },
    },
  );
  assert.equal(await run.run(), 143);
  assert.doesNotMatch(run.stderr(), /could not signal/);
});

test("a signal during restore does not replace an earlier failure", async () => {
  const run = harness({
    launch: { code: 4, signal: null },
    "node-abi": ({ signalSource }) => {
      signalSource.emit("SIGINT");
      return { code: 5, signal: null };
    },
  });
  assert.equal(await run.run(), 4);
  assert.match(run.stderr(), /Electron launch exited 4/);
  assert.match(run.stderr(), /Node ABI restore exited 5/);
  assert.match(run.stderr(), /waiting for the mandatory Node ABI restore/);
});

// app-shell-26 §5, DR-093: a signalled app that does not exit within the
// bound is killed with its process group; one that exits in time is not.
test("a launch that ignores the signal is killed after the bound and Node is still restored", async () => {
  const killed = [];
  let killSignals;
  const run = harness(
    {
      launch: ({ signalSource }) =>
        new Promise((resolveLaunch) => {
          killSignals = (pid, signal) => {
            killed.push({ pid, signal });
            if (signal === "SIGKILL") resolveLaunch({ code: null, signal: "SIGKILL" });
          };
          signalSource.emit("SIGINT");
        }),
    },
    { platform: "linux", escalationMs: 20, killProcess: (pid, signal) => killSignals(pid, signal) },
  );
  assert.equal(await run.run(), 130);
  assert.deepEqual(killed.map((entry) => entry.signal), ["SIGINT", "SIGKILL"]);
  assert.ok(killed.every((entry) => entry.pid < 0), "the process group is signalled");
  assert.equal(run.calls.at(-1), "node-abi");
  assert.match(run.stderr(), /has not exited 20ms after SIGINT; killing it/);
});

test("a launch that exits within the bound is never killed", async () => {
  const killed = [];
  const run = harness(
    {
      launch: ({ signalSource }) => {
        signalSource.emit("SIGINT");
        return { code: null, signal: "SIGINT" };
      },
    },
    { platform: "linux", escalationMs: 20, killProcess: (pid, signal) => killed.push(signal) },
  );
  assert.equal(await run.run(), 130);
  await new Promise((resolveWait) => setTimeout(resolveWait, 60));
  assert.deepEqual(killed, ["SIGINT"]);
});
