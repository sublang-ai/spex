// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The stand-in hub (hub-2, DR-132, DR-133): an in-process HTTPS server
// on 127.0.0.1 answering `POST /admit` as a team server's hub does, over
// a fixture certificate a test CA signs — a core under test trusts that
// CA through its own option, never by turning verification off. A
// ticket is redeemed through `redeem`, a stand-in instance's
// `redeemTicket` as a hub redeems it at the instance with its server
// token; an admission answers the seat's `wss:` endpoint under the
// address, a fresh bearer and the lease's expiry, and a test scripts the
// hub's own refusals: the instance's refusal relayed with its status and
// code, `502` for an instance it could not reach, `503` for a seat that
// did not start. Not re-exported from `./index.ts`.

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";

import type { StandinPerson, StandinRedemption } from "./standin-host.js";

/** The test CA, PEM: the one a core under test is told to trust beside
 * the system's (DR-133). A fixture of this suite alone. */
export const STANDIN_HUB_CA = `-----BEGIN CERTIFICATE-----
MIIBrDCCAVOgAwIBAgIUN6S5Xdct3oApw66ZsbZ4Y/io9rIwCgYIKoZIzj0EAwIw
JDEiMCAGA1UEAwwZU3BleCBzdGFuZC1pbiBodWIgdGVzdCBDQTAeFw0yNTAxMDEw
MDAwMDBaFw00NTAxMDEwMDAwMDBaMCQxIjAgBgNVBAMMGVNwZXggc3RhbmQtaW4g
aHViIHRlc3QgQ0EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATXQiBamZPWSCwX
0whIxeX+RKjE0t59SBrwmXMjmdM4Mblf1Bwjd/Rwn9JPOEBwZfcEdCcxkgYrVnYs
0TLdFF3Wo2MwYTAdBgNVHQ4EFgQUaGaN+biVCi2dcZtjcen//uGUsxAwHwYDVR0j
BBgwFoAUaGaN+biVCi2dcZtjcen//uGUsxAwDwYDVR0TAQH/BAUwAwEB/zAOBgNV
HQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwIDRwAwRAIgBRGhjrkQpC08D2EmpW7PXaM9
i5dviMkRx/pV5DysVBACID7Gnl/vHS7O27ktSJ8ctehjozPBomVt/VPR9olViu9S
-----END CERTIFICATE-----
`;

/** The hub's certificate, for `localhost` and `127.0.0.1`, signed by
 * the test CA, and its key: fixtures, valid 2025 to 2045. */
const HUB_CERT = `-----BEGIN CERTIFICATE-----
MIIBzTCCAXOgAwIBAgIUA6W30Kt/vbNC2eBZaEH0kwXsQywwCgYIKoZIzj0EAwIw
JDEiMCAGA1UEAwwZU3BleCBzdGFuZC1pbiBodWIgdGVzdCBDQTAeFw0yNTAxMDEw
MDAwMDBaFw00NTAxMDEwMDAwMDBaMBQxEjAQBgNVBAMMCWxvY2FsaG9zdDBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABLvNJsQ6OcYsxZyjoHn9ML7jBbM71tMikxRJ
UerWuFPZ5J3i3u3CYuyI345O3IpoMLaw+Q3supGB8aL6Xb2h0GajgZIwgY8wDAYD
VR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCB4AwEwYDVR0lBAwwCgYIKwYBBQUHAwEw
GgYDVR0RBBMwEYIJbG9jYWxob3N0hwR/AAABMB0GA1UdDgQWBBS5O61/oCuGhRrj
wYzPwA7K4dAQjjAfBgNVHSMEGDAWgBRoZo35uJUKLZ1xm2Nx6f/+4ZSzEDAKBggq
hkjOPQQDAgNIADBFAiAdwwXQ0nNTW9kods37wL52hKFve6GdDxXUAuQN9cJHiAIh
AN2CcBFqbCqqPP3TY9HLpFwRZoWh2qIIFSLfryr3CJ7f
-----END CERTIFICATE-----
`;
const HUB_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgO1laQJ6TIloL03QN
eYcU5ipNvOgUbgXWCAX926mbqi6hRANCAAS7zSbEOjnGLMWco6B5/TC+4wWzO9bT
IpMUSVHq1rhT2eSd4t7twmLsiN+OTtyKaDC2sPkN7LqRgfGi+l29odBm
-----END PRIVATE KEY-----
`;

/** One `POST /admit`, as the hub answered it: the ticket the body
 * carried — null where it carried none — the status, and, for an
 * admission, the endpoint and the bearer it issued. */
export interface StandinAdmission { ticket: string | null; status: number; endpoint: string | null; bearer: string | null }

export interface StandinHub {
  /** The hub's address, `https://127.0.0.1:<port>`: the origin a
   * server's record holds (servers-1). */
  url: string;
  /** The CA its certificate chains to, PEM. */
  ca: string;
  /** Every admission asked, in order. */
  admissions: StandinAdmission[];
  /** Answer the next `count` admissions with `status` and the envelope
   * `{error: {code, message}}`, the ticket left unspent: a hub relaying
   * the instance's refusal, `502` for the instance unreachable, `503`
   * for a seat that did not start (hub-2). */
  refuse(count: number, status: number, code: string, message: string): void;
  close(): Promise<void>;
}

