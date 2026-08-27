// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Page-connection coverage (SERVER-SHELL-13), the TLS half: a page
// served over https: derives a wss: same-origin endpoint
// (SERVER-SHELL-5).

// @vitest-environment-options {"url": "https://spex.example:8443/?token=tls-secret"}

import { expect, it } from "vitest";

import { defaultCoreUrl } from "./client";

it("derives a wss: endpoint under https:", () => {
  expect(defaultCoreUrl()).toBe("wss://spex.example:8443/?token=tls-secret");
  expect(window.location.search).toBe("");
});
