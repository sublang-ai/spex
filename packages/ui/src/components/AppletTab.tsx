// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An applet's tab (applets-2, DR-161): shown, it asks the core for the
// applet's capability path and fills the pane with an embedded browser
// frame there, sandboxed so the page's origin is opaque — it reaches
// neither this page nor its token, keeps no storage, and reads only its
// capability's own paths — and sent no referrer, so it learns nothing
// of this page's address. One line above reads "from <package>
// <version>", opening the package's row on the project's Packages tab
// (applets-1, DR-172), and offers Reload; a refusal shows its cause in
// the frame's place.

import { useCallback, useEffect, useState } from "react";

import type { SpexClient } from "../lib/client.js";
import type { AppletTab as AppletTabEntry } from "../lib/applets.js";
import { endpointOrigin } from "../lib/applets.js";
import { openPackageRow } from "../lib/package-row.js";
import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { Icon } from "./Icon.js";

/** No `allow-same-origin`: the page's origin stays opaque (applets-2). */
export const APPLET_SANDBOX = "allow-scripts allow-forms allow-modals allow-downloads";

export function AppletTab({
  applet,
  project,
  client,
  coreUrl,
  connected,
}: {
  applet: AppletTabEntry;
  /** The spex repository of the project whose tab this is. */
  project: string;
  client: () => SpexClient | undefined;
  /** The WebSocket endpoint this page's client dials. */
  coreUrl: string | undefined;
  connected: boolean;
}) {
  const store = usePlaceStore();
  const [path, setPath] = useState<string>();
  const [error, setError] = useState<string>();
  // Each Reload loads the frame again at a fresh address the core reads
  // as the same path.
  const [loads, setLoads] = useState(0);

  const openApplet = useCallback(async (): Promise<void> => {
    const current = client();
    if (!current) return;
    try {
      const reply = await current.command("applet.open", {
        repository: applet.repository,
        applet: applet.id,
        project,
      });
      setError(undefined);
      setPath(reply.path);
    } catch (cause) {
      setPath(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [client, applet.repository, applet.id, project]);

  useEffect(() => {
    if (!connected) return;
    void openApplet();
  }, [connected, openApplet]);

  const origin = endpointOrigin(coreUrl);
  const source = path && origin ? `${origin}${path}${loads > 0 ? `?r=${loads}` : ""}` : undefined;
  // The tab names the applet; the line names where it comes from, one
  // whole phrase per case (localization-4).
  const label = applet.version
    ? i18n._({
        id: "from {name} {version}",
        comment: "the line above an applet's page: the package and version it comes from; it opens the package's row on the Packages tab",
        values: { name: applet.package, version: applet.version },
      })
    : i18n._({
        id: "from {name}",
        comment: "the line above an applet's page, for a package with no version yet: the package it comes from; it opens the package's row on the Packages tab",
        values: { name: applet.package },
      });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="applet-tab">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <span className="min-w-0 flex-1 truncate">
          <button
            type="button"
            data-testid="applet-source"
            title={i18n._({ id: "Open its package", comment: "tooltip of an applet's from-line: shows the package's row on the Packages tab" })}
            onClick={() =>
              openPackageRow(store, project, applet.package, applet.repository === project ? "project" : "personal")
            }
            className="max-w-full truncate text-left hover:text-brand-600 hover:underline dark:hover:text-brand-300"
          >
            {label}
          </button>
        </span>
        <button
          type="button"
          data-testid="applet-reload"
          disabled={!connected}
          onClick={() => {
            setLoads((count) => count + 1);
            void openApplet();
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
          {i18n._({ id: "Reload", comment: "button: load an applet's page again" })}
        </button>
      </div>
      {error ? (
        <div role="alert" data-testid="applet-error" className="m-auto max-w-prose p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      ) : source ? (
        <iframe
          key={source}
          title={i18n._({
            id: "Applet {id}",
            comment: "the accessible name of the frame an applet's page shows in",
            values: { id: applet.id },
          })}
          src={source}
          sandbox={APPLET_SANDBOX}
          referrerPolicy="no-referrer"
          data-testid="applet-frame"
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      ) : (
        <div className="m-auto text-sm text-neutral-500" data-testid="applet-loading">
          {i18n._({ id: "Opening the applet…", comment: "while the core answers an applet's path" })}
        </div>
      )}
    </div>
  );
}
