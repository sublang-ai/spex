// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The resolution both shells share (localization-2): the stored choice
// first, then the client's own preferred languages, and English when
// none of them is offered.

import { test } from "node:test";
import assert from "node:assert/strict";

import { isLanguage, LANGUAGES, resolveLanguage } from "./language.js";

test("localization-1: English and Simplified Chinese are the offered languages", () => {
  assert.deepEqual([...LANGUAGES], ["en", "zh"]);
  assert.ok(isLanguage("en") && isLanguage("zh"));
  for (const value of ["fr", "zh-CN", "ZH", "", null, undefined, 1, {}]) {
    assert.equal(isLanguage(value), false, `${JSON.stringify(value)} is no offered language`);
  }
});

test("localization-2: the stored choice wins over every preferred language", () => {
  assert.equal(resolveLanguage("zh", ["en-US"]), "zh");
  assert.equal(resolveLanguage("en", ["zh-CN"]), "en");
});

test("localization-2: with no choice, the first offered preferred language wins", () => {
  // Chinese in the simplified script reads as zh, whatever its region.
  assert.equal(resolveLanguage(null, ["zh-CN"]), "zh");
  assert.equal(resolveLanguage(null, ["zh-Hans-SG"]), "zh");
  assert.equal(resolveLanguage(null, ["fr", "zh-CN"]), "zh");
  // A script no catalog holds, an unoffered language, and an earlier
  // offered one all read as English.
  assert.equal(resolveLanguage(null, ["zh-TW"]), "en");
  assert.equal(resolveLanguage(null, ["zh-Hant-HK"]), "en");
  assert.equal(resolveLanguage(null, ["fr"]), "en");
  assert.equal(resolveLanguage(null, ["en-GB", "zh-CN"]), "en");
  assert.equal(resolveLanguage(undefined, []), "en");
});

test("localization-2: a malformed tag matches nothing rather than throwing", () => {
  assert.equal(resolveLanguage(null, ["", "not a tag", "zh_CN"]), "en");
  assert.equal(resolveLanguage(null, ["zh_CN", "zh-CN"]), "zh");
});
