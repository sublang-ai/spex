// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The frame guard (app-shell-41, DR-161): a frame inside the page — an
// applet's — navigates only at the in-app core endpoint's origin; a
// navigation anywhere else is prevented and opens nothing, so a page the
// IDE frames carries what it read nowhere else. No policy the framed
// page carries confines where its own frame goes, and the desktop's
// `file://` page cannot name the port the core took, so the main process
// decides per navigation. The main frame keeps the window's own rule.

/** Whether a sub-frame may navigate to `url` (app-shell-41): only at
 * `endpointOrigin`, the core endpoint's HTTP origin. A URL that is none,
 * or whose origin is opaque — `about:`, `file:`, `data:`, `javascript:`
 * — is refused with the rest. */
export function frameNavigationAllowed(endpointOrigin: string, url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  return target.origin === endpointOrigin;
}
