// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The `spex-hub` command line (hub-1, hub-6): `attach`, `serve`, and
// the administrator's `status`, `evict <id>` and `retire`. The three
// commands ask the running hub over its control socket, an owner-only
// Unix socket in the state directory; with no hub running they act on
// the state files and the helper themselves.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { attach } from "./attach.js";
import { DEFAULT_HELPER, DEFAULT_SUDO, type HelperConfig } from "./helper.js";
import {
  askHub,
  RENEW_INTERVAL_MS,
  SEAT_TIMEOUT_MS,
  startHub,
  type ControlAnswer,
  type ControlRequest,
} from "./hub.js";
import { DEFAULT_RUN_DIR } from "./seat.js";
import { SeatBook, type SeatStatus } from "./seats.js";
import { DEFAULT_STATE_DIR, PERSON_ID, readState } from "./state.js";

export const USAGE = `usage: spex-hub <command> [options]

  attach --instance <url> --server-id <id> --address <https origin>
         --tls-cert <file> --tls-key <file> [--token-file <file>]
      Keep the server the instance registered; the server token is read
      from --token-file or standard input, never from the command line.
  serve [--host <addr>] [--port <n>]
      Serve the attached address: admissions, relays and lease renewal.
  status            List each seat, its unit, its lease and its relay.
  evict <id>        End that seat's lease at once and stop the seat.
  retire            End every lease, stop and wipe every seat, forget
                    the server token.

common options:
  --state-dir <dir>   the hub's state (default ${DEFAULT_STATE_DIR})
  --run-dir <dir>     the seats' runtime directories (default ${DEFAULT_RUN_DIR})
  --helper <path>     spex-seatctl (default ${DEFAULT_HELPER})
  --sudo <path>       sudo, or empty to run the helper directly (default ${DEFAULT_SUDO})`;

export class UsageError extends Error {}

const COMMON = ["state-dir", "run-dir", "helper", "sudo"];
const FLAGS: Record<string, string[]> = {
  attach: ["instance", "server-id", "address", "tls-cert", "tls-key", "token-file", ...COMMON],
  serve: ["host", "port", "renew-interval-ms", "seat-timeout-ms", ...COMMON],
  status: COMMON,
  evict: COMMON,
  retire: COMMON,
};

interface Parsed {
  command: string;
  flags: Map<string, string>;
  positionals: string[];
}

export function parseCommandLine(argv: string[]): Parsed {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", flags: new Map(), positionals: [] };
  }
  const allowed = FLAGS[command];
  if (!allowed) throw new UsageError(`unknown command: ${command}`);
  const flags = new Map<string, string>();
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    if (name === "token") {
      throw new UsageError(
        "the server token is never taken from the command line: pass --token-file <file> or pipe it to standard input",
      );
    }
    if (!allowed.includes(name)) throw new UsageError(`${command} takes no --${name}`);
    let value: string;
    if (equals >= 0) value = arg.slice(equals + 1);
    else {
      if (index + 1 >= rest.length) throw new UsageError(`--${name} needs a value`);
      value = rest[++index];
    }
    flags.set(name, value);
  }
  const expected = command === "evict" ? 1 : 0;
  if (positionals.length !== expected) {
    throw new UsageError(
      expected ? `${command} takes one seat id` : `${command} takes no argument ${JSON.stringify(positionals[0])}`,
    );
  }
  return { command, flags, positionals };
}

function integer(flags: Map<string, string>, name: string, min: number, max: number): number | undefined {
  const value = flags.get(name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new UsageError(`--${name} must be an integer from ${min} to ${max}`);
  }
  return number;
}

function helperConfig(flags: Map<string, string>): HelperConfig {
  const sudo = flags.get("sudo") ?? DEFAULT_SUDO;
  return { helper: flags.get("helper") ?? DEFAULT_HELPER, sudo: sudo === "" ? null : sudo };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    const lines = createInterface({ input: process.stdin, terminal: false });
    process.stderr.write("Paste the server token, then press Enter: ");
    const line = await new Promise<string>((resolveLine) => {
      lines.once("line", resolveLine);
      lines.once("close", () => resolveLine(""));
    });
    lines.close();
    return line;
  }
  return new Promise((resolveRead, rejectRead) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      text += chunk;
    });
    process.stdin.once("end", () => resolveRead(text));
    process.stdin.once("error", rejectRead);
  });
}

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

function formatStatus(seats: SeatStatus[], running: boolean): string[] {
  const rows = seats.map((seat) => [
    seat.id,
    seat.login,
    seat.running ? "running" : "stopped",
    `${seat.active ? "until" : "ended"} ${seat.expires_at}`,
    running ? (seat.relay ? "open" : "none") : "-",
  ]);
  const header = ["PERSON", "LOGIN", "UNIT", "LEASE", "RELAY"];
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column].length)),
  );
  const line = (row: string[]) =>
    row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column]))).join("  ");
  return [line(header), ...rows.map(line)];
}

