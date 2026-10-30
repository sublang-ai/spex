// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex whoami [--space <origin>]` (cli-12): each instance the home
// lists, or the one named, as its origin's host with its display name
// where the home holds one, the login signed in there or that it is
// signed out, and the default marked — or, listing none, that none is
// signed in — read from `home.yaml` alone, asking no instance and
// printing no secret.

import { instanceAt, type HomeInstance } from "../lib/home-file.js";
import { defaultInstance, homeDir, hostOf, namedInstance, readHome, signedIn } from "./home.js";
import { options, type Command } from "./run.js";

export const whoami: Command = async (args) => {
  const values = options("whoami", args, { space: { type: "string" } });
  const home = readHome(homeDir());
  // The one named, signed out where the home does not list it.
  const shown: HomeInstance[] = values.space !== undefined
    ? [namedInstance(home, values.space)]
    : home?.instances ?? [];
  const defaultOrigin = defaultInstance(home).origin;
  if (shown.length === 0) {
    console.log(`No Space signed in on this device; spex login signs in at ${hostOf(defaultOrigin)}.`);
    return;
  }
  const rows = shown.map((entry) => [
    hostOf(entry.origin),
    entry.displayName ?? "",
    signedIn(home ? instanceAt(home, entry.origin) : undefined) ? entry.account?.login ?? "" : "signed out",
    entry.origin === defaultOrigin ? "(default)" : "",
  ]);
  // Columns aligned; one no row fills is left out.
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).filter((_, column) => widths[column] > 0).join("  ").trimEnd());
  }
};
