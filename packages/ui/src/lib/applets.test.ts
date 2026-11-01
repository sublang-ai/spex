// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The applet tabs' reading of environments (applets-1, applets-2): one
// tab per installed applet whose files stand, the project's first, two
// environments' applets of one id apart, and the frame's origin from
// the WebSocket endpoint.

import type { EnvironmentPackage, EnvironmentState } from "@sublang/spex-core/protocol";
import { describe, expect, test } from "vitest";

import { appletTabId, appletTabs, endpointOrigin, isAppletTab } from "./applets.js";

function pkg(name: string, artifacts: EnvironmentPackage["artifacts"], extra: Partial<EnvironmentPackage> = {}): EnvironmentPackage {
  return {
    name,
    version: "1.0.0",
    source: { kind: "registry", detail: "https://spex.example" },
    direct: true,
    requiredBy: [],
    artifacts,
    exports: [],
    installed: true,
    missingPath: null,
    ...extra,
  };
}

function environment(repository: string, packages: EnvironmentPackage[]): EnvironmentState {
  return { repository, language: null, requests: {}, packages, stale: null, conflicts: null, busy: null, error: null, pathRoot: null };
}

const applet = (id: string) => ({ id, kind: "applet" as const, language: null, fallback: false, provided: true });

describe("appletTabs", () => {
  test("a tab per installed applet whose files stand, the project's environment first", () => {
    const project = environment("me/demo-spex", [
      pkg("acme/report-kit", [applet("report"), { id: "lint", kind: "skill", language: "en", fallback: false, provided: true }]),
      pkg("acme/pending", [applet("pending")], { installed: false }),
      pkg("acme/away", [applet("away")], { source: { kind: "path", detail: "spex-packages/away" }, missingPath: "spex-packages/away" }),
    ]);
    const own = environment("me/me-spex", [pkg("acme/report-kit", [applet("report")], { version: "2.0.0" })]);
    const tabs = appletTabs([project, undefined, own]);
    expect(tabs.map((tab) => [tab.tab, tab.package, tab.version])).toEqual([
      ["applet:me/demo-spex:report", "acme/report-kit", "1.0.0"],
      ["applet:me/me-spex:report", "acme/report-kit", "2.0.0"],
    ]);
    expect(tabs.every((tab) => isAppletTab(tab.tab))).toBe(true);
    expect(isAppletTab("overview")).toBe(false);
    expect(appletTabId("me/me-spex", "report")).toBe("applet:me/me-spex:report");
  });
});

describe("endpointOrigin", () => {
  test("the WebSocket endpoint's scheme turned to HTTP, its host kept", () => {
    expect(endpointOrigin("ws://127.0.0.1:8137/?token=secret")).toBe("http://127.0.0.1:8137");
    expect(endpointOrigin("wss://spex.example.com/?token=secret")).toBe("https://spex.example.com");
    expect(endpointOrigin(undefined)).toBeUndefined();
    expect(endpointOrigin("not a url")).toBeUndefined();
  });
});
