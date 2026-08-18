// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-29/31/35: the Captain home greets, starts in one motion, filters
// the slash menu, keeps the quick start dismissed, and tunes the
// Captain's inline agent block in place (DR-019).

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

afterEach(cleanup);

import { CaptainHome, QUICK_START_KEY } from "./CaptainHome.js";

const PROJECT = { id: "p1", path: "/tmp/demo", name: "demo", registeredAt: 0 };

import type {
  AgentSummary,
  PlaybookSummary,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";
import type { AgentPatch } from "../lib/config-ops.js";

// A hand-written `instruction` rides along in the summary: the editor
// never surfaces it, so a merge patch must leave it out (DR-019).
const CAPTAIN: AgentSummary = {
  adapter: "claude",
  model: "claude-opus-4-8",
  effort: "high",
  instruction: "Route the boss's words to a playbook.",
  permissions: { mode: "auto" },
};

const READY: ReadinessEntry[] = [
  { adapter: "claude", ready: true, usedBy: ["captain", "code.coder"] },
];

const PLAYBOOKS: PlaybookSummary[] = [
  {
    id: "code",
    from: "@sublang/playbook/code/registry",
    command: "code",
    intent: "software development workflow",
    roles: { coder: { playerId: "dev.coder", display: "claude-opus-5" } },
  },
  {
    id: "review",
    from: "@sublang/playbook/review/registry",
    command: "review",
    intent: "design review",
    roles: { host: { playerId: "dev.coder", display: "claude-opus-5" } },
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
  onSaveCaptain = vi.fn(async (_patch: AgentPatch) => {}),
  onNavigate = vi.fn(),
  onOpenPalette = vi.fn(),
  hasProject = true,
  // null renders the no-captain state; undefined would fall back to
  // this default the way an omitted option does.
  captain = CAPTAIN as AgentSummary | null,
  onRecheckReadiness = undefined as (() => Promise<unknown>) | undefined,
  readiness = READY,
  configStatus = undefined as "valid" | "invalid" | "missing" | undefined,
  configErrors = undefined as string[] | undefined,
  storage = memoryStorage(),
} = {}) {
  const view = render(
    <CaptainHome
      hasProject={hasProject}
      projectName={hasProject ? PROJECT.name : undefined}
      playbooks={PLAYBOOKS}
      captain={captain ?? undefined}
      readiness={readiness}
      connected
      configStatus={configStatus}
      configErrors={configErrors}
      onRecheckReadiness={onRecheckReadiness}
      onOpenPalette={onOpenPalette}
      onNavigate={onNavigate}
      onSaveCaptain={onSaveCaptain}
      onStart={onStart}
      storage={storage}
    />,
  );
  return {
    onStart,
    onSaveCaptain,
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
    // The Captain shows as the one agent chip (DR-019): adapter ·
    // model @ effort, with the adapter's readiness dot.
    const chip = screen.getByTestId("agent-chip");
    expect(chip.textContent).toContain("claude · claude-opus-4-8 @ high");
    expect(chip.getAttribute("aria-label")).toBe(
      "Captain: claude · claude-opus-4-8 @ high (ready)",
    );
    expect(screen.getByTestId("captain-settings")).toBeTruthy();
  });

  test("a config with no captain reads as not set, gear inert", () => {
    renderHome({ captain: null, configStatus: "invalid" });
    expect(screen.queryByTestId("agent-chip")).toBeNull();
    expect(screen.getByText("not set")).toBeTruthy();
    expect(
      (screen.getByTestId("captain-settings") as HTMLButtonElement).disabled,
    ).toBe(true);
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
    expect(screen.getByText(/Pick a project in the sidebar/)).toBeTruthy();
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
      "design review",
    );
    fireEvent.change(composer, { target: { value: "/re" } });
    const menu = screen.getByTestId("slash-menu");
    expect(menu.textContent).toContain("/review");
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

describe("RUN-35: in-place captain agent editing (DR-019)", () => {
  test("the gear opens the shared editor over the captain's block", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("captain-settings"));
    const popover = screen.getByTestId("agent-popover");
    expect(popover.getAttribute("aria-label")).toBe("Captain agent");
    expect(within(popover).getByTestId("agent-editor")).toBeTruthy();
    // Every adapter the embedded runtime knows is offered, the
    // captain's own selected, and readiness rides on the choice.
    for (const adapter of ["claude", "codex", "gemini", "kimi", "opencode"]) {
      expect(within(popover).getByTestId(`agent-adapter-${adapter}`)).toBeTruthy();
    }
    expect(
      within(popover)
        .getByTestId("agent-adapter-claude")
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(within(popover).getByTitle("ready")).toBeTruthy();
    expect(
      (within(popover).getByTestId("agent-model") as HTMLInputElement).value,
    ).toBe("claude-opus-4-8");
    // Copying from the Captain is meaningless in the Captain's own
    // editor: the action is absent here (DR-019).
    expect(within(popover).queryByTestId("agent-same-as-captain")).toBeNull();
  });

  test("a model edit saves a merge patch and never leaves the home", async () => {
    const { onSaveCaptain } = renderHome();
    fireEvent.click(screen.getByTestId("captain-settings"));
    fireEvent.change(screen.getByTestId("agent-model"), {
      target: { value: "claude-opus-4-8[1m]" },
    });
    fireEvent.click(screen.getByTestId("agent-save"));
    await vi.waitFor(() =>
      expect(onSaveCaptain).toHaveBeenCalledWith({
        adapter: "claude",
        model: "claude-opus-4-8[1m]",
        effort: "high",
        permissions: { mode: "auto" },
      }),
    );
    // The patch carries the surfaced keys only: the hand-written
    // instruction survives by being absent from the patch.
    expect(onSaveCaptain.mock.calls[0][0]).not.toHaveProperty("instruction");
    await vi.waitFor(() =>
      expect(screen.queryByTestId("agent-popover")).toBeNull(),
    );
    // Never navigated anywhere: the home is still mounted.
    expect(screen.getByTestId("captain-home")).toBeTruthy();
  });

  test("an adapter switch saves through the same patch path", async () => {
    const { onSaveCaptain } = renderHome();
    fireEvent.click(screen.getByTestId("captain-settings"));
    fireEvent.click(screen.getByTestId("agent-adapter-codex"));
    fireEvent.click(screen.getByTestId("agent-save"));
    await vi.waitFor(() =>
      expect(onSaveCaptain).toHaveBeenCalledWith({
        adapter: "codex",
        model: "claude-opus-4-8",
        effort: "high",
        permissions: { mode: "auto" },
      }),
    );
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
      configErrors: ["playbooks.code.players.coder: unknown adapter 'gpt'"],
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
  test("the heads-up bubble names the adapter and offers a re-check", async () => {
    const onRecheckReadiness = vi.fn(async () => {});
    renderHome({
      onRecheckReadiness,
      readiness: [
        {
          adapter: "claude",
          ready: false,
          requirement: "set ANTHROPIC_API_KEY or sign in with Claude Code",
          usedBy: ["captain", "code.coder"],
        },
      ],
    });
    const bubble = screen.getByText(/aren't ready yet/).closest("div")!;
    expect(bubble.textContent).toContain("claude");
    expect(bubble.textContent).toContain("ANTHROPIC_API_KEY");
    fireEvent.click(screen.getByTestId("recheck-readiness"));
    await vi.waitFor(() => expect(onRecheckReadiness).toHaveBeenCalled());
  });
});
