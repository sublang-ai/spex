// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SET coverage for the DR-019 surfaces: the Captain's inline agent
// editor writing merge patches, and the per-adapter readiness panel
// naming the positions each adapter serves.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

vi.mock("../state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store.js")>();
  return { ...actual, getClient: () => ({ command: commandMock }) };
});

import { SettingsSurface } from "./SettingsSurface.js";
import { useAppStore } from "../state/store.js";
import type { ConfigState, ReadinessEntry } from "@sublang/spex-core/protocol";

const CONFIG: ConfigState = {
  status: "valid",
  seeded: false,
  summary: {
    path: "/tmp/playbook.config.yaml",
    captain: {
      adapter: "claude",
      model: "claude-opus-4-8",
      effort: "high",
      permissions: { mode: "auto" },
    },
    playbooks: [
      {
        id: "code",
        from: "@sublang/playbook/code/registry",
        command: "code",
        intent: "software development workflow",
        players: {
          coder: {
            agent: { adapter: "claude", model: "claude-opus-4-8[1m]" },
            display: "claude-opus-4-8[1m]",
          },
          reviewer: {
            agent: { adapter: "codex", model: "gpt-5.5" },
            display: "gpt-5.5",
          },
        },
      },
    ],
  },
};

const READINESS: ReadinessEntry[] = [
  { adapter: "claude", ready: true, usedBy: ["captain", "code.coder"] },
  {
    adapter: "codex",
    ready: false,
    requirement: "set OPENAI_API_KEY or sign in with the Codex CLI",
    usedBy: ["code.reviewer"],
  },
];

function renderSettings() {
  useAppStore.setState({
    configState: CONFIG,
    readiness: READINESS,
    refreshReadiness: vi.fn(async () => {}),
  });
  return render(<SettingsSurface />);
}

beforeEach(() => {
  commandMock.mockReset();
  commandMock.mockResolvedValue(CONFIG);
});

describe("SET: the Captain's inline agent", () => {
  test("the captain renders as a chip over its own block", () => {
    renderSettings();
    const section = screen.getByTestId("captain-section");
    expect(section.textContent).toContain("claude");
    expect(section.textContent).toContain("claude-opus-4-8");
    expect(section.textContent).toContain("high");
  });

  test("editing the model writes a captain.set merge patch", async () => {
    renderSettings();
    const section = screen.getByTestId("captain-section");
    fireEvent.change(within(section).getByTestId("agent-model"), {
      target: { value: "claude-opus-4-8[1m]" },
    });
    fireEvent.click(within(section).getByTestId("agent-save"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalled());
    const [type, payload] = commandMock.mock.calls[0];
    expect(type).toBe("config.edit");
    expect(payload.op.kind).toBe("captain.set");
    expect(payload.op.patch.model).toBe("claude-opus-4-8[1m]");
    // A merge patch never carries hand-written fields it did not edit.
    expect(payload.op.patch).not.toHaveProperty("instruction");
  });
});

describe("SET: adapter readiness panel", () => {
  test("one row per adapter, with requirement and the positions it serves", () => {
    renderSettings();
    const claude = screen.getByTestId("agent-row-claude");
    expect(claude.textContent).toContain("claude");
    // Positions render per DR-019: the Captain and each playbook role.
    expect(claude.textContent).toMatch(/Captain/i);
    expect(claude.textContent).toMatch(/coder/i);

    const codex = screen.getByTestId("agent-row-codex");
    expect(codex.textContent).toContain(
      "set OPENAI_API_KEY or sign in with the Codex CLI",
    );
    expect(codex.textContent).toMatch(/reviewer/i);
    // Deduped: no third row for an adapter used twice.
    expect(screen.queryAllByTestId(/^agent-row-/)).toHaveLength(2);
  });

  test("re-check triggers a readiness refresh", () => {
    const refreshReadiness = vi.fn(async () => {});
    useAppStore.setState({
      configState: CONFIG,
      readiness: READINESS,
      refreshReadiness,
    });
    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: /Re-check readiness/i }));
    expect(refreshReadiness).toHaveBeenCalled();
  });
});
