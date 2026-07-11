// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Native shell bridge (DR-008, SHELL-20): OS affordances only, no
// application features. Sandboxed preloads must be CommonJS.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spexNative", {
  /** Open the native directory picker; absolute path or null. */
  pickDirectory: () => ipcRenderer.invoke("spex:pick-directory"),
});
