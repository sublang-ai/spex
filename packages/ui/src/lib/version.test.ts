// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The version a page prints (settings-31): the desktop's query, else
// the served page's stamp, else the dev placeholder.

import { afterEach, describe, expect, test } from "vitest";

import { appVersion } from "./version.js";

afterEach(() => {
  document.head.querySelector('meta[name="spex-version"]')?.remove();
  window.history.replaceState(null, "", "/");
});

describe("appVersion", () => {
  test("a bare page is a dev build", () => {
    expect(appVersion()).toBe("dev");
  });

  test("the served page's stamp names the shell's version", () => {
    const meta = document.createElement("meta");
    meta.name = "spex-version";
    meta.content = "0.2.0";
    document.head.append(meta);
    expect(appVersion()).toBe("0.2.0");
  });

  test("the desktop's query wins over a stamp", () => {
    const meta = document.createElement("meta");
    meta.name = "spex-version";
    meta.content = "0.2.0";
    document.head.append(meta);
    window.history.replaceState(null, "", "/?version=0.3.0");
    expect(appVersion()).toBe("0.3.0");
  });
});
