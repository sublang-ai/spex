// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A release holding an applet (DR-161), for the core's applet coverage
// and the browser journey (applets-7, applets-8): `applets/report/`,
// entered at `index.html`, whose script lists the project's working
// folder through `~/` and shows its README through `~/README.md`, and
// reports whether the page could reach its parent or its storage. The
// stand-in registry takes it through the real publish path.

import { publishRelease } from "../environment/archive.js";
import { RegistryClient } from "../environment/registry.js";
import { makeRelease, type ReleaseFixture } from "./standin-registry.js";

export const APPLET_ORG = "acme";
export const APPLET_PACKAGE_NAME = "report-kit";
export const APPLET_PACKAGE = `${APPLET_ORG}/${APPLET_PACKAGE_NAME}`;
export const APPLET_VERSION = "1.0.0";
export const APPLET_ID = "report";

export const APPLET_ENTRY = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Report</title>
  </head>
  <body>
    <h1>Working folder report</h1>
    <pre id="readme"></pre>
    <ul id="listing"></ul>
    <script src="report.js"></script>
  </body>
</html>
`;

export const APPLET_SCRIPT = `(async () => {
  const listing = await (await fetch("~/")).json();
  const list = document.getElementById("listing");
  for (const entry of listing.entries) {
    const item = document.createElement("li");
    item.textContent = entry.name;
    item.dataset.kind = entry.kind;
    list.append(item);
  }
  document.getElementById("readme").textContent = await (await fetch("~/README.md")).text();
  document.body.dataset.ready = "true";
})().catch((error) => {
  document.body.dataset.error = String(error);
});
`;

export function appletManifest(version = APPLET_VERSION): Record<string, unknown> {
  return {
    format: 2,
    org: APPLET_ORG,
    name: APPLET_PACKAGE_NAME,
    version,
    description: "A report on the project's working folder",
    license: "Apache-2.0",
    artifacts: { [APPLET_ID]: { kind: "applet" } },
  };
}

export function appletFiles(): Record<string, ReleaseFixture> {
  return {
    "README.md": "# Report kit\n\nAn applet reporting on the working folder.\n",
    [`applets/${APPLET_ID}/index.html`]: APPLET_ENTRY,
    [`applets/${APPLET_ID}/report.js`]: APPLET_SCRIPT,
  };
}

/** Write the applet release into `dir` and publish it to the stand-in
 * registry at `registryUrl`. */
export async function publishAppletRelease(dir: string, registryUrl: string): Promise<string> {
  await makeRelease(dir, appletManifest(), appletFiles());
  await publishRelease(new RegistryClient({ url: registryUrl }), dir);
  return dir;
}
