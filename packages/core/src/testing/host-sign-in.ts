// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Signing in at a stand-in instance as the core's own client does
// (git-host-2), for suites that need an instance's app token: a client
// keeping its token in a scratch home, and the browser flow completed as
// the system browser completes it. Not re-exported from `./index.ts`.

import assert from "node:assert/strict";

import { GitHostClient, fileCredentialStore, type HostAccount } from "@sublang/spex/git-host";
import type { StandinHost } from "./standin-host.js";

/** A client of one stand-in instance, its token kept in `home`. */
export function instanceClient(home: string, host: Pick<StandinHost, "url">): GitHostClient {
  return new GitHostClient({ url: host.url, label: "Spex on test", credentials: fileCredentialStore(home, host.url) });
}

/** Complete a browser sign-in as the system browser would: open the URL,
 * follow the host's redirect to the loopback. */
export async function browserSignIn(client: GitHostClient): Promise<{ account: HostAccount; page: string }> {
  const flow = await client.startBrowserSignIn();
  const first = await fetch(flow.url, { redirect: "manual" });
  assert.equal(first.status, 302);
  const location = first.headers.get("location") ?? "";
  assert.ok(location.startsWith(flow.redirectUri));
  const back = await fetch(location);
  const page = await back.text();
  assert.equal(back.status, 200);
  return { account: await flow.done, page };
}
