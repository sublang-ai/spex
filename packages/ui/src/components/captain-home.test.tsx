// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-29/31: the Captain home greets, starts in one motion, filters
// the slash menu, and keeps the quick start dismissed.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);

import { CaptainHome, QUICK_START_KEY } from "./CaptainHome.js";

const PROJECT = { id: "p1", path: "/tmp/demo", name: "demo", registeredAt: 0 };

import type {
  PlaybookSummary,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

const PLAYBOOKS: PlaybookSummary[] = [
  {
    id: "code",
    from: "@sublang/playbook/code/registry",
    command: "code",
    intent: "software development workflow",
    players: { coder: { ref: "claude-opus", display: "claude-opus-4-8" } },
  },
  {
    id: "discuss",
    from: "@sublang/playbook/discuss/registry",
    command: "discuss",
    intent: "design discussion",
    players: { host: { ref: "claude-opus", display: "claude-opus-4-8" } },
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
  onSelectCaptain = vi.fn(async () => {}),
  onSaveProfile = vi.fn(async () => {}),
  onOpenPast = vi.fn(),
  onNavigate = vi.fn(),
  onOpenPalette = vi.fn(),
  hasProject = true,
  onRecheckReadiness = undefined as (() => Promise<unknown>) | undefined,
  readiness = [] as ReadinessEntry[],
  configStatus = undefined as "valid" | "invalid" | "missing" | undefined,
  configErrors = undefined as string[] | undefined,
  pastSessions = [] as { id: string; projectName: string; endedAt: number | null }[],
  storage = memoryStorage(),
} = {}) {
  const view = render(
    <CaptainHome
      hasProject={hasProject}
      projectName={hasProject ? PROJECT.name : undefined}
      playbooks={PLAYBOOKS}
      captainRef="claude-opus"
      profiles={[{ id: "claude-opus", adapter: "claude", model: "claude-opus-4-8" }]}
      readiness={readiness}
      connected
      configStatus={configStatus}
      configErrors={configErrors}
      onRecheckReadiness={onRecheckReadiness}
      onOpenPalette={onOpenPalette}
      onNavigate={onNavigate}
      onSelectCaptain={onSelectCaptain}
      onSaveProfile={onSaveProfile}
      pastSessions={pastSessions}
      onOpenPast={onOpenPast}
      onStart={onStart}
      storage={storage}
    />,
  );
  return {
    onStart,
    onSelectCaptain,
    onSaveProfile,
    onOpenPast,
    onNavigate,
    onOpenPalette,
    storage,
    view,
  };
}

describe("RUN-29: captain home structure and one-motion start", () => {
  test("greeting, composer, and captain identity render", () => {
    renderHome();
    expect(screen.getByText(/Hello! This is demo/).textContent).toBeTruthy();
    expect(screen.getByTestId("start-composer")).toBeTruthy();
    expect(screen.getByText(/claude-opus \(claude-opus-4-8\)/)).toBeTruthy();
    expect(screen.getByTestId("captain-settings")).toBeTruthy();
  });

  test("submitting in the bar's project starts with the text", async () => {
    const { onStart } = renderHome();
    fireEvent.change(screen.getByTestId("start-composer"), {
      target: { value: "fix the bug" },
    });
    fireEvent.click(screen.getByTestId("start-send"));
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith("fix the bug"));
  });

  test("submitting without a project opens the palette, draft intact", () => {
    const { onStart, onOpenPalette } = renderHome({ hasProject: false });
    expect(screen.getByText(/Pick a project up top/)).toBeTruthy();
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "do it" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(onStart).not.toHaveBeenCalled();
    expect(onOpenPalette).toHaveBeenCalled();
    expect(composer.value).toBe("do it");
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

describe("RUN-35: in-place captain profile popover", () => {
  test("gear opens the popover; selecting switches; editing saves", async () => {
    const { onSelectCaptain, onSaveProfile } = renderHome();
    fireEvent.click(screen.getByTestId("captain-settings"));
    const popover = screen.getByTestId("profile-popover");
    expect(popover.textContent).toContain("claude-opus");
    expect(popover.textContent).toContain("claude-opus-4-8");

    fireEvent.click(screen.getByTestId("profile-option-claude-opus"));
    await vi.waitFor(() =>
      expect(onSelectCaptain).toHaveBeenCalledWith("claude-opus"),
    );

    fireEvent.change(screen.getByTestId("popover-model"), {
      target: { value: "claude-opus-4-8[1m]" },
    });
    fireEvent.click(screen.getByTestId("popover-save"));
    await vi.waitFor(() =>
      expect(onSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ id: "claude-opus" }),
        expect.objectContaining({ model: "claude-opus-4-8[1m]" }),
      ),
    );
    // Never navigated anywhere: the home is still mounted.
    expect(screen.getByTestId("captain-home")).toBeTruthy();
  });
});

describe("RUN-43: Escape hides the slash menu, never the draft", () => {
  test("Escape dismisses; typing brings the menu back", () => {
    renderHome();
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "/co" } });
    expect(screen.getByTestId("slash-menu")).toBeTruthy();
    fireEvent.keyDown(composer, { key: "Escape" });
    expect(screen.queryByTestId("slash-menu")).toBeNull();
    expect(composer.value).toBe("/co");
    fireEvent.change(composer, { target: { value: "/cod" } });
    expect(screen.getByTestId("slash-menu")).toBeTruthy();
  });
});

describe("RUN-44: broken config surfaces in the thread", () => {
  test("an invalid config renders the errors and a Settings link", () => {
    const { onNavigate } = renderHome({
      configStatus: "invalid",
      configErrors: ["profiles.claude-opus: unknown adapter"],
    });
    expect(
      screen.getByText(/config file has errors/).textContent,
    ).toBeTruthy();
    expect(
      screen.getByText(/unknown adapter/, { exact: false }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Open Settings →"));
    expect(onNavigate).toHaveBeenCalledWith("Settings");
  });
});

describe("RUN-45: readiness heals at hand", () => {
  test("the heads-up bubble offers a working re-check", async () => {
    const onRecheckReadiness = vi.fn(async () => {});
    renderHome({
      onRecheckReadiness,
      readiness: [
        {
          profileId: "claude-opus",
          adapter: "claude",
          ready: false,
          requirement: "set ANTHROPIC_API_KEY or sign in with Claude Code",
        },
      ],
    });
    expect(screen.getByText(/aren't ready yet/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("recheck-readiness"));
    await vi.waitFor(() => expect(onRecheckReadiness).toHaveBeenCalled());
  });
});

describe("RUN-36: past sessions are listed and openable", () => {
  test("ended sessions render with project and time; click opens", () => {
    const onOpenPast = vi.fn();
    renderHome({
      onOpenPast,
      pastSessions: [
        { id: "s-old", projectName: "demo", endedAt: 1700000000000 },
      ],
    });
    const list = screen.getByTestId("past-sessions");
    expect(list.textContent).toContain("demo");
    fireEvent.click(screen.getByTestId("past-session-s-old"));
    expect(onOpenPast).toHaveBeenCalledWith("s-old");
  });
});
