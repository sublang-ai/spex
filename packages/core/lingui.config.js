// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The core's own catalogs (localization-6, DR-079): the prose the core
// composes for the reader — a refusal's message, a config error, a
// readiness requirement — extracted from its source into one PO file
// per offered language, beside the source that composes it.
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
      // A test composes no reader's text of its own — it asserts on the
      // source's — and the compiled catalogs beside the PO files are
      // output, not source.
      exclude: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/locales/**"],
    },
  ],
  // Line numbers would churn the catalog on every unrelated edit; the
  // file names alone tell a translator where the text is composed.
  format: formatter({ lineNumbers: false, explicitIdAsDefault: true }),
  // The English text is the id, so ordering by id orders by message
  // (localization-6); `"message"` would compare the empty default of
  // an explicit-id entry and leave the catalog in source order.
  orderBy: "messageId",
});
