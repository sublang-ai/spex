// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The desktop shell's own catalogs (localization-6, DR-078): the text
// the main process composes — notifications, dialogs, the Help item —
// extracted from its source into one PO file per offered language.
// The English text is the message id (no macros, no generated hashes),
// so `explicitIdAsDefault` keeps the PO readable as plain gettext.

import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "zh"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      // Tests speak no interface text of their own, and the compiled
      // catalogs beside the PO files are output, not source.
      exclude: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/locales/**"],
    },
  ],
  // Line numbers would churn the catalog on every unrelated edit; the
  // file names alone tell a translator where the text is shown.
  format: formatter({ lineNumbers: false, explicitIdAsDefault: true }),
  // The English text is the id, so ordering by id orders by message
  // (localization-6); `"message"` would compare the empty default of
  // an explicit-id entry and leave the catalog in source order.
  orderBy: "messageId",
});
