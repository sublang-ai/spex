// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";

import { CORE_NAME } from "./index.js";

test("package identity", () => {
  assert.equal(CORE_NAME, "@sublang/spex-core");
});