async function administer(parsed: Parsed, io: Io): Promise<number> {
  const stateDir = parsed.flags.get("state-dir") ?? DEFAULT_STATE_DIR;
  const request: ControlRequest =
    parsed.command === "evict"
      ? { op: "evict", id: parsed.positionals[0] }
      : parsed.command === "retire"
        ? { op: "retire" }
        : { op: "status" };
  if (request.op === "evict" && !PERSON_ID.test(request.id)) {
    throw new UsageError(`no seat id: ${JSON.stringify(request.id)}: a seat is named by its person's numeric id`);
  }
  let answer: ControlAnswer | undefined = await askHub(stateDir, request);
  const running = answer !== undefined;
  const state = readState(stateDir);
  if (!state) {
    io.err(`spex-hub: no server is attached in ${stateDir}`);
    return 1;
  }
  if (!answer) {
    // No hub runs: act on the state files and the helper directly.
    const book = new SeatBook(
      {
        stateDir,
        runDir: parsed.flags.get("run-dir") ?? DEFAULT_RUN_DIR,
        helper: helperConfig(parsed.flags),
        seatTimeoutMs: SEAT_TIMEOUT_MS,
        log: () => {},
      },
      state,
    );
    try {
      if (request.op === "status") {
        answer = {
          ok: true,
          seats: await book.status(),
          server: {
            id: state.server_id,
            name: state.name,
            instance: state.instance,
            address: state.address,
            attached: state.token !== null,
          },
        };
      } else if (request.op === "evict") {
        answer = { ok: true, evicted: await book.evict(request.id) };
      } else {
        const result = await book.retire();
        answer = { ok: true, retired: result.seats, failures: result.failures };
      }
    } finally {
      await book.close();
    }
  }
  if (!answer.ok) {
    io.err(`spex-hub: ${answer.error}`);
    return 1;
  }
  if ("seats" in answer) {
    const name = answer.server.name === null ? "" : ` (${answer.server.name})`;
    io.out(
      `server ${answer.server.id}${name} of ${answer.server.instance} at ${answer.server.address}` +
        `${answer.server.attached ? "" : ", retired"}; ${running ? "the hub is running" : "the hub is not running"}`,
    );
    if (answer.seats.length === 0) io.out("no seats yet");
    else for (const line of formatStatus(answer.seats, running)) io.out(line);
    return 0;
  }
  if ("evicted" in answer) {
    if (!answer.evicted) {
      io.err(`spex-hub: no seat ${parsed.positionals[0]}`);
      return 1;
    }
    io.out(`evicted seat ${parsed.positionals[0]}: its lease ended and its seat stopped; its files stand`);
    return 0;
  }
  io.out(
    `retired: ${answer.retired} seat(s) stopped and their credentials wiped; the server token is forgotten`,
  );
  io.out(
    `the server's record and its seat devices stay at the instance until a group Owner retires the server at ${state.instance}/account/servers`,
  );
  for (const failure of answer.failures) io.err(`spex-hub: ${failure}`);
  return answer.failures.length ? 1 : 0;
}

export async function run(argv: string[], io: Io): Promise<number> {
  const parsed = parseCommandLine(argv);
  const { flags } = parsed;
  switch (parsed.command) {
    case "help":
      io.out(USAGE);
      return 0;
    case "attach": {
      const tokenFile = flags.get("token-file");
      let token: string;
      try {
        token = (tokenFile && tokenFile !== "-" ? readFileSync(tokenFile, "utf8") : await readStdin()).trim();
      } catch (error) {
        throw new Error(`--token-file ${tokenFile} is unreadable: ${(error as Error).message}`);
      }
      if (!token) {
        throw new Error("no server token: pass --token-file <file> or pipe it to standard input");
      }
      const stateDir = flags.get("state-dir") ?? DEFAULT_STATE_DIR;
      const state = attach(stateDir, {
        instance: flags.get("instance"),
        serverId: flags.get("server-id"),
        address: flags.get("address"),
        tlsCert: flags.get("tls-cert"),
        tlsKey: flags.get("tls-key"),
        token,
      });
      io.out(`attached server ${state.server_id} of ${state.instance}; the hub will serve ${state.address}`);
      io.out("start or restart the hub's service to serve it");
      return 0;
    }
    case "serve": {
      const log = (line: string) => io.out(`[spex-hub] ${line}`);
      const hub = await startHub({
        stateDir: flags.get("state-dir") ?? DEFAULT_STATE_DIR,
        runDir: flags.get("run-dir") ?? DEFAULT_RUN_DIR,
        helper: helperConfig(flags),
        host: flags.get("host") || undefined,
        port: integer(flags, "port", 0, 65535),
        renewIntervalMs: integer(flags, "renew-interval-ms", 1, 2 ** 31 - 1) ?? RENEW_INTERVAL_MS,
        seatTimeoutMs: integer(flags, "seat-timeout-ms", 1, 10 * 60 * 1000) ?? SEAT_TIMEOUT_MS,
        log,
      });
      const state = hub.book.state;
      log(`serving ${state.address} as server ${state.server_id} of ${state.instance} on port ${hub.port}`);
      const shutdown = () => void hub.close();
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      await hub.stopped;
      log(state.token ? "stopped; the seats and their leases stand" : "stopped: the server is retired");
      return 0;
    }
    default:
      return administer(parsed, io);
  }
}
