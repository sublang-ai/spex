// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The frame guard (app-shell-41, app-shell-42, DR-161): against the
// endpoint of a real core started through the shell's own option
// builder, a sub-frame navigation proceeds only at that endpoint's
// origin, and the main window hands every sub-frame navigation to the
// guard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CoreService } from "@sublang/spex-core";

import { desktopCoreOptions } from "./core-options.js";
import { frameNavigationAllowed } from "./frame-navigation.js";

test("app-shell-42: a frame inside the page navigates only at the real core's endpoint, and the window asks the guard", { timeout: 120_000 }, async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-desktop-frame-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const service = await CoreService.start({
    ...desktopCoreOptions({
      dataDir: join(scratch, "home"),
      userData: join(scratch, "userdata"),
      systemLanguages: ["en-US"],
      execPath: process.execPath,
      moduleUrl: import.meta.url,
    }),
    token: "test",
    env: { PATH: process.env.PATH ?? "", HOME: join(scratch, "user") },
    home: join(scratch, "user"),
    watchConfig: false,
    adapterRuntime: () => ({ usable: true }),
  });
  t.after(() => service.stop());
  const port = service.port();
  const endpoint = `http://127.0.0.1:${port}`;
  const capability = `/applets/${"A".repeat(43)}/`;

  // At the endpoint's origin: a capability path, a path under `~/`, a
  // reload's query (app-shell-41).
  for (const url of [`${endpoint}${capability}`, `${endpoint}${capability}~/README.md`, `${endpoint}${capability}?r=2`, `${endpoint}/`]) {
    assert.equal(frameNavigationAllowed(endpoint, url), true, url);
  }
  // Anywhere else is prevented: another loopback port, `localhost` at
  // the endpoint's port, an `https` origin, a `file:` URL, `about:blank`,
  // a `javascript:` or `data:` URL, and no URL (app-shell-41).
  for (const url of [
    `http://127.0.0.1:${port + 1}/?d=secret`,
    `http://127.0.0.1:${port === 80 ? 81 : 80}/?d=secret`,
    `http://localhost:${port}${capability}`,
    `https://127.0.0.1:${port}${capability}`,
    `https://example.invalid/?d=secret`,
    "file:///etc/passwd",
    "about:blank",
    "javascript:alert(1)",
    "data:text/html,secret",
    `127.0.0.1:${port}${capability}`,
    "",
  ]) {
    assert.equal(frameNavigationAllowed(endpoint, url), false, url);
  }

  // The main window hands every sub-frame navigation to the guard with
  // the endpoint it loaded the page against, the main frame left to its
  // own rule (app-shell-41, app-shell-21).
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /const endpointOrigin = `http:\/\/127\.0\.0\.1:\$\{service\.port\(\)\}`;/);
  assert.match(source, /webContents\.on\("will-frame-navigate", \(event\) => \{\s*if \(!event\.isMainFrame && !frameNavigationAllowed\(endpointOrigin, event\.url\)\) event\.preventDefault\(\);/);
});
