// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The team servers an instance lists (run-view-170, core-service-128,
// DR-133): on this computer's Groups surface, under each signed-in
// instance's heading, every server the instance lets the person open,
// by its name and its group, with "Open" where no seat is open at it
// and "Close" where one is. The first Open for a server on this device
// shows the instance's contract in the words its record fixes
// (Spex Space DR-029), rendered in the page's language; "I understand"
// sends `server.open` with consent and is remembered on this device, so
// a later Open sends it at once. A refusal reads the core's relayed
// cause beside its server. The listing is read as the surface opens,
// again after an open or a close lands and whenever the open seats
// change; the seat's endpoint and bearer stay in the local core.

import { useCallback, useEffect, useRef, useState } from "react";
import type { InstanceState, ServerInfo, ServerListing } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { instanceName } from "../lib/instances.js";
import { usePlaceStore } from "../state/place-context.js";
import { safeStorageGet, safeStorageSet } from "../state/store.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

/** A server's place, `<instance origin>#<server id>` (core-service-128). */
function serverPlace(server: ServerInfo): string {
  return `${server.instance}#${server.id}`;
}

/** Where this device remembers the contract was understood for a
 * server (run-view-170): this computer's own page storage, never a
 * seat's. */
function contractKey(server: ServerInfo): string {
  return `spex.serverContract:${serverPlace(server)}`;
}

/** The servers listing the Groups surface shows (core-service-128). */
export interface ServersRead {
  /** The last listing read; undefined until one is. */
  listing?: ServerListing;
  /** Read the listing again. */
  reload(): void;
}

/** Read the servers listing while `key` names what it depends on — the
 * signed-in instances and the open seats — and again whenever that
 * changes; undefined reads nothing and holds nothing. Only the newest
 * read's reply applies. */
export function useServers(key: string | undefined): ServersRead {
  const store = usePlaceStore();
  const [listing, setListing] = useState<ServerListing>();
  const reads = useRef(0);
  const reload = useCallback(() => {
    reads.current += 1;
    const read = reads.current;
    void Promise.resolve()
      .then(() => store.getClient().command("server.list", {}))
      .then((reply) => {
        if (read === reads.current) setListing(reply);
      })
      // A listing that cannot be read leaves the last one standing; each
      // instance's own failure arrives in the reply.
      .catch(() => {});
  }, [store]);
  useEffect(() => {
    if (key === undefined) {
      reads.current += 1;
      setListing(undefined);
      return;
    }
    reload();
  }, [key, reload]);
  return { listing, reload };
}

/** An instance's servers under its heading (run-view-170): nothing
 * while it lists none, its listing's failure where its read failed. */
