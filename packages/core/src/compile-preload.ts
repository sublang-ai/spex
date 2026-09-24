// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Runs before the compiler on Electron as Node (playbook-library-11,
// DR-081): the variable that made this process a Node must not reach
// the agents the compiler spawns, or an Electron app they launch would
// start as bare Node too.

delete process.env.ELECTRON_RUN_AS_NODE;

export {};
