// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// vitest 4 no longer augments vite's config type: the test block
// comes with defineConfig from vitest/config.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";

export default defineConfig(({ command }) => ({
  // Relative asset URLs: the desktop shell loads the build over
  // file://, where absolute /assets/ paths resolve to the fs root.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // Catalogs compile on import (localization-6). A build refuses an
    // incomplete language (localization-7), so no shipped page ever
    // mixes two; while the suite runs, a message with no translation
    // yet falls back to its English text, so wrapping a string and
    // translating it can be two steps.
    lingui({ failOnMissing: command === "build", failOnCompileError: true }),
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
}));
