// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The team servers an instance lists (run-view-170, core-service-128,
// DR-133, DR-159): on this computer's Space surface, each server stands
// as one line beneath the heading of its group, before that group's
// rows — its name, then "Connected" with Disconnect in its overflow
// where a seat is open at it, and Connect otherwise. Connect, and "Open
// on <server>" on any row (space-111), run one flow per server
// (state/server-opens): the first open on this device shows the
// instance's contract in the words its record fixes (Spex Space
// DR-029), rendered in the page's language, "I understand" sending
// `server.open` with consent and remembered on this device, so a later
// open sends it at once. While the open runs the line says so, and past
// ten seconds that a seat's first start can take a minute; once the
// seat is open and until its sign-in at the instance completes
// (core-service-142), the line links the page where the person approves
// it, the desktop having opened it, and a sign-in that failed reads its
// cause with "Sign in again". A refusal reads the core's relayed cause
// on the line. A server whose group the instance's read does not list
// stands at the foot of the instance's section, as does a listing's
// failure. The listing is read as the surface opens, again after an open
// or a close lands and whenever the open seats change; the seat's
// endpoint and bearer stay in the local core.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { InstanceState, ServerInfo, ServerListing } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { instanceName } from "../lib/instances.js";
import { openExternalBridge } from "../lib/space.js";
import { usePlaceStore } from "../state/place-context.js";
import { answerContract, connectServer, sendServerAct, serverPlace, useServerOpens } from "../state/server-opens.js";
import { signInAgainLabel } from "./SpaceSignIn.js";
import { MoreMenu } from "./SpaceMenu.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

/** How long an open runs before the line says a seat's first start can
 * take a minute (run-view-170). */
const SLOW_OPEN_MS = 10_000;

const LINK_CLASS = "text-brand-600 hover:underline dark:text-brand-300";

/** The line that links the page where the person approves a seat's
 * sign-in (run-view-170, run-view-174): on the desktop it opens through
 * the bridge, as the shell opened it (app-shell-37); on the served page
 * the link's own target. */
export function ApprovalLink({ href, testId, children }: { href: string; testId: string; children?: ReactNode }) {
  return (
    <a
      data-testid={testId}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLASS}
      onClick={(event) => {
        const open = openExternalBridge();
        if (!open) return;
        event.preventDefault();
        void open(href).catch(() => false);
      }}
    >
      {children}
    </a>
  );
}

/** "Approve Spex on <server> in your browser" (run-view-170). */
export const approveLabel = (server: string): string =>
  i18n._({
    id: "Approve Spex on {server} in your browser",
    values: { server },
    comment: "a team server's line while its seat signs in at the instance: links the instance's page where the person approves the device named \"Spex on <server>\"; {server} is the server's name",
  });

/** The servers listing the Space surface shows (core-service-128). */
export interface ServersRead {
  /** The last listing read; undefined until one is. */
  listing?: ServerListing;
  /** Read the listing again. */
  reload(): void;
}

/** Read the servers listing while `key` names what it depends on — the
 * signed-in instances and the open seats — and again whenever that
 * changes or an open or a close lands; undefined reads nothing and holds
 * nothing. Only the newest read's reply applies. */
