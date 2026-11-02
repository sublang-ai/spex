// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An applet's tab over a simulated document and a stand-in client
// (applets-1, applets-2, DR-176): the line above the page reads "from
// <package> <version>" — the tab itself names the applet — and opens
// the package's row where its environment is managed: on the project's
// Packages tab for the project's package, on the Playbooks surface for a
// global one.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AppletTab } from "./AppletTab.js";
import { useAppStore } from "../state/store.js";
import type { SpexClient } from "../lib/client.js";
import { OWN_KEY, PROJECT_ID } from "../fixtures/playbooks.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  useAppStore.setState({ workspaceTabs: {} });
});

const client = {
  command: vi.fn(async () => ({ path: "/applets/cap/" })),
} as unknown as SpexClient;

/** A page's package row as it draws once the page is shown: the
 * project's Packages tab, or the Playbooks surface. */
function packageRow(container: "packages-tab" | "playbooks-surface", name: string): HTMLElement {
  const box = document.createElement("div");
  box.dataset.testid = container;
  const row = document.createElement("li");
  row.dataset.testid = `env-package-${name}`;
  row.scrollIntoView = vi.fn();
  box.append(row);
  document.body.append(box);
  return row;
}

describe("applets-1: the line names the package the applet comes from", () => {
  test("from the project's environment, the line opens the package's row on the Packages tab", async () => {
    useAppStore.setState({ workspaceTabs: { [PROJECT_ID]: "applet:x" } });
    const onShowGlobal = vi.fn();
    render(
      <AppletTab
        applet={{ tab: `applet:${PROJECT_ID}:report`, repository: PROJECT_ID, id: "report", package: "acme/report", version: "1.2.0" }}
        project={PROJECT_ID}
        client={() => client}
        coreUrl="ws://127.0.0.1:4100/ws"
        connected
        onShowGlobal={onShowGlobal}
      />,
    );
    const line = screen.getByTestId("applet-source");
    expect(line.textContent).toBe("from acme/report 1.2.0");
    expect(line.tagName).toBe("BUTTON");
    fireEvent.click(line);
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe("packages");
    expect(onShowGlobal).not.toHaveBeenCalled();
    // Once the tab draws the row, it is brought into view there.
    const surface = packageRow("playbooks-surface", "acme/report");
    const row = packageRow("packages-tab", "acme/report");
    await vi.waitFor(() => expect(row.scrollIntoView).toHaveBeenCalled());
    expect(surface.scrollIntoView).not.toHaveBeenCalled();
  });

  test("from the global environment, with no version yet, the line shows the Playbooks surface and its row there", async () => {
    useAppStore.setState({ workspaceTabs: { [PROJECT_ID]: `applet:${OWN_KEY}:board` } });
    const onShowGlobal = vi.fn();
    render(
      <AppletTab
        applet={{ tab: `applet:${OWN_KEY}:board`, repository: OWN_KEY, id: "board", package: "me/board", version: null }}
        project={PROJECT_ID}
        client={() => client}
        coreUrl="ws://127.0.0.1:4100/ws"
        connected
        onShowGlobal={onShowGlobal}
      />,
    );
    const line = screen.getByTestId("applet-source");
    expect(line.textContent).toBe("from me/board");
    const tab = packageRow("packages-tab", "me/board");
    const surface = packageRow("playbooks-surface", "me/board");
    fireEvent.click(line);
    expect(onShowGlobal).toHaveBeenCalledTimes(1);
    // The project's tab stays as it was: the row is not the project's.
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe(`applet:${OWN_KEY}:board`);
    await vi.waitFor(() => expect(surface.scrollIntoView).toHaveBeenCalled());
    expect(tab.scrollIntoView).not.toHaveBeenCalled();
  });
});
