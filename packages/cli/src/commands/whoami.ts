// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex whoami [--registry <url> | --space <url>]` (cli-12, DR-168,
// DR-172): this computer's sign-ins in one grammar, a line each — this
// folder's registry, then every Space the home lists — or, with a flag,
// the line of the registry or Space named alone: its kind, its name as
// cli-22 names it, and `@<login>` or `signed out`, the home's default
// Space marked `(default)`. A registry's login is read from its account
// API; a Space's from its home entry, asking no Space. No secret is
// printed.

import { authTarget } from "./auth-target.js";
import { HostError } from "../lib/git-host.js";
import { instanceAt, type HomeFile, type HomeInstance } from "../lib/home-file.js";
import { clientOf, credentialsOf, defaultInstance, homeDir, hostCause, nameOf, namedInstance, readHome, registryName, signedIn } from "./home.js";
import { options, Refusal, type Command } from "./run.js";

/** The registry's line: its name and the login its account API names,
 * or signed out; a registry that cannot say leaves its cause. */
async function registryLine(dir: string, origin: string): Promise<{ row: string[]; cause?: string }> {
  const name = await registryName(dir, origin);
  const client = clientOf(origin, credentialsOf(dir, origin, "registry"), undefined, "registry");
  let held: boolean;
  try { held = await client.signedIn(); }
  catch (error) { return { row: ["Registry", name, "sign-in unreadable"], cause: `your sign-in at ${name} cannot be read: ${(error as Error).message} — spex logout, then spex login` }; }
  if (!held) return { row: ["Registry", name, "signed out"] };
  try {
    return { row: ["Registry", name, `@${(await client.me()).login}`] };
  } catch (error) {
    // A sign-in the registry refused is gone: signed out.
    if (error instanceof HostError && error.kind === "reauth") return { row: ["Registry", name, "signed out"] };
    if (!(await client.signedIn().catch(() => true))) return { row: ["Registry", name, "signed out"] };
    return { row: ["Registry", name, "signed in"], cause: hostCause(error, name) };
  }
}

/** A Space's line, read from its home entry alone. */
function spaceLine(home: HomeFile | null, entry: HomeInstance, defaultOrigin: string): string[] {
  const listedEntry = home ? instanceAt(home, entry.origin) : undefined;
  const who = signedIn(listedEntry) ? `@${listedEntry!.account!.login}` : "signed out";
  return ["Space", nameOf(listedEntry ?? entry), entry.origin === defaultOrigin ? `${who} (default)` : who];
}

export const whoami: Command = async (args) => {
  const values = options("whoami", args, { space: { type: "string" }, registry: { type: "string" } });
  const dir = homeDir();
  const home = readHome(dir);
  const defaultOrigin = defaultInstance(home).origin;
  const rows: string[][] = [];
  let cause: string | undefined;
  if (values.space !== undefined) {
    if (values.registry !== undefined) authTarget(home, values);
    rows.push(spaceLine(home, namedInstance(home, values.space), defaultOrigin));
  } else {
    const { target } = authTarget(home, values);
    const line = await registryLine(dir, target.origin);
    rows.push(line.row);
    cause = line.cause;
    if (values.registry === undefined) for (const entry of home?.instances ?? []) rows.push(spaceLine(home, entry, defaultOrigin));
  }
  // Columns aligned, two spaces apart.
  const widths = rows.reduce<number[]>((out, row) => row.map((cell, at) => Math.max(out[at] ?? 0, cell.length)), []);
  console.log(rows.map((row) => row.map((cell, at) => (at === row.length - 1 ? cell : cell.padEnd(widths[at]!))).join("  ")).join("\n"));
  if (cause !== undefined) throw new Refusal(cause);
};
