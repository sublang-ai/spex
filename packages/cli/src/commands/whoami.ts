// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex whoami [--space <origin>]` (cli-12): each instance the home
// lists, or the one named, as its origin's host with its display name
// where the home holds one, the login signed in there or that it is
// signed out, and the default marked — read from `home.yaml` alone,
// asking no instance and printing no secret.

import { defaultInstanceOf, instanceAt, type HomeInstance } from "../lib/home-file.js";
import { defaultInstance, homeDir, hostOf, readHome, signedIn, spaceOption } from "./home.js";
import { options, Refusal, type Command } from "./run.js";

export const whoami: Command = async (args) => {
  const values = options("whoami", args, { space: { type: "string" } });
  const home = readHome(homeDir());
  const fallback = defaultInstance(home);
  const defaultOrigin = home ? defaultInstanceOf(home).origin : fallback.origin;
  // A home listing none still has its default instance, signed out.
  let shown: HomeInstance[] = home && home.instances.length > 0 ? home.instances : [fallback];
  if (values.space !== undefined) {
    const origin = spaceOption(values.space);
    const entry = home ? instanceAt(home, origin) : undefined;
    if (!entry && origin !== defaultOrigin) {
      throw new Refusal(`${hostOf(origin)} is not among this device's Spaces; spex login --space ${origin} signs in there`);
    }
    shown = [entry ?? fallback];
  }
  const rows = shown.map((entry) => [
    hostOf(entry.origin),
    entry.displayName ?? "",
    signedIn(entry) ? entry.account?.login ?? "" : "signed out",
    entry.origin === defaultOrigin ? "(default)" : "",
  ]);
  // Columns aligned; one no row fills is left out.
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).filter((_, column) => widths[column] > 0).join("  ").trimEnd());
  }
};
