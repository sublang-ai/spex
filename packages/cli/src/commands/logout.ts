// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex logout [--registry <url> | --space <url>]` (cli-11, git-host-10,
// DR-168): revoke this computer's sign-in for one purpose alone — this
// folder's registry for its packages by default, or the registry or
// Space named — and, for a Space, in the turn its pair is removed, mark
// its entry signed out in `home.yaml`, keeping the entry and every other
// Space's. One line says so, in whoami's grammar (cli-12).

import { authTarget } from "./auth-target.js";
import { CredentialChanged } from "../lib/git-host.js";
import { instanceAt, updateHomeFile, withSignOut } from "../lib/home-file.js";
import { clientOf, credentialsOf, homeDir, hostCause, hostOf, nameOf, readHome, registryName, signedIn } from "./home.js";
import { options, Refusal, type Command } from "./run.js";

export const logout: Command = async (args) => {
  const values = options("logout", args, { space: { type: "string" }, registry: { type: "string" } });
  const dir = homeDir();
  const home = readHome(dir);
  const { target, scope } = authTarget(home, values);
  if (scope === "registry") {
    const credentials = credentialsOf(dir, target.origin, scope);
    const name = await registryName(dir, target.origin);
    let held;
    try { held = await credentials.read(); }
    catch { held = undefined; }
    if (held === null) {
      console.log(`Already signed out at ${name}.`);
      return;
    }
    try { await clientOf(target.origin, credentials, undefined, scope).signOut(); }
    catch (error) {
      if (error instanceof CredentialChanged) throw new Refusal(`your sign-in at ${name} changed meanwhile — spex logout again`);
      throw new Refusal(`not signed out at ${name}: ${hostCause(error, name)}`);
    }
    console.log(`Signed out at ${name}.`);
    return;
  }
  const entry = home ? instanceAt(home, target.origin) : undefined;
  if (!entry) throw new Refusal(`${hostOf(target.origin)}: not signed in here — spex whoami`);
  const name = nameOf(entry);
  if (!signedIn(entry)) {
    console.log(`Already signed out at ${name}.`);
    return;
  }

  const client = clientOf(entry.origin, credentialsOf(dir, entry.origin));
  let marked: Error | null = null;
  try {
    // The pair's removal and the entry's mark are one step (git-host-10).
    await client.signOut(() => {
      try { updateHomeFile(dir, (current) => withSignOut(current, entry.origin)); }
      catch (error) { marked = error as Error; }
    });
  } catch (error) {
    if (error instanceof CredentialChanged) throw new Refusal(`your sign-in at ${name} changed meanwhile — spex logout again`);
    throw new Refusal(`not signed out at ${name}: ${hostCause(error, name)}`);
  }
  if (marked) throw new Refusal(`signed out at ${name}, but home.yaml was not updated: ${(marked as Error).message} — spex logout again`);
  console.log(`Signed out at ${name}.`);
};
