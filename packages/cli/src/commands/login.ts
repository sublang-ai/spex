// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex login [--registry <url> | --space <url>] [--force]` (cli-10,
// git-host-3, DR-168): sign this computer in by the device flow at this
// folder's registry for its packages, or at the registry or Space named.
// A registry sign-in keeps its app token alone and caches the registry's
// display name (cli-22); a Space sign-in records the Space in
// `home.yaml` with its account — the first one recorded becoming the
// default — while the library's client keeps its app token in
// `local/credentials.yaml` (storage-19).

import {
  anotherAccountError, HostError, type CredentialStore, type DeviceSignIn, type HostAccount, type StoredCredential,
} from "../lib/git-host.js";
import { homeFilePath, instanceAt, readHomeFile, updateHomeFile, withDisplayName, withSignIn } from "../lib/home-file.js";
import { authTarget } from "./auth-target.js";
import { instanceFolder } from "../lib/instance.js";
import { cacheRegistryName, clientOf, credentialsOf, describedRegistryName, homeDir, hostCause, hostOf, listed, nameOf, readHome, registryName, signedIn } from "./home.js";
import { Interrupted, options, Refusal, type Command } from "./run.js";

/** A sign-in that ended without an account, as one phrase ending in
 * what to do (cli-13). */
function signInCause(error: unknown, name: string): string {
  if (!(error instanceof HostError) || error.cause === undefined) return `not signed in: ${hostCause(error, name)}`;
  switch (error.cause) {
    case "denied": return `not signed in: the code was denied at ${name} — spex login to try again`;
    case "expired": return `not signed in: the code expired at ${name} — spex login to try again`;
    case "account": return `not signed in: this computer is signed in at ${name} as @${error.words} — sign in there as @${error.words}`;
    case "stopped": return `not signed in: your sign-in at ${name} changed meanwhile — spex login to try again`;
    case "unreachable": return `not signed in: ${name} could not be reached — check the connection, then retry`;
    default: return `not signed in: ${name} refused the sign-in${error.words ? `: ${error.words}` : error.code ? `: ${error.code}` : ""}`;
  }
}

/** A store holding one pair in memory alone, for a device revoked
 * through it without writing anything anywhere. */
function heldOnly(pair: StoredCredential): CredentialStore {
  let held: StoredCredential | null = pair;
  return {
    read: async () => held,
    replace: (expected, next) => {
      if (expected !== held && JSON.stringify(expected) !== JSON.stringify(held)) return false;
      held = next;
      return true;
    },
  };
}

