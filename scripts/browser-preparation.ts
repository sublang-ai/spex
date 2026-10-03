// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { Locator } from "playwright";

/** Observe one current rendered control. The English acceptance hosts pin the
 * UI language; initial idle is not terminal, but its explicit cancelled detail
 * is. One locator wait avoids leaving losing readiness waits alive on failure. */
export async function waitForBrowserPreparation(scope: Locator, { timeoutMs = 930_000 } = {}): Promise<void> {
  const control = scope.getByTestId("browser-control");
  const status = control.getByRole("status");
  try {
    await status.filter({ hasText: /^Browser ready$|^Browser setup failed|Browser setup cancelled$/ }).waitFor({ timeout: timeoutMs });
  } catch (cause) {
    const current = await status.textContent({ timeout: 1000 }).catch(() => "control unavailable");
    throw new Error(`Browser preparation did not reach a terminal state: ${current}`, { cause });
  }
  // Read one DOM snapshot, including diagnostics in a closed disclosure.
  const result = await control.evaluate((node) => ({
    status: node.querySelector('[role="status"]')?.textContent ?? "",
    diagnostic: node.querySelector('[data-testid="browser-diagnostic"]')?.textContent ?? "",
  }));
  if (result.status === "Browser ready") return;
  throw new Error(`Browser preparation ${result.status.includes("Browser setup cancelled") ? "cancelled" : "failed"}: ${result.diagnostic || result.status}`);
}
