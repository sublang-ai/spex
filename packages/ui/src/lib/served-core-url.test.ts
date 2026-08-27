// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Page-connection coverage (SERVER-SHELL-13): a jsdom document stands
// at a served page URL and the endpoint resolution walks the case
// table of SERVER-SHELL-5 — token adoption with the address bar
// scrubbed, page-session reuse across a reload, ?core= precedence,
// and the unchanged fallback. The wss: half lives in
// served-core-url-https.test.ts, since the page URL is per-file.

// @vitest-environment-options {"url": "http://spex.example:8137/?keep=1&token=s3cret"}

import { describe, expect, it } from "vitest";

import { defaultCoreUrl } from "./client";

describe("served-page core-URL resolution over http", () => {
  it("adopts the URL token, connects same-origin, and scrubs the address bar", () => {
    expect(defaultCoreUrl()).toBe("ws://spex.example:8137/?token=s3cret");
    expect(window.location.search).toBe("?keep=1");
    expect(window.sessionStorage.getItem("spex.core.token")).toBe("s3cret");
  });

  it("reconnects from the page-session copy once the URL carries no token", () => {
    expect(window.location.search).toBe("?keep=1");
    expect(defaultCoreUrl()).toBe("ws://spex.example:8137/?token=s3cret");
  });

  it("lets an explicit ?core= URL win unchanged", () => {
    window.history.replaceState(null, "", "/?core=ws://elsewhere:9/?token=t");
    expect(defaultCoreUrl()).toBe("ws://elsewhere:9/?token=t");
    window.history.replaceState(null, "", "/");
  });

  it("falls back unchanged with neither token nor ?core=", () => {
    window.sessionStorage.removeItem("spex.core.token");
    expect(defaultCoreUrl()).toBe(
      (import.meta.env?.VITE_SPEX_CORE_URL as string | undefined) ??
        "ws://127.0.0.1:8137/?token=dev",
    );
  });
});
