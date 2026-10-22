// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Spex's Git credential helper (git-host-9), run by Git on the app's own
// runtime in one of two modes.
//
// For one Git child of the core's, as `"<runtime>" "<this file>"
// <operation>`, it answers `get` with the username and password in the
// file named by SPEX_GIT_CREDENTIAL_FILE — written owner-only by the core
// for that child and removed when the child ends.
//
// On a seat, in its member mode, as `"<runtime>" "<this file>" --member
// "<store>" <operation>`, named by the seat account's own Git
// configuration (core-service-125), it needs no running core: it answers
// `get` for an http or https host the member placed a token for in the
// store, `local/code-credentials.yaml` (storage-44), with the entry's
// username, else `token`, and its token. For any other protocol or host,
// a store that will not read or an entry that is malformed, it answers
// nothing, so the account's other helpers serve the request.
//
// Either mode ignores `store` and `erase`, so no secret reaches another
// helper's store from here, and writes a secret nowhere but Git's reply.
// Git's request arrives on stdin and is read to its end first.

import { readFileSync } from "node:fs";

const MEMBER_MODE_ARG = "--member";
const args = process.argv.slice(2);
const store = args[0] === MEMBER_MODE_ARG ? args[1] : undefined;
const operation = store === undefined ? args[0] : args[2];

const request = [];
process.stdin.on("data", (chunk) => request.push(chunk));
process.stdin.on("error", () => {});
process.stdin.on("end", () => {
  const answered = store === undefined
    ? answerChild()
    : answerMember(store, Buffer.concat(request).toString("utf8"));
  // Nothing is said on a failure: Git reads an empty answer as none.
  Promise.resolve(answered).catch(() => {});
});

function answerChild() {
  if (operation !== "get") return;
  const file = process.env.SPEX_GIT_CREDENTIAL_FILE;
  if (!file) return;
  let lines;
  try {
    lines = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const kept = lines
    .split("\n")
    .filter((line) => line.startsWith("username=") || line.startsWith("password="));
  if (kept.length === 0) return;
  process.stdout.write(`${kept.join("\n")}\n\n`);
}

/** The username sent with a token whose entry names none: hosts taking a
 * token as the password accept any username. */
const TOKEN_USERNAME = "token";
/** The port a URL of each protocol leaves unnamed, which a remote's host
 * as the member names it leaves out too. */
const DEFAULT_PORT = { http: "80", https: "443" };

async function answerMember(path, text) {
  if (operation !== "get" || !path) return;
  const fields = new Map();
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && !fields.has(line.slice(0, at))) fields.set(line.slice(0, at), line.slice(at + 1));
  }
  const protocol = fields.get("protocol");
  if (protocol !== "http" && protocol !== "https") return;
  const host = hostOf(fields.get("host") ?? "", DEFAULT_PORT[protocol]);
  if (host === null) return;
  const entry = await entryOf(path, host);
  if (entry === null) return;
  process.stdout.write(`username=${entry.username ?? TOKEN_USERNAME}\npassword=${entry.token}\n\n`);
}

/** A host as the store keys it: lowercase, a DNS name with an optional
 * port, the protocol's default port left out; null for anything else. */
function hostOf(name, defaultPort) {
  const host = canonicalHost(name);
  if (host === null) return null;
  return host.endsWith(`:${defaultPort}`) ? host.slice(0, -(defaultPort.length + 1)) : host;
}

// The store's own rules (storage-44), as the core reads them: the file
// of format 1 with exactly its three fields, and an entry keyed by a
// canonical host holding a token and an optional username, each one line
// of text. Anything else is refused, and so answers nothing.

function canonicalHost(name) {
  const at = name.lastIndexOf(":");
  const hostname = (at < 0 ? name : name.slice(0, at)).toLowerCase();
  const port = at < 0 ? null : name.slice(at + 1);
  if (hostname.length === 0 || hostname.length > 253) return null;
  if (!hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (port !== null && !(/^[1-9][0-9]{0,4}$/.test(port) && Number(port) <= 65_535)) return null;
  return port === null ? hostname : `${hostname}:${port}`;
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isLine = (value) => typeof value === "string" && value.trim() !== "" && !/[\u0000-\u001f\u007f]/.test(value);

async function entryOf(path, host) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let parse;
  try {
    ({ parse } = await import("yaml"));
  } catch {
    return null;
  }
  let doc;
  try {
    doc = parse(text);
  } catch {
    return null;
  }
  if (!isObject(doc) || doc.format !== 1 || !isObject(doc.hosts) || !isObject(doc.agents)) return null;
  if (!Object.keys(doc).every((field) => field === "format" || field === "hosts" || field === "agents")) return null;
  if (!Object.hasOwn(doc.hosts, host)) return null;
  const entry = doc.hosts[host];
  if (canonicalHost(host) !== host || !isObject(entry)) return null;
  if (!Object.keys(entry).every((field) => field === "token" || field === "username")) return null;
  if (!isLine(entry.token) || !(entry.username === undefined || isLine(entry.username))) return null;
  return entry;
}
