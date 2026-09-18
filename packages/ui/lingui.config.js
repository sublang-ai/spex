// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The UI bundle's catalogs (localization-6, DR-078): one gettext PO
// file per offered language beside the source, the English text as the
// entry's msgid. No macros — the renderer has no Babel stage, so every
// text is a plain `i18n._("…")` call the extractor reads directly.

import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "zh"],
  catalogs: [
    {
      path: "<rootDir>/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      // Tests and fixtures speak to the machine, not the reader.
      exclude: [
        "<rootDir>/src/**/*.test.ts",
        "<rootDir>/src/**/*.test.tsx",
        "<rootDir>/src/fixtures/**",
      ],
    },
  ],
  // An entry reads as plain `msgid "English"` / `msgstr "中文"`: the
  // English text is the key, so no hashed id comment, and references
  // name the file without a line number a reformat would churn.
  format: formatter({ lineNumbers: false, explicitIdAsDefault: true }),
  // The English text is the id, so ordering by id orders by message
  // (localization-6); `"message"` would compare the empty default of
  // an explicit-id entry and leave the catalog in source order.
  orderBy: "messageId",
});
