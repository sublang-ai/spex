// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The applet tabs of a project's workspace (applets-1, DR-161): one per
// applet the project's environment or your own group's installs with
// its files on this device, the project's first, each environment's in
// spec package and applet order. A tab's id names its environment and
// applet, so two environments installing one id give two tabs. Pure
// functions; the workspace renders them.

import type { EnvironmentState } from "@sublang/spex-core/protocol";

/** One applet tab: `applet:<repository>:<id>`. */
export interface AppletTab {
  tab: string;
  /** The spex repository whose environment installs it. */
  repository: string;
  id: string;
  /** Its spec package, `<org>/<pkg>`, and version. */
  package: string;
  version: string | null;
}

const PREFIX = "applet:";

export function appletTabId(repository: string, id: string): string {
  return `${PREFIX}${repository}:${id}`;
}

export function isAppletTab(tab: string | undefined): tab is string {
  return tab !== undefined && tab.startsWith(PREFIX);
}

/** The applet tabs of a project (applets-1): the applets each listed
 * environment installs whose files stand here — installed as locked, a
 * path source not missing (environments-14) — in the order given. */
export function appletTabs(environments: readonly (EnvironmentState | undefined)[]): AppletTab[] {
  const tabs: AppletTab[] = [];
  const seen = new Set<string>();
  for (const environment of environments) {
    if (!environment) continue;
    for (const pkg of environment.packages ?? []) {
      if (!pkg.installed || pkg.missingPath !== null) continue;
      for (const artifact of pkg.artifacts ?? []) {
        if (artifact.kind !== "applet") continue;
        const tab = appletTabId(environment.repository, artifact.id);
        if (seen.has(tab)) continue;
        seen.add(tab);
        tabs.push({ tab, repository: environment.repository, id: artifact.id, package: pkg.name, version: pkg.version });
      }
    }
  }
  return tabs;
}

/** The core endpoint's HTTP origin (applets-2): the WebSocket
 * endpoint's scheme turned to `http` or `https`, its host kept. */
export function endpointOrigin(coreUrl: string | undefined): string | undefined {
  if (!coreUrl) return undefined;
  try {
    const url = new URL(coreUrl);
    const scheme = url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : undefined;
    return scheme ? `${scheme}//${url.host}` : undefined;
  } catch {
    return undefined;
  }
}
