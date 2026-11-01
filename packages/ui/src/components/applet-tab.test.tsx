// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An applet's tab over a simulated document and a stand-in client
// (applets-1, applets-2, DR-172): the line above the page reads "from
// <package> <version>" — the tab itself names the applet — and opens
// the package's row on the project's Packages tab, under "Packages"
// for the project's environment and under "Personal" for yours.

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

/** The Packages tab's row as it draws once the tab is shown. */
function packagesRow(section: "project" | "personal", name: string): HTMLElement {
  const box = document.createElement("div");
  box.dataset.testid = `packages-${section}`;
  const row = document.createElement("li");
  row.dataset.testid = `env-package-${name}`;
  row.scrollIntoView = vi.fn();
  box.append(row);
  document.body.append(box);
  return row;
}

describe("applets-1: the line names the package the applet comes from", () => {
  test("from the project's environment, the line opens the package's row under Packages", async () => {
    useAppStore.setState({ workspaceTabs: { [PROJECT_ID]: "applet:x" } });
    render(
      <AppletTab
        applet={{ tab: `applet:${PROJECT_ID}:report`, repository: PROJECT_ID, id: "report", package: "acme/report", version: "1.2.0" }}
        project={PROJECT_ID}
        client={() => client}
        coreUrl="ws://127.0.0.1:4100/ws"
        connected
      />,
    );
    const line = screen.getByTestId("applet-source");
    expect(line.textContent).toBe("from acme/report 1.2.0");
    expect(line.tagName).toBe("BUTTON");
    fireEvent.click(line);
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe("packages");
    // Once the tab draws the row, it is brought into view.
    const personal = packagesRow("personal", "acme/report");
    const row = packagesRow("project", "acme/report");
    await vi.waitFor(() => expect(row.scrollIntoView).toHaveBeenCalled());
    expect(personal.scrollIntoView).not.toHaveBeenCalled();
  });

  test("from your own group's environment, with no version yet, the line opens the row under Personal", async () => {
    render(
      <AppletTab
        applet={{ tab: `applet:${OWN_KEY}:board`, repository: OWN_KEY, id: "board", package: "me/board", version: null }}
        project={PROJECT_ID}
        client={() => client}
        coreUrl="ws://127.0.0.1:4100/ws"
        connected
      />,
    );
    const line = screen.getByTestId("applet-source");
    expect(line.textContent).toBe("from me/board");
    const project = packagesRow("project", "me/board");
    const personal = packagesRow("personal", "me/board");
    fireEvent.click(line);
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe("packages");
    await vi.waitFor(() => expect(personal.scrollIntoView).toHaveBeenCalled());
    expect(project.scrollIntoView).not.toHaveBeenCalled();
  });
});
