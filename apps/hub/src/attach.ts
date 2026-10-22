// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex-hub attach` (hub-1): the instance's URL, the server's id and
// token as the instance's servers page showed them, the server's public
// https address and its TLS pair, checked and kept in the hub's own
// owner-only state. Run again, it replaces that state whole; the lease
// table — the seats — stands.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSecureContext } from "node:tls";

import { readState, writeState, type HubState } from "./state.js";

/** A server's id: 16 random bytes in canonical unpadded base64url. */
const SERVER_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;
/** A server token: `spexh_` and 43 characters. */
const SERVER_TOKEN = /^spexh_[A-Za-z0-9_-]{43}$/;

export interface AttachInput {
  instance?: string;
  serverId?: string;
  address?: string;
  tlsCert?: string;
  tlsKey?: string;
  token: string;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    /^127(\.\d{1,3}){3}$/.test(hostname)
  );
}

function bareOrigin(value: string, flag: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${flag} ${JSON.stringify(value)} is no URL`);
  }
  if (url.username || url.password) {
    throw new Error(`${flag} must carry no user`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${flag} must be an origin, with no path, query or fragment`);
  }
  return url;
}

/** The instance's origin: https, or http on a loopback host alone, so
 * the server token never crosses a network in the clear. */
export function parseInstance(value: string): string {
  const url = bareOrigin(value, "--instance");
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return url.origin;
  throw new Error("--instance must be an https URL");
}

/** The server's public address: an https origin, stored without the
 * trailing `/` as the instance stores it. */
export function parseAddress(value: string): string {
  const url = bareOrigin(value, "--address");
  if (url.protocol !== "https:") {
    throw new Error(`--address ${JSON.stringify(value)} is no https origin`);
  }
  return url.origin;
}

/** Read and pair the TLS material, refusing a certificate without its
 * key and a pair that does not match. */
export function checkTls(cert: string | undefined, key: string | undefined): void {
  if (cert === undefined && key === undefined) {
    throw new Error("--tls-cert and --tls-key are required: the hub serves https alone");
  }
  if (cert === undefined) throw new Error("--tls-cert is missing: a key needs its certificate");
  if (key === undefined) throw new Error("--tls-key is missing: a certificate needs its key");
  let certPem: Buffer;
  let keyPem: Buffer;
  try {
    certPem = readFileSync(cert);
  } catch (error) {
    throw new Error(`--tls-cert ${cert} is unreadable: ${(error as Error).message}`);
  }
  try {
    keyPem = readFileSync(key);
  } catch (error) {
    throw new Error(`--tls-key ${key} is unreadable: ${(error as Error).message}`);
  }
  try {
    createSecureContext({ cert: certPem, key: keyPem });
  } catch (error) {
    throw new Error(
      `--tls-cert and --tls-key are no matching pair: ${(error as Error).message}`,
    );
  }
}

export function checkAttach(input: AttachInput): HubState {
  if (!input.instance) throw new Error("--instance is required: the instance's URL");
  if (!input.serverId) throw new Error("--server-id is required: the id the servers page showed");
  if (!input.address) throw new Error("--address is required: the server's https address");
  const instance = parseInstance(input.instance);
  if (!SERVER_ID.test(input.serverId)) {
    throw new Error(
      "--server-id is in the wrong format: paste the server's id as the instance's servers page showed it",
    );
  }
  const address = parseAddress(input.address);
  if (!SERVER_TOKEN.test(input.token)) {
    throw new Error(
      "the server token is in the wrong format: it begins with spexh_ and has 43 characters after it, as the instance's servers page showed it",
    );
  }
  checkTls(input.tlsCert, input.tlsKey);
  return {
    instance,
    server_id: input.serverId,
    name: null,
    address,
    token: input.token,
    tls_cert: resolve(input.tlsCert as string),
    tls_key: resolve(input.tlsKey as string),
  };
}

/** Check and keep the attachment, replacing any earlier one whole. The
 * server's name is learned again from the instance, unless the server
 * is the one already attached. */
export function attach(stateDir: string, input: AttachInput): HubState {
  const state = checkAttach(input);
  let previous: HubState | undefined;
  try {
    previous = readState(stateDir);
  } catch {
    previous = undefined;
  }
  if (previous && previous.instance === state.instance && previous.server_id === state.server_id) {
    state.name = previous.name;
  }
  writeState(stateDir, state);
  return state;
}
