// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent cards reading their model catalogs again on Re-check
// (settings-5, DR-217), through the real catalog hook over a store whose
// catalog and readiness requests the test answers.

import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AgentCards } from "./AgentCards.js";
import { useAppStore } from "../state/store.js";
import type { AdapterName, AgentOptions, ConfigState, ReadinessEntry } from "@sublang/spex-core/protocol";

afterEach(cleanup);

const CONFIG: ConfigState = {
  status: "valid",
  seeded: true,
  revision: "rev-1",
  summary: { path: "/tmp/playbook.config.yaml", standsAside: [], captain: { adapter: "claude" }, players: [], playbooks: [] },
};

function ready(adapter: "claude" | "codex"): ReadinessEntry {
  return {
    adapter,
    ready: true,
    usedBy: adapter === "claude" ? ["captain"] : [],
    fastModeSupported: false,
    subagentModelSupported: adapter === "claude",
    faults: [],
    platform: "darwin",
    shell: "zsh",
    ...(adapter === "claude" ? { baseUrl: { state: "third-party", host: "api.deepseek.com" } } : {}),
  } as ReadinessEntry;
}

function catalog(adapter: AdapterName, defaultModel: string): AgentOptions {
  return {
    adapter,
    effortValues: [],
    fastModeSupported: false,
    subagentModelSupported: false,
    subagentEffortValues: [],
    discovery: { status: "available", models: [], defaultModel },
  } as AgentOptions;
}

/** A catalog request the test settles by hand. */
interface Pending {
  adapter: AdapterName;
  resolve(options: AgentOptions): void;
  reject(cause: Error): void;
}

function mount() {
  const pending: Pending[] = [];
  const loadAgentOptions = vi.fn((adapter: AdapterName) => new Promise<AgentOptions>((resolve, reject) => {
    pending.push({ adapter, resolve, reject });
  }));
  let finishReadiness!: () => void;
  const refreshReadiness = vi.fn(() => new Promise<void>((resolve) => { finishReadiness = resolve; }));
  useAppStore.setState({ configState: CONFIG, readiness: [ready("claude"), ready("codex")], projectConfigs: {}, loadAgentOptions, refreshReadiness } as never);
  render(<AgentCards />);
  const claudeRequests = () => pending.filter((request) => request.adapter === "claude");
  return { pending, loadAgentOptions, refreshReadiness, claudeRequests, finishReadiness: () => finishReadiness() };
}

async function settle(request: Pending | undefined, options: AgentOptions | Error) {
  await act(async () => {
    if (options instanceof Error) request!.reject(options);
    else request!.resolve(options);
  });
}

describe("settings-5: Re-check reads the cards' model catalogs again", () => {
  test("the earlier model stays muted beside Updating model… until the new default replaces it", async () => {
    const view = mount();
    await act(async () => {});
    await settle(view.claudeRequests()[0], catalog("claude", "claude-opus-5-5"));
    expect(screen.getByTestId("agent-default-claude").textContent).toBe("claude-opus-5-5");
    expect(screen.queryByTestId("agent-updating-claude")).toBeNull();

    fireEvent.click(screen.getByTestId("agents-recheck"));
    expect(view.refreshReadiness).toHaveBeenCalledTimes(1);
    // The catalog is read only once the readiness request settles.
    expect(view.claudeRequests()).toHaveLength(1);
    await act(async () => view.finishReadiness());
    expect(view.claudeRequests()).toHaveLength(2);

    const line = screen.getByTestId("agent-runs-claude");
    expect(line.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("agent-updating-claude").textContent).toBe("Updating model…");
    expect(screen.getByTestId("agent-default-claude").textContent).toBe("claude-opus-5-5");
    expect(screen.getByTestId("agent-default-claude").className).toContain("text-neutral-400");

    await settle(view.claudeRequests()[1], catalog("claude", "deepseek-v4-pro[1m]"));
    expect(screen.getByTestId("agent-default-claude").textContent).toBe("deepseek-v4-pro[1m]");
    expect(screen.getByTestId("agent-default-claude").className).not.toContain("text-neutral-400");
    expect(screen.queryByTestId("agent-updating-claude")).toBeNull();
    expect(screen.getByTestId("agent-runs-claude").getAttribute("aria-busy")).toBeNull();
  });

  test("a failed reading shows Unavailable, never the earlier model", async () => {
    const view = mount();
    await act(async () => {});
    await settle(view.claudeRequests()[0], catalog("claude", "claude-opus-5-5"));
    fireEvent.click(screen.getByTestId("agents-recheck"));
    await act(async () => view.finishReadiness());
    await settle(view.claudeRequests()[1], new Error("spawn ENOTDIR"));
    expect(screen.getByTestId("agent-default-claude").textContent).toBe("Unavailable");
    expect(screen.getByTestId("agent-runs-claude").textContent).not.toContain("claude-opus-5-5");
    expect(screen.queryByTestId("agent-updating-claude")).toBeNull();
  });

  test("a readiness refresh Re-check did not start, as on the window regaining focus, reads no catalog", async () => {
    const view = mount();
    await act(async () => {});
    const before = view.loadAgentOptions.mock.calls.length;
    expect(before).toBe(2);
    await act(async () => {
      const refreshing = useAppStore.getState().refreshReadiness();
      view.finishReadiness();
      await refreshing;
    });
    expect(view.loadAgentOptions).toHaveBeenCalledTimes(before);
    expect(screen.queryByTestId("agent-updating-claude")).toBeNull();
  });
});
