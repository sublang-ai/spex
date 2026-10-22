// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Seat coverage (SERVER-SHELL-26): the server shell started as a seat of
// a team server, from code and as a real child against the stand-in
// instance — its token read from a file and printed nowhere, its Unix
// socket admitting the hub's handshake with the token alone, its device
// request naming the server and the person, and each startup refusal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { startStandinHost } from "@sublang/spex-core/testing";

import { parseArgs, serverCoreOptions, startSeat, startServer } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
const SEAT = { serverId: "srv_7f3a", serverName: "lab-1", personId: "1001" };
const TOKEN = "seat-token-4f9c2e7a";

const scratchDirs: string[] = [];
test.after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

/** A scratch directory short enough to hold a Unix socket's path, which
 * the platforms bound near a hundred bytes. */
function scratchDir(prefix: string): string {
  const base = tmpdir().length > 60 ? "/tmp" : tmpdir();
  const dir = mkdtempSync(join(base, prefix));
  scratchDirs.push(dir);
  return dir;
}

/** A seat's scratch: the token file holding the token amid whitespace,
 * as a helper writes it with its line end, and the runtime directory
 * the socket goes in, made beforehand as the hub's helper makes it. */
function seatScratch(): { dir: string; tokenFile: string; socket: string; dataDir: string; configPath: string } {
  const dir = scratchDir("spex-seat-");
  const tokenFile = join(dir, "token");
  writeFileSync(tokenFile, `  ${TOKEN}\n`);
  return {
    dir,
    tokenFile,
    socket: join(dir, "core.sock"),
    dataDir: join(dir, "state"),
    configPath: join(dir, "playbook.config.yaml"),
  };
}

function seatArgs(scratch: ReturnType<typeof seatScratch>): string[] {
  return [
    "--seat",
    `--server-id=${SEAT.serverId}`,
    `--server-name=${SEAT.serverName}`,
    `--person-id=${SEAT.personId}`,
    `--token-file=${scratch.tokenFile}`,
    `--socket=${scratch.socket}`,
    `--data-dir=${scratch.dataDir}`,
    `--config=${scratch.configPath}`,
  ];
}

/** A socket file nothing listens on any more: its listener killed
 * before it could remove it. */
async function staleSocket(path: string): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `require("node:net").createServer().listen(${JSON.stringify(path)}, () => process.kill(process.pid, "SIGKILL"))`,
    ],
    { stdio: "ignore" },
  );
  await new Promise((resolveExit) => child.once("exit", resolveExit));
  assert.ok(lstatSync(path).isSocket(), "a stale socket is left");
}

/** A connection to a seat's socket the way the hub opens one: the
 * `ws+unix:` form, no Origin. */
function seatSocket(socket: string, token?: string): WebSocket {
  const query = token === undefined ? "" : `?token=${encodeURIComponent(token)}`;
  return new WebSocket(`ws+unix:${socket}:/${query}`, { perMessageDeflate: false });
}

/** The handshake's outcome: the core's hello, or the refusal's cause. */
function handshake(socket: string, token?: string): Promise<{ hello: string } | { refused: string }> {
  return new Promise((resolveHandshake) => {
    const client = seatSocket(socket, token);
    client.once("message", (data) => {
      client.close();
      resolveHandshake({ hello: (JSON.parse(String(data)) as { type: string }).type });
    });
    client.once("error", (error) => resolveHandshake({ refused: error.message }));
  });
}

interface Message {
  type: string;
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  state?: {
    signIn: { phase: string };
    instances: { origin: string; signedIn: boolean }[];
  };
}

