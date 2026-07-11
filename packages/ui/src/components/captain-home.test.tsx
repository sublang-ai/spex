// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-29/31: the Captain home greets, starts in one motion, filters
// the slash menu, and keeps the quick start dismissed.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);

import { CaptainHome, QUICK_START_KEY } from "./CaptainHome.js";

const PROJECT = { id: "p1", path: "/tmp/demo", name: "demo", registeredAt: 0 };

import type { PlaybookSummary } from "@sublang/spex-core/protocol";

const PLAYBOOKS: PlaybookSummary[] = [
  {
    id: "code",
    from: "@sublang/playbook/code/registry",
    command: "code",
    intent: "software development workflow",
    players: { coder: "claude-opus" },
  },
  {
    id: "discuss",
    from: "@sublang/playbook/discuss/registry",
    command: "discuss",
    intent: "design discussion",
    players: { host: "claude-opus" },
  },
];

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function renderHome({
  onStart = vi.fn(async () => {}),
  storage = memoryStorage(),
} = {}) {
  const view = render(
    <CaptainHome
      projects={[PROJECT]}
      playbooks={PLAYBOOKS}
      captainRef="claude-opus"
      profiles={[{ id: "claude-opus", adapter: "claude", model: "claude-opus-4-8" }]}
      readiness={[]}
      connected
      onRegisterPath={vi.fn()}
      onInitProject={vi.fn()}
      onOpenSettings={vi.fn()}
      onStart={onStart}
      storage={storage}
    />,
  );
  return { onStart, storage, view };
}

describe("RUN-29: captain home structure and one-motion start", () => {
  test("greeting, composer, project chip, and captain identity render", () => {
    renderHome();
    expect(screen.getByText(/Hello! I'm your Captain/).textContent).toBeTruthy();
    expect(screen.getByTestId("start-composer")).toBeTruthy();
    expect(screen.getByTestId("project-chip").textContent).toContain(
      "Choose a project",
    );
    expect(screen.getByText(/claude-opus \(claude-opus-4-8\)/)).toBeTruthy();
    expect(screen.getByTestId("captain-settings")).toBeTruthy();
  });

  test("submitting with a chosen project starts the session with the text", async () => {
    const { onStart } = renderHome();
    fireEvent.click(screen.getByTestId("project-chip"));
    fireEvent.click(screen.getByText("demo"));
    fireEvent.change(screen.getByTestId("start-composer"), {
      target: { value: "fix the bug" },
    });
    fireEvent.click(screen.getByTestId("start-send"));
    await vi.waitFor(() =>
      expect(onStart).toHaveBeenCalledWith("p1", "fix the bug"),
    );
  });

  test("submitting without a project opens the chip menu instead", () => {
    const { onStart } = renderHome();
    fireEvent.change(screen.getByTestId("start-composer"), {
      target: { value: "do it" },
    });
    fireEvent.click(screen.getByTestId("start-send"));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-menu")).toBeTruthy();
  });
});

describe("RUN-31: slash menu and quick start dismissal", () => {
  test("typing / lists playbooks with intents and filters by prefix", () => {
    renderHome();
    const composer = screen.getByTestId("start-composer");
    fireEvent.change(composer, { target: { value: "/" } });
    expect(screen.getByTestId("slash-menu").textContent).toContain("/code");
    expect(screen.getByTestId("slash-menu").textContent).toContain(
      "design discussion",
    );
    fireEvent.change(composer, { target: { value: "/di" } });
    const menu = screen.getByTestId("slash-menu");
    expect(menu.textContent).toContain("/discuss");
    expect(menu.textContent).not.toContain("/code");
  });

  test("selecting from the slash menu inserts without dispatching", async () => {
    const { onStart } = renderHome();
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "/co" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(composer.value).toBe("/code ");
    expect(onStart).not.toHaveBeenCalled();
  });

  test("dismissing the quick start persists across remounts", () => {
    const storage = memoryStorage();
    const first = renderHome({ storage });
    expect(screen.getByTestId("quick-start")).toBeTruthy();
    fireEvent.click(screen.getByTestId("quick-start-dismiss"));
    expect(screen.queryByTestId("quick-start")).toBeNull();
    expect(storage.getItem(QUICK_START_KEY)).toBe("1");
    first.view.unmount();
    renderHome({ storage });
    expect(screen.queryByTestId("quick-start")).toBeNull();
  });
});
