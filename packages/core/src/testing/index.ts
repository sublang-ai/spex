// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

export * from "./fake-adapter.js";
export * from "./scripted-captain.js";
export * from "./demo.js";
// The managed Git rules writer, for fixtures that stand in for a peer
// home (space-36): the same rules the core writes, so a joining home
// meets no rules conflict of the fixture's making.
export { prepareStorageGitFiles } from "../storage-git.js";