export interface StandinHubOptions {
  /** The redemption of a ticket at the instance (servers-7); by default
   * every ticket admits `ada`. */
  redeem?: (ticket: string) => StandinRedemption | Promise<StandinRedemption>;
}

const DEFAULT_PERSON: StandinPerson = { id: "1001", login: "ada", displayName: "Ada Lovelace" };

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store" });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Start a stand-in hub on an OS-assigned loopback port. */
export async function startStandinHub(options: StandinHubOptions = {}): Promise<StandinHub> {
  const redeem = options.redeem ?? ((): StandinRedemption => ({
    person: DEFAULT_PERSON,
    server: { id: "standin-server", name: "Stand-in server" },
    leaseExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  }));
  const admissions: StandinAdmission[] = [];
  const refusals: { status: number; code: string; message: string }[] = [];
  const server = createServer({ cert: HUB_CERT, key: HUB_KEY });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const url = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const host = new URL(url).host;

  server.on("request", (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const path = new URL(req.url ?? "/", url).pathname;
      if (path !== "/admit") return json(res, 404, { error: { code: "not_found", message: "no such route" } });
      if (req.method !== "POST") return json(res, 405, { error: { code: "method_not_allowed", message: "POST /admit alone" } });
      let body: unknown;
      try { body = JSON.parse(await readBody(req)); } catch { body = undefined; }
      const ticket = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as { ticket?: unknown }).ticket : undefined;
      if (typeof ticket !== "string") {
        admissions.push({ ticket: null, status: 400, endpoint: null, bearer: null });
        return json(res, 400, { error: { code: "bad_request", message: "the body must be a JSON object {ticket} with a string ticket" } });
      }
      const refusal = refusals.shift();
      if (refusal) {
        admissions.push({ ticket, status: refusal.status, endpoint: null, bearer: null });
        return json(res, refusal.status, { error: { code: refusal.code, message: refusal.message } });
      }
      const answer = await redeem(ticket);
      if ("status" in answer) {
        // The instance's refusal, relayed with its status and code (hub-2).
        admissions.push({ ticket, status: answer.status, endpoint: null, bearer: null });
        return json(res, answer.status, { error: { code: answer.code, message: answer.message } });
      }
      const endpoint = `wss://${host}/seats/${answer.person.id}`;
      const bearer = randomBytes(32).toString("base64url");
      admissions.push({ ticket, status: 200, endpoint, bearer });
      return json(res, 200, {
        endpoint,
        bearer,
        lease_expires_at: answer.leaseExpiresAt,
        person: { id: answer.person.id, login: answer.person.login, display_name: answer.person.displayName },
      });
    })().catch(() => {
      if (!res.headersSent) json(res, 500, { error: { code: "internal", message: "the admission failed" } });
    });
  });

  return {
    url,
    ca: STANDIN_HUB_CA,
    admissions,
    refuse: (count, status, code, message) => {
      for (let i = 0; i < count; i += 1) refusals.push({ status, code, message });
    },
    close: () => new Promise<void>((resolveClose) => {
      server.close(() => resolveClose());
      server.closeAllConnections();
    }),
  };
}