export function InstanceServers({
  instance,
  listing,
  connected,
  onChanged,
  onNote,
}: {
  instance: InstanceState;
  listing: ServerListing;
  connected: boolean;
  /** An open or a close landed: the listing is read again. */
  onChanged(): void;
  onNote: Note;
}) {
  const servers = (listing.servers ?? []).filter((server) => server.instance === instance.origin);
  const failure = (listing.failures ?? []).find((entry) => entry.instance === instance.origin);
  if (servers.length === 0 && !failure) return null;
  const title = i18n._({ id: "Servers", comment: "the team servers an instance lets the person open a seat on" });
  return (
    <section
      data-testid={`space-servers-${instance.origin}`}
      aria-label={title}
      className="flex min-w-0 flex-col gap-1"
    >
      <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{title}</h3>
      {failure ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {i18n._({
            id: "Couldn't read the servers: {reason}",
            values: { reason: failure.message },
            comment: "the instance's servers listing failed; {reason} is the core's relayed cause",
          })}
        </p>
      ) : null}
      {servers.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1">
          {servers.map((server) => (
            <ServerRow
              key={server.id}
              instance={instance}
              server={server}
              connected={connected}
              onChanged={onChanged}
              onNote={onNote}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** One server (run-view-170): its name and group, Open or Close, the
 * contract beneath it on its first Open here, and a refusal's cause. */
function ServerRow({
  instance,
  server,
  connected,
  onChanged,
  onNote,
}: {
  instance: InstanceState;
  server: ServerInfo;
  connected: boolean;
  onChanged(): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const place = serverPlace(server);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const controlRef = useRef<HTMLButtonElement>(null);

  /** Focus left with the contract's controls returns to the server's
   * own control, never to the page (DR-010 §6). */
  const refocus = () =>
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) controlRef.current?.focus();
    }, 0);

  /** Send the open — always with consent, the contract having been
   * shown on this device — or the close; a refusal's cause stands
   * beside the server, a landed act reads the listing again. */
  const send = async (act: "open" | "close") => {
    setBusy(true);
    setRefusal(undefined);
    try {
      const client = store.getClient();
      if (act === "open") {
        await client.command("server.open", { instance: server.instance, serverId: server.id, consented: true });
      } else {
        await client.command("server.close", { instance: server.instance, serverId: server.id });
      }
      onChanged();
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
    } finally {
      setBusy(false);
      refocus();
    }
  };

  /** The first Open here shows the contract; a later one sends at once. */
  const open = () => {
    if (safeStorageGet(contractKey(server)) === "1") void send("open");
    else setAsking(true);
  };

  /** Back from the contract, focus on the server's own control. */
  const answer = (understood: boolean) => {
    setAsking(false);
    refocus();
    if (!understood) return;
    safeStorageSet(contractKey(server), "1");
    void send("open");
  };

  const name = server.name;
  const host = instanceName(instance);
  return (
    <li data-testid={`space-server-${place}`} data-open={server.open ? "1" : "0"} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="min-w-0 truncate font-medium">{name}</span>
        <span className="min-w-0 truncate text-xs text-neutral-500" title={server.group}>
          {server.group}
        </span>
        <button
          ref={controlRef}
          type="button"
          data-testid={`space-server-control-${place}`}
          className={`${SECONDARY} ml-auto`}
          disabled={!connected || busy || asking}
          onClick={() => (server.open ? void send("close") : open())}
        >
          {server.open
            ? i18n._({ id: "Close", comment: "close the seat open on a team server" })
            : i18n._({ id: "Open", comment: "open a seat on a team server" })}
        </button>
      </div>
      {asking ? (
        <div
          data-testid={`space-server-contract-${place}`}
          className="flex min-w-0 flex-col gap-2 rounded border border-neutral-200 p-2 dark:border-neutral-800"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              answer(false);
            }
          }}
        >
          <p className="text-xs">
            {i18n._({
              id: "Opening a seat places your sign-in on {server}. Whoever runs {server} can act as you: in your spaces, in your records, and with the account you sign in to {instance} with, wherever it reaches. Agents on {server} run on the sign-ins its administrator set up, unless you set your own. A credential you place on {server} stays there until you remove it. Retiring the server or revoking the seat under Devices stops new use; a credential already on the server lasts until it expires.",
              values: { server: name, instance: host },
              comment: "the instance's contract, in the words its record fixes, shown before a seat's first open on this device; {server} is the server's name, {instance} the instance's; Devices is the instance's page of devices",
            })}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              data-testid={`space-server-consent-${place}`}
              className={PRIMARY}
              onClick={() => answer(true)}
            >
              {i18n._({ id: "I understand", comment: "accepting a team server's contract, which opens the seat" })}
            </button>
            <button
              type="button"
              // Safe default: focus lands here, Enter backs out.
              autoFocus
              data-testid={`space-server-cancel-${place}`}
              className={SECONDARY}
              onClick={() => answer(false)}
            >
              {i18n._({ id: "Cancel", comment: "default cancel button: back out of the act" })}
            </button>
          </div>
        </div>
      ) : null}
      {refusal ? (
        <p role="alert" data-testid={`space-server-refusal-${place}`} className="text-xs text-red-600 dark:text-red-400">
          {refusal}
        </p>
      ) : null}
    </li>
  );
}