/** A client of a seat's core over its socket. */
async function seatClient(socket: string, token: string) {
  const client = seatSocket(socket, token);
  const messages: Message[] = [];
  client.on("message", (data) => messages.push(JSON.parse(String(data)) as Message));
  await new Promise<void>((resolveOpen, rejectOpen) => {
    client.once("open", resolveOpen);
    client.once("error", rejectOpen);
  });
  const waitFor = async (check: (message: Message) => boolean, timeoutMs = 30_000): Promise<Message> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = messages.find(check);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(`timed out; seen ${JSON.stringify(messages.map((message) => message.type))}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  };
  await waitFor((message) => message.type === "hello");
  let next = 0;
  return {
    messages,
    waitFor,
    async command(type: string, fields: Record<string, unknown> = {}): Promise<Message> {
      const id = `s${(next += 1)}`;
      client.send(JSON.stringify({ type, id, ...fields }));
      return waitFor((message) => message.type === "reply" && message.id === id);
    },
    close: () => client.close(),
  };
}

test("a seat's flags, in both forms, boot the core as that seat with the file's token and no label of the shell's own (SERVER-SHELL-26)", () => {
  const scratch = seatScratch();
  const options = parseArgs(
    [
      "--seat",
      "--server-id",
      SEAT.serverId,
      `--server-name=${SEAT.serverName}`,
      "--person-id",
      SEAT.personId,
      "--token-file",
      scratch.tokenFile,
      `--socket=${scratch.socket}`,
      "--shared-env",
      "agents.env",
    ],
    { SPEX_TOKEN: "from-the-environment" },
  );
  // The token is the file's, trimmed, whatever SPEX_TOKEN says
  // (server-shell-25).
  assert.equal(options.token, TOKEN);
  assert.deepEqual(options.seat, {
    ...SEAT,
    socket: scratch.socket,
    sharedCredentialFile: resolve("agents.env"),
  });

  // The core runs as the seat, its shared credential file the one named,
  // and the shell sets no label: the core labels the device by the
  // server's name (server-shell-25, core-service-125).
  const core = serverCoreOptions(options, createHttpServer());
  assert.deepEqual(core.seat, { ...SEAT, sharedCredentialFile: resolve("agents.env") });
  assert.equal(core.token, TOKEN);
  assert.equal(core.runtimeLabel, undefined);
  assert.equal(core.signIn, "device");

  // Without --shared-env the core's seat names no shared file.
  const plain = parseArgs(seatArgs(scratch), {});
  assert.deepEqual(serverCoreOptions(plain, createHttpServer()).seat, SEAT);
});

test("a seat started from code clears a stale socket, listens group-accessible on its Unix socket and refuses a non-socket file there (SERVER-SHELL-26)", { skip: process.platform === "win32" }, async () => {
  const scratch = seatScratch();
  const options = parseArgs(seatArgs(scratch), {});
  // A seat listens on its socket alone, never through startServer.
  await assert.rejects(startServer(options), /start it with startSeat/);

  // A socket a stopped seat left behind is removed before listening
  // (server-shell-25).
  await staleSocket(scratch.socket);
  const running = await startSeat(options);
  try {
    assert.equal(running.socket, scratch.socket);
    assert.ok(lstatSync(scratch.socket).isSocket());
    // Owner and group read and write it, nobody else: the runtime
    // directory's group is the hub's (hub-4), so the hub reaches it.
    assert.equal(statSync(scratch.socket).mode & 0o777, 0o660);
    assert.deepEqual(await handshake(scratch.socket, TOKEN), { hello: "hello" });
    const refused = await handshake(scratch.socket);
    assert.ok("refused" in refused && /401/.test(refused.refused), JSON.stringify(refused));

    // A live seat's socket is no stale one: a second start is refused.
    const second = seatScratch();
    await assert.rejects(
      startSeat({ ...parseArgs(seatArgs(second), {}), seat: { ...SEAT, socket: scratch.socket } }),
      /is in use/,
    );
    assert.equal(existsSync(second.dataDir), false, "nothing started");
  } finally {
    await running.close();
  }
  assert.equal(existsSync(scratch.socket), false, "the stop removes the socket");

  // Another kind of file at the path is never removed: refused, left
  // as it was, before anything starts.
  const other = seatScratch();
  writeFileSync(other.socket, "not a socket");
  await assert.rejects(startSeat(parseArgs(seatArgs(other), {})), /not a socket/);
  assert.equal(readFileSync(other.socket, "utf8"), "not a socket");
  assert.equal(existsSync(other.dataDir), false, "nothing started");
});

test("a seat child reads its token from the file, prints it nowhere, admits the hub's handshake with it alone, and names the server and the person at sign-in (SERVER-SHELL-26)", { skip: process.platform === "win32" }, async () => {
  const host = await startStandinHost({ dir: scratchDir("spex-seat-host-") });
  const scratch = seatScratch();
  await staleSocket(scratch.socket);
  const child = spawn(process.execPath, [resolve(here, "main.js"), ...seatArgs(scratch)], {
    stdio: ["ignore", "pipe", "pipe"],
    // A token in the environment is not the seat's: the file's is.
    env: { ...process.env, SPEX_HOST_URL: host.url, SPEX_TOKEN: "from-the-environment" },
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (data) => (out += data));
  child.stderr.on("data", (data) => (err += data));
  try {
    await new Promise<void>((resolveUp, rejectUp) => {
      const deadline = setTimeout(() => {
        clearInterval(poll);
        rejectUp(new Error(`the seat never listened; stdout: ${out}; stderr: ${err}`));
      }, 20_000);
      const poll = setInterval(() => {
        if (out.includes(`listening at ${scratch.socket}`)) {
          clearTimeout(deadline);
          clearInterval(poll);
          resolveUp();
        }
      }, 50);
    });
    // No access URL is printed (server-shell-25).
    assert.doesNotMatch(out, /serving at|token=|ssh -N/);
    assert.equal(statSync(scratch.socket).mode & 0o777, 0o660);

    // The socket admits the file's token and refuses none, another, or
    // the environment's (server-shell-25).
    assert.deepEqual(await handshake(scratch.socket, TOKEN), { hello: "hello" });
    for (const token of [undefined, "wrong", "from-the-environment"]) {
      const refused = await handshake(scratch.socket, token);
      assert.ok("refused" in refused && /401/.test(refused.refused), `${token}: ${JSON.stringify(refused)}`);
    }

    // A sign-in over the socket: the device request names the server and
    // the person under the server's name (server-shell-25, git-host-27).
    const client = await seatClient(scratch.socket, TOKEN);
    try {
      const started = await client.command("space.signin.start", { url: host.url });
      assert.ok(started.ok, JSON.stringify(started));
      const flow = started.result as { flow: string; userCode: string };
      assert.equal(flow.flow, "device");
      host.script.approveDevice(flow.userCode);
      await client.waitFor(
        (message) =>
          message.type === "space.state" &&
          message.state?.signIn.phase === "idle" &&
          message.state.instances.some((instance) => instance.origin === host.url && instance.signedIn),
      );
      assert.deepEqual(host.script.deviceRequests, [
        { label: `Spex on ${SEAT.serverName}`, serverId: SEAT.serverId, personId: SEAT.personId },
      ]);
    } finally {
      client.close();
    }

    const exited = new Promise<number | null>((resolveExit) => child.once("exit", (code) => resolveExit(code)));
    child.kill("SIGTERM");
    assert.equal(await exited, 0);
    assert.equal(existsSync(scratch.socket), false, "the stop removes the socket");
    // The token appears in no output (server-shell-25).
    assert.equal(out.includes(TOKEN), false, "stdout carries no token");
    assert.equal(err.includes(TOKEN), false, "stderr carries no token");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const reaped = new Promise((resolveExit) => child.once("exit", resolveExit));
      child.kill("SIGKILL");
      await reaped;
    }
    await host.close();
  }
});

/** Run the shell with these arguments to its exit. */
function runShell(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [resolve(here, "main.js"), ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (data) => (out += data));
    child.stderr.on("data", (data) => (err += data));
    const deadline = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.once("exit", (code) => {
      clearTimeout(deadline);
      resolveRun({ code, out, err });
    });
  });
}

test("each seat startup refusal exits non-zero naming the mistake before anything starts (SERVER-SHELL-26)", { skip: process.platform === "win32" }, async () => {
  const without = (args: string[], flag: string) => args.filter((arg) => !arg.startsWith(`--${flag}`));
  const cases: { name: string; args: (scratch: ReturnType<typeof seatScratch>) => string[]; refusal: RegExp; setup?: (scratch: ReturnType<typeof seatScratch>) => void }[] = [
    { name: "a seat flag without --seat", args: (s) => [`--socket=${s.socket}`], refusal: /--socket is a seat's flag: it needs --seat/ },
    { name: "--shared-env without --seat", args: () => ["--shared-env=/etc/spex/agents.env"], refusal: /--shared-env is a seat's flag: it needs --seat/ },
    ...(["server-id", "server-name", "person-id", "token-file", "socket"] as const).map((flag) => ({
      name: `--seat without --${flag}`,
      args: (s: ReturnType<typeof seatScratch>) => without(seatArgs(s), flag),
      refusal: new RegExp(`--seat needs --${flag}, .*missing or empty`),
    })),
    { name: "an empty id", args: (s) => [...without(seatArgs(s), "server-id"), "--server-id="], refusal: /--seat needs --server-id, .*missing or empty/ },
    { name: "a blank name", args: (s) => [...without(seatArgs(s), "server-name"), "--server-name=  "], refusal: /--seat needs --server-name, .*missing or empty/ },
    { name: "--token beside --token-file", args: (s) => [...seatArgs(s), "--token=other"], refusal: /--token cannot stand beside --token-file/ },
    ...(["--host=127.0.0.1", "--port=0", "--tls-cert=cert.pem", "--tls-key=key.pem", "--insecure"] as const).map((flag) => ({
      name: `${flag} beside --socket`,
      args: (s: ReturnType<typeof seatScratch>) => [...seatArgs(s), flag],
      refusal: new RegExp(`${flag.replace(/=.*/, "")} cannot stand beside --socket`),
    })),
    { name: "an unreadable token file", args: (s) => [...without(seatArgs(s), "token-file"), `--token-file=${join(s.dir, "absent")}`], refusal: /cannot read the token file .*absent \(ENOENT\)/ },
    { name: "an empty token", args: seatArgs, setup: (s) => writeFileSync(s.tokenFile, " \n"), refusal: /the token file .* holds no token/ },
    { name: "a file not a socket at --socket", args: seatArgs, setup: (s) => writeFileSync(s.socket, "kept"), refusal: /--socket .*core\.sock names a file that is not a socket/ },
  ];
  await Promise.all(
    cases.map(async ({ name, args, refusal, setup }) => {
      const scratch = seatScratch();
      setup?.(scratch);
      const run = await runShell(args(scratch));
      assert.notEqual(run.code, 0, `${name}: exits non-zero`);
      assert.match(run.err, refusal, name);
      assert.equal(`${run.out}${run.err}`.includes(TOKEN), false, `${name}: no token in the output`);
      assert.equal(existsSync(scratch.dataDir), false, `${name}: nothing started`);
    }),
  );
  // The file at the socket's path is left as it was.
  const kept = seatScratch();
  writeFileSync(kept.socket, "kept");
  assert.notEqual((await runShell(seatArgs(kept))).code, 0);
  assert.equal(readFileSync(kept.socket, "utf8"), "kept");
});

test("a socket whose probe fails other than by a refusal is no stale one: it is left and startup refused, in use, naming the path and the code (SERVER-SHELL-26)", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async () => {
  // A live socket of mode 0000 fails the probe with EACCES, not a
  // refusal; the superuser would reach it, so the case runs as another.
  const scratch = seatScratch();
  const listener = createNetServer();
  await new Promise<void>((resolveListen) => listener.listen(scratch.socket, resolveListen));
  try {
    chmodSync(scratch.socket, 0o000);
    // A seat that wrongly starts is stopped again, so the case fails
    // rather than hangs.
    const started = startSeat(parseArgs(seatArgs(scratch), {})).then(async (running) => {
      await running.close();
      return running;
    });
    await assert.rejects(started, (error: Error) => {
      assert.ok(error.message.startsWith(`--socket ${scratch.socket} is in use: `), error.message);
      assert.match(error.message, /failed with EACCES, not a refusal/);
      assert.equal(error.message.includes(TOKEN), false, "the refusal carries no token");
      return true;
    });
    assert.ok(lstatSync(scratch.socket).isSocket(), "the socket is left");
    assert.equal(existsSync(scratch.dataDir), false, "nothing started");
  } finally {
    await new Promise<void>((resolveClose) => listener.close(() => resolveClose()));
  }
});

test("a socket that cannot be bound refuses startup naming the cause in one line, as a flag mistake does (SERVER-SHELL-26)", { skip: process.platform === "win32" }, async () => {
  // A Unix socket's path fits its address's sun_path, whose size the
  // platform sets.
  const pathMax = process.platform === "linux" ? 108 : 104;
  const cases = [
    {
      name: "a directory that does not exist",
      socket: (dir: string) => join(dir, "missing", "core.sock"),
      cause: /: its directory .*missing does not exist \(E[A-Z]+\)$/,
    },
    {
      // Refused before anything starts, on every Node version: none
      // binds a socket at the path cut short.
      name: "a path too long",
      socket: (dir: string) => join(dir, `${"x".repeat(120)}.sock`),
      cause: new RegExp(`: the path is longer than a Unix socket's ${pathMax} bytes \\(ENAMETOOLONG\\)$`),
      unstarted: true,
    },
  ];
  for (const { name, socket, cause, unstarted } of cases) {
    const scratch = seatScratch();
    const path = socket(scratch.dir);
    const args = [...seatArgs(scratch).filter((arg) => !arg.startsWith("--socket")), `--socket=${path}`];
    const run = await runShell(args);
    // A bind that fails after the core booted stops the core, and the
    // shell exits on its own, its refusal the bind's cause and no stack
    // trace — a failed stop would name its own cause instead.
    assert.equal(run.code, 1, `${name}: exits non-zero; stderr: ${run.err}`);
    const lines = run.err.trim().split("\n");
    assert.equal(lines.length, 1, `${name}: one line; stderr: ${run.err}`);
    assert.ok(lines[0].startsWith(`--socket ${path} cannot be bound`), `${name}: ${lines[0]}`);
    assert.match(lines[0], cause, name);
    assert.equal(`${run.out}${run.err}`.includes(TOKEN), false, `${name}: no token in the output`);
    if (unstarted) {
      assert.equal(existsSync(scratch.dataDir), false, `${name}: nothing started`);
      assert.deepEqual(readdirSync(scratch.dir), ["token"], `${name}: no socket is left`);
    }
  }
});
