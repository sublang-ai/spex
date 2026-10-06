// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Native shell bridge (DR-008, SHELL-20): OS affordances only, no
// application features. Sandboxed preloads must be CommonJS.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spexNative", {
  /** Open the native directory picker; absolute path or null. */
  pickDirectory: () => ipcRenderer.invoke("spex:pick-directory"),
  /** Reveal a state-root path in the OS file manager (DR-057,
   * app-shell-28): true when shown, false for a path outside the root. */
  revealPath: (path) => ipcRenderer.invoke("spex:reveal-path", path),
  /** Open the Git host's sign-in page in the system browser (DR-103,
   * app-shell-37): true when opened, false for a URL not at the home's
   * recorded host. */
  openExternal: (url) => ipcRenderer.invoke("spex:open-external", url),
});
