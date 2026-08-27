// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Page-connection coverage (SERVER-SHELL-13), the storage-blocked
// case: when the page session cannot verifiably hold the token, the
// address bar keeps it, so a reload still connects (SERVER-SHELL-5).

// @vitest-environment-options {"url": "http://spex.example:8137/?token=fragile"}

import { expect, it } from "vitest";

import { defaultCoreUrl } from "./client";

Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  get() {
    throw new Error("blocked");
  },
});

it("keeps the URL token unscrubbed when storage is blocked", () => {
  expect(defaultCoreUrl()).toBe("ws://spex.example:8137/?token=fragile");
  expect(window.location.search).toBe("?token=fragile");
});