export function useServers(key: string | undefined): ServersRead {
  const store = usePlaceStore();
  const landed = useServerOpens((state) => state.landed);
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
  const first = useRef(landed);
  useEffect(() => {
    if (key === undefined) {
      reads.current += 1;
      setListing(undefined);
      return;
    }
    reload();
  }, [key, reload]);
  useEffect(() => {
    if (landed === first.current || key === undefined) return;
    first.current = landed;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);
  return { listing, reload };
}

/** The servers of one group of an instance, as one line each beneath its
 * heading (run-view-170, space-1); nothing while it has none. */
export function GroupServers({
  instance,
  group,
  listing,
  connected,
  onNote,
}: {
  instance: InstanceState;
  /** The group's full path, which a server's listing names. */
  group: string;
  listing: ServerListing | undefined;
  connected: boolean;
  onNote: Note;
}) {
  const servers = (listing?.servers ?? []).filter(
    (server) => server.instance === instance.origin && server.group.toLowerCase() === group.toLowerCase(),
  );
  if (servers.length === 0) return null;
  return (
    <ul data-testid={`space-group-servers-${group}`} className="flex min-w-0 flex-col gap-0.5">
      {servers.map((server) => (
        <ServerLine key={server.id} instance={instance} server={server} connected={connected} onNote={onNote} />
      ))}
    </ul>
  );
}

/** What an instance's listing leaves to its section's foot (run-view-170):
 * the listing's failure, and the servers of a group its read does not
 * list. */
export function InstanceServers({
  instance,
  listing,
  groups,
  connected,
  onNote,
}: {
  instance: InstanceState;
  listing: ServerListing;
  /** The full paths of the groups the section heads, each standing its
   * own servers. */
  groups: readonly string[];
  connected: boolean;
  onNote: Note;
}) {
  const known = new Set(groups.map((path) => path.toLowerCase()));
  const servers = (listing.servers ?? []).filter(
    (server) => server.instance === instance.origin && !known.has(server.group.toLowerCase()),
  );
  const failure = (listing.failures ?? []).find((entry) => entry.instance === instance.origin);
  if (servers.length === 0 && !failure) return null;
  const title = i18n._({ id: "Servers", comment: "the team servers an instance lets the person open a seat on" });
  return (
    <section data-testid={`space-servers-${instance.origin}`} aria-label={title} className="flex min-w-0 flex-col gap-1">
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
        <ul className="flex min-w-0 flex-col gap-0.5">
          {servers.map((server) => (
            <ServerLine key={server.id} instance={instance} server={server} connected={connected} onNote={onNote} withGroup />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** One server's line (run-view-170): its name, Connect or "Connected"
 * with Disconnect in its overflow, the contract beneath it on its first
 * open here, the open while it runs, the seat's sign-in until it
 * completes, and a refusal's cause. */
function ServerLine({
  instance,
  server,
  connected,
  onNote,
  withGroup = false,
}: {
  instance: InstanceState;
  server: ServerInfo;
  connected: boolean;
  onNote: Note;
  /** Its group's path beside its name, where it stands under none. */
  withGroup?: boolean;
}) {
  const store = usePlaceStore();
  const place = serverPlace(server);
  // The seat open there as the local core's `server.state` names it,
  // with its sign-in at the instance (core-service-142).
  const seat = store((state) => state.seats.find((entry) => entry.place === place));
  const line = useServerOpens((state) => state.lines[place]);
  const asking = line?.asking === true;
  const acting = line?.acting;
  const busy = acting !== undefined;
  const refusal = line?.refusal;
  const [slow, setSlow] = useState(false);
  const controlRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  // An open still running past ten seconds says a seat's first start
  // can take a minute (run-view-170).
  useEffect(() => {
    setSlow(false);
    if (acting !== "open") return;
    const elapsed = Date.now() - (line?.since ?? Date.now());
    const timer = setTimeout(() => setSlow(true), Math.max(0, SLOW_OPEN_MS - elapsed));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acting]);

  // A refusal reads in the live note too (DR-010 §7).
  const said = useRef(refusal);
  useEffect(() => {
    if (refusal !== undefined && refusal !== said.current) onNote(refusal);
    said.current = refusal;
  }, [refusal, onNote]);

  /** Focus left with the contract's controls, or with an act's busy
   * control, returns to the line's own control, never to the page
   * (DR-010 §6). */
  const refocus = () =>
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      (controlRef.current ?? moreRef.current)?.focus();
    }, 0);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) refocus();
    wasBusy.current = busy;
  });

  const answer = (understood: boolean) => {
    answerContract(store, server, understood);
    refocus();
  };

  const name = server.name;
  const host = instanceName(instance);
  const signIn = server.open ? seat?.signIn : undefined;
  // What the line reads beside the server (run-view-170): the open while
  // it runs, the seat's sign-in until it completes, else "Connected"
  // where a seat is open.
  let status: ReactNode = null;
  if (acting === "open") {
    status = (
      <span data-testid={`space-server-connecting-${place}`} role="status" className="min-w-0 text-xs text-neutral-500">
        {slow
          ? i18n._({
              id: "Connecting to {server}… the first start of your seat can take a minute",
              values: { server: name },
              comment: "a team server's line while its seat opens, past ten seconds; {server} is the server's name",
            })
          : i18n._({
              id: "Connecting to {server}…",
              values: { server: name },
              comment: "a team server's line while its seat opens; {server} is the server's name",
            })}
      </span>
    );
  } else if (signIn?.state === "running") {
    status = (
      <span className="min-w-0 text-xs">
        <ApprovalLink href={signIn.verificationUri} testId={`space-server-approve-${place}`}>
          {approveLabel(name)}
        </ApprovalLink>
      </span>
    );
  } else if (server.open && signIn?.state !== "failed") {
    status = (
      <span className="min-w-0 truncate text-xs text-neutral-500">
        <span aria-hidden>· </span>
        <span data-testid={`space-server-connected-${place}`}>
          {i18n._({ id: "Connected", comment: "a team server's line where a seat is open at it" })}
        </span>
      </span>
    );
  }
  return (
    <li data-testid={`space-server-${place}`} data-open={server.open ? "1" : "0"} className="flex min-w-0 flex-col gap-1 pl-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-sm bg-neutral-400" />
        <span className="min-w-0 truncate" title={name}>
          {name}
        </span>
        {withGroup ? (
          <span className="min-w-0 truncate text-xs text-neutral-500" title={server.group}>
            {server.group}
          </span>
        ) : null}
        {status ? " " : null}
        {status}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {server.open ? (
            <MoreMenu
              of={name}
              testId={`space-server-more-${place}`}
              buttonRef={moreRef}
              disabled={!connected || busy}
              entries={[
                {
                  label: i18n._({ id: "Disconnect", comment: "close the seat open on a team server" }),
                  testId: `space-server-disconnect-${place}`,
                  onSelect: () => void sendServerAct(store, server, "close"),
                },
              ]}
            />
          ) : (
            <button
              ref={controlRef}
              type="button"
              data-testid={`space-server-control-${place}`}
              className={SECONDARY}
              disabled={!connected || busy || asking}
              onClick={() => connectServer(store, server)}
            >
              {i18n._({ id: "Connect", comment: "open a seat on a team server" })}
            </button>
          )}
        </span>
      </div>
      {signIn?.state === "failed" ? (
        // The seat's sign-in failed: its cause, as the seat said it, and
        // the sign-in started afresh (run-view-170, core-service-142).
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-3.5">
          <p role="alert" data-testid={`space-server-signin-error-${place}`} className="min-w-0 text-xs text-red-600 dark:text-red-400">
            {i18n._({
              id: "{cause}.",
              values: { cause: signIn.cause.replace(/[.。]\s*$/, "") },
              comment: "the sign-in's cause, a phrase the core sends without its final stop, as one sentence",
            })}
          </p>
          <button
            type="button"
            data-testid={`space-server-signin-${place}`}
            className={SECONDARY}
            disabled={!connected || busy}
            onClick={() => void sendServerAct(store, server, "signin")}
          >
            {signInAgainLabel()}
          </button>
        </div>
      ) : null}
      {asking ? (
        <div
          data-testid={`space-server-contract-${place}`}
          className="ml-3.5 flex min-w-0 flex-col gap-2 rounded border border-neutral-200 p-2 dark:border-neutral-800"
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
        <p role="alert" data-testid={`space-server-refusal-${place}`} className="pl-3.5 text-xs text-red-600 dark:text-red-400">
          {refusal}
        </p>
      ) : null}
    </li>
  );
}
