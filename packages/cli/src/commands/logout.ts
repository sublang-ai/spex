// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex logout [--space <origin>]` (cli-11, git-host-10): revoke this
// device at the instance named, else the default, with its app token,
// and, in the turn its pair is removed, mark the instance's entry signed
// out in `home.yaml`, keeping the entry and every other instance's.

import { CredentialChanged } from "../lib/git-host.js";
import { instanceAt, updateHomeFile, withSignOut } from "../lib/home-file.js";
import { clientOf, credentialsOf, homeDir, hostOf, namedInstance, nameOf, readHome, signedIn } from "./home.js";
import { options, Refusal, type Command } from "./run.js";

export const logout: Command = async (args) => {
  const values = options("logout", args, { space: { type: "string" } });
  const dir = homeDir();
  const home = readHome(dir);
  const target = namedInstance(home, values.space);
  const entry = home ? instanceAt(home, target.origin) : undefined;
  if (!entry) throw new Refusal(`${hostOf(target.origin)} is not among this device's Spaces; spex whoami lists them`);
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
    if (error instanceof CredentialChanged) throw new Refusal(`the sign-in at ${name} changed meanwhile; run spex logout again`);
    throw new Refusal(`not signed out at ${name}: ${(error as Error).message}`);
  }
  if (marked) throw new Refusal(`signed out at ${name}, but ${(marked as Error).message}; spex whoami may still list it as signed in`);
  console.log(`Signed out at ${name}; ${entry.account?.login} is no longer signed in on this device.`);
};
