// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A stand-in Git host for the core's tests: Git's own smart-HTTP
// backend behind an in-process server that asks for Basic credentials,
// so a Git source fetched through a credential (environments-13) is
// fetched for real. `testCredentialArgs` hands Git a credential the way
// the core does — a credential helper reading an owner-only temporary
// file, every other helper cleared.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import type { CredentialArgs } from "../environment/git-source.js";

export interface GitHttpHost {
  url: string;
  /** Requests answered 401 for a missing or wrong credential. */
  readonly refused: number;
  close(): Promise<void>;
}

/** Serve the bare repositories under `root` over smart HTTP, to
 * `username` with `password` only. */
export async function startGitHttpHost(options: { root: string; username: string; password: string }): Promise<GitHttpHost> {
  const expected = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;
  let refused = 0;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.authorization !== expected) {
      refused += 1;
      res.writeHead(401, { "www-authenticate": 'Basic realm="stand-in git host"', "content-type": "text/plain" });
      res.end("credential required\n");
      return;
    }
    const url = new URL(req.url ?? "/", "http://host");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_PROJECT_ROOT: options.root,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: decodeURIComponent(url.pathname),
      QUERY_STRING: url.search.replace(/^\?/, ""),
      REQUEST_METHOD: req.method ?? "GET",
      CONTENT_TYPE: req.headers["content-type"] ?? "",
      REMOTE_USER: options.username,
      REMOTE_ADDR: "127.0.0.1",
      GATEWAY_INTERFACE: "CGI/1.1",
      SERVER_PROTOCOL: "HTTP/1.1",
      ...(req.headers["content-length"] ? { CONTENT_LENGTH: String(req.headers["content-length"]) } : {}),
      ...(req.headers["content-encoding"] ? { HTTP_CONTENT_ENCODING: String(req.headers["content-encoding"]) } : {}),
      ...(req.headers["git-protocol"] ? { GIT_PROTOCOL: String(req.headers["git-protocol"]) } : {}),
    };
    const child = spawn("git", ["http-backend"], { env, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.resume();
    req.pipe(child.stdin);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    const output = Buffer.concat(out);
    let split = output.indexOf("\r\n\r\n");
    let gap = 4;
    if (split === -1) { split = output.indexOf("\n\n"); gap = 2; }
    if (code !== 0 && split === -1) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("git http-backend failed\n");
      return;
    }
    const head = output.subarray(0, split).toString("utf8");
    const headers: Record<string, string> = {};
    let status = 200;
    for (const line of head.split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon <= 0) continue;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key.toLowerCase() === "status") status = Number(value.split(" ")[0]) || 200;
      else headers[key] = value;
    }
    res.writeHead(status, headers);
    res.end(output.subarray(split + gap));
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    get refused() { return refused; },
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/** Credential arguments as the core gives Git a credential: every
 * configured helper cleared, then one helper that answers `get` from an
 * owner-only temporary file, removed after the command. */
export function testCredentialArgs(dir: string): CredentialArgs {
  return async (credential) => {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `credential-${randomUUID()}`);
    writeFileSync(file, `username=${credential.username}\npassword=${credential.secret}\n`, { mode: 0o600 });
    return {
      env: {},
      configArgs: ["-c", "credential.helper=", "-c", `credential.helper=!f() { test "$1" = get && cat '${file}'; }; f`],
      dispose: () => rmSync(file, { force: true }),
    };
  };
}
