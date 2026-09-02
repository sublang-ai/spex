// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/** The app's version as the shell that delivered this page says it:
 * the desktop passes `?version=` on the page URL, the server shell
 * stamps a `spex-version` meta element into the page it serves
 * (server-shell-4), and a bare dev build has neither. */
export function appVersion(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("version");
  if (fromQuery) return fromQuery;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="spex-version"]',
  );
  const stamped = meta?.content.trim();
  return stamped ? stamped : "dev";
}
