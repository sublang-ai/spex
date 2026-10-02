// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { i18n } from "./i18n.js";

/** Cligent's engine-53 path contract. Its pure normalizer is not a public
 * export; the public tmux loader reads and may migrate a file, so it cannot
 * validate an in-memory Settings candidate without extra filesystem effects.
 * Real installed-loader parity is exercised through core integration tests. */
export function canonicalWritablePath(value: string, path: string): string {
  let normalized = value.replaceAll("\\", "/");
  if (normalized.length === 0) {
    throw new Error(i18n._({
      id: "{path} must not be empty",
      comment: "Config error; path is the config field location",
      values: { path },
    }));
  }
  if (/[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(i18n._({
      id: "{path} must not contain control characters",
      comment: "Config error; path is the config field location",
      values: { path },
    }));
  }
  if (/[*?[\]{}]/u.test(normalized)) {
    throw new Error(i18n._({
      id: "{path} must not contain glob metacharacters",
      comment: "Config error; path is the config field location",
      values: { path },
    }));
  }
  if (/[$`'"~;&|<>()]/u.test(normalized)) {
    throw new Error(i18n._({
      id: "{path} must not contain shell expansion or control characters",
      comment: "Config error; path is the config field location",
      values: { path },
    }));
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    throw new Error(i18n._({
      id: "{path} must be workspace-relative",
      comment: "Config error; writable paths stay within the workspace",
      values: { path },
    }));
  }
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  normalized = normalized.replace(/\/+$/u, "");
  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (segment === "") {
      throw new Error(i18n._({
        id: "{path} must not contain empty path segments",
        comment: "Config error; path is the config field location",
        values: { path },
      }));
    }
    if (segment === "..") {
      throw new Error(i18n._({
        id: "{path} must not contain '..' path segments",
        comment: "Config error; '..' is the literal parent-directory component",
        values: { path },
      }));
    }
    if (segment !== ".") segments.push(segment);
  }
  if (segments.length === 0) {
    throw new Error(i18n._({
      id: "{path} must not resolve to the workspace root",
      comment: "Config error; path is the config field location",
      values: { path },
    }));
  }
  return segments.join("/");
}