export const login: Command = async (args, interrupt) => {
  const values = options("login", args, { space: { type: "string" }, registry: { type: "string" }, force: { type: "boolean" } });
  const dir = homeDir();
  const home = readHome(dir);
  const { target, scope } = authTarget(home, values);
  const origin = target.origin;
  // A registry is named by its own descriptor, a Space by its home entry
  // (cli-22).
  let name = scope === "registry" ? await registryName(dir, origin) : nameOf(target);

  // No two Spaces at one folder (storage-2): refused before the flow.
  if (scope === "space" && home && !listed(home, origin)) {
    const folder = instanceFolder(origin);
    const clash = home.instances.find((entry) => instanceFolder(entry.origin) === folder);
    if (clash) throw new Refusal(`${hostOf(origin)} and ${hostOf(clash.origin)} would share one folder on this computer — sign in at ${clash.origin} instead`);
  }

  const credentials = credentialsOf(dir, origin, scope);
  let held: StoredCredential | null;
  try {
    held = await credentials.read();
  } catch (error) {
    throw new Refusal(`your sign-in at ${name} does not read: ${(error as Error).message}`);
  }
  const entry = home ? instanceAt(home, origin) : undefined;
  if (held && (scope === "registry" || signedIn(entry)) && values.force !== true) {
    let login: string | undefined = entry?.account?.login;
    if (scope === "registry") {
      try {
        login = (await clientOf(origin, credentials, undefined, scope).me()).login;
      } catch (error) {
        // A sign-in the registry no longer accepts is gone: sign in anew.
        if ((await credentials.read().catch(() => held)) !== null) throw new Refusal(hostCause(error, name));
        login = undefined;
        held = null;
      }
    }
    if (held) {
      console.log(`Already signed in at ${name} as @${login} — spex login --force signs in again`);
      return;
    }
  }

  const client = clientOf(origin, credentials, undefined, scope);
  // The registry's or Space's display name, read while the person
  // approves; a sign-in goes on where it does not answer.
  const described = scope === "registry" ? describedRegistryName(origin) : client.describe().then((description) => description.displayName || null, () => null);
  // At a listed instance, only its entry's account (git-host-2): read in
  // the turn that would store the token, so another stores nothing.
  const admit = (account: HostAccount): HostError | null => {
    if (scope === "registry") return null;
    let recorded;
    try { recorded = readHomeFile(dir); } catch { return null; }
    const listedAccount = recorded ? instanceAt(recorded, origin)?.account : undefined;
    return listedAccount && listedAccount.id !== account.id ? anotherAccountError(listedAccount.login) : null;
  };

  let flow: DeviceSignIn | undefined;
  let stopped = false;
  // An interrupt ends the wait for the flow's start at once: no token
  // is stored before the flow ends, and a start answered late is
  // cancelled.
  let stop!: () => void;
  const stopping = new Promise<never>((_, reject) => { stop = () => reject(new Error("stopped")); });
  stopping.catch(() => undefined);
  const release = interrupt.hold(() => {
    stopped = true;
    flow?.cancel();
    stop();
  });
  let account: HostAccount;
  try {
    const starting = client.startDeviceSignIn({ admit });
    try {
      flow = await Promise.race([starting, stopping]);
    } catch (error) {
      if (stopped) {
        starting.then((late) => late.cancel(), () => undefined);
        throw new Interrupted("interrupted; nothing recorded");
      }
      throw new Refusal(signInCause(error, name));
    }
    if (stopped) {
      flow.cancel();
    } else {
      console.log(`Sign in at ${name} with this code in your browser:`);
      console.log(`  URL:  ${flow.verificationUri}`);
      console.log(`  Code: ${flow.userCode}`);
      console.log(`Waiting for ${name} to confirm (Ctrl-C to stop)…`);
    }
    try {
      account = await flow.done;
    } catch (error) {
      if (stopped) throw new Interrupted("interrupted; nothing recorded");
      throw new Refusal(signInCause(error, name));
    }
  } finally {
    release();
  }

  // The token is stored; an interrupt now stops the wait for the
  // display name, and the record is made before the command ends.
  let skipName!: () => void;
  const nameSkipped = new Promise<null>((resolve) => { skipName = () => resolve(null); });
  const deferred = interrupt.hold(() => skipName());
  try {
    const displayName = await Promise.race([described, nameSkipped]);
    if (scope === "registry") {
      if (held) await clientOf(origin, heldOnly(held), undefined, scope).signOut().catch(() => undefined);
      // The registry's own name, kept for every command naming it (cli-22).
      if (displayName !== null) {
        cacheRegistryName(dir, origin, displayName, true);
        name = displayName;
      }
      console.log(`Signed in at ${name} as @${account.login}.`);
      if (interrupt.requested) throw new Interrupted(`interrupted once signed in at ${name} as @${account.login}`);
      return;
    }
    let recorded;
    try {
      recorded = updateHomeFile(dir, (current) => {
        const next = withSignIn(current, origin, account, homeFilePath(dir));
        return displayName === null ? next : withDisplayName(next, origin, displayName) ?? next;
      });
    } catch (error) {
      // Nothing recorded, so the pair the sign-in replaced is put back
      // and the device just signed in is revoked from memory alone.
      const issued = await credentials.read().catch(() => null);
      if (issued && credentials.replace(issued, held)) {
        await clientOf(origin, heldOnly(issued)).signOut().catch(() => undefined);
      }
      throw new Refusal(`not signed in: ${(error as Error).message}; nothing recorded`);
    }
    // A forced sign-in replaced the device's former token: that device
    // is revoked at the instance, so it lists this device once.
    if (held) await clientOf(origin, heldOnly(held)).signOut().catch(() => undefined);
    const shown = displayName ?? name;
    const isDefault = recorded.instances[0]?.origin === origin;
    console.log(`Signed in at ${shown} as @${account.login}${isDefault ? " (default)" : ""}.`);
    if (interrupt.requested) throw new Interrupted(`interrupted once signed in at ${shown} as @${account.login}`);
  } finally {
    deferred();
  }
};
