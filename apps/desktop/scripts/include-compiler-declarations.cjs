// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// electron-builder otherwise drops declarations before asarUnpack runs.
// This hook visits production dependencies, including nested packages;
// suffixes work unchanged with both native path separators.
module.exports = (file) => /\.d\.(?:ts|mts|cts)$/.test(file) ? true : undefined;
