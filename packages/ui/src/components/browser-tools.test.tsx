// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import type { AgentSummary, Command, CommandResults } from "@sublang/spex-core/protocol";
import { AgentEditor } from "./AgentEditor.js";
import { AgentSettingsPopover } from "./AgentSettings.js";
import { ConfiguredBrowserTools } from "./ConfiguredBrowserTools.js";
import { sessionAgents } from "../lib/session-agents.js";
import { setCaptain } from "../lib/config-ops.js";
import { setClientForTests, deliverServerMessageForTests, useAppStore } from "../state/store.js";
import type { SpexClient } from "../lib/client.js";

const context = { kind: "project" as const, id: "c0f5d091-b491-48ab-aaff-aee270fcb0f2" };
const ready = { browser: { status: "supported" as const } };
const agent: AgentSummary = { adapter: "codex", permissions: { mode: "auto", networkAccess: "deny" } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
type Handler = (type: Command["type"], fields: Record<string, unknown>) => unknown;
function fixture(handler?: Handler) {
  const command = vi.fn(async (type: Command["type"], fields: Record<string, unknown>) => {
    const result = handler?.(type, fields);
    if (result !== undefined) return result;
    if (type === "agent.capabilities") return ready;
    if (type === "agent.options") return { adapter: fields.adapter, effortValues: ["high"], subagentEffortValues: [], fastModeSupported: false, subagentModelSupported: false, discovery: { status: "unavailable", reason: "No model account in fixture" } };
    if (type === "browser.prepare") return { status: "ready", checkedAt: 1 };
    if (type === "browser.cancel") return { canceled: true };
    return null;
  });
  setClientForTests({ command } as unknown as SpexClient);
  return command;
}
function checkbox() { return screen.getByRole("checkbox", { name: "Browser" }) as HTMLInputElement; }
async function supported() { await screen.findByRole("button", { name: "Set up browser" }); }
beforeEach(() => { useAppStore.setState({ connection: "open" }); });
afterEach(() => { cleanup(); setClientForTests(undefined); vi.restoreAllMocks(); });

describe("contextual browser controls through the core client", () => {
  test("queries proposed settings, prepares separately, then explicitly saves a shared choice", async () => {
    const pending = deferred<CommandResults["browser.prepare"]>();
    const command = fixture((type) => type === "browser.prepare" ? pending.promise : undefined);
    render(<AgentEditor initial={agent} context={context} onSave={setCaptain} />);
    await supported();
    expect(command).toHaveBeenCalledWith("agent.capabilities", { agent, context });
    expect(checkbox().checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Set up browser" }));
    const fields = command.mock.calls.find(([type]) => type === "browser.prepare")![1];
    expect(fields).toMatchObject({ agent, context });
    act(() => deliverServerMessageForTests({ type: "browser.progress", operationId: fields.operationId as string, progress: { stage: "installing" } }));
    expect(screen.getByText("Installing browser…")).toBeTruthy();
    act(() => deliverServerMessageForTests({ type: "browser.progress", operationId: "another-operation", progress: { stage: "launching" } }));
    expect(screen.queryByText("Checking browser launch and screenshot…")).toBeNull();
    await act(async () => pending.resolve({ status: "ready", checkedAt: 42 }));
    expect(screen.getByText("Browser ready")).toBeTruthy();
    expect(checkbox().checked).toBe(false);
    expect(command.mock.calls.some(([type]) => type === "config.edit")).toBe(false);
    fireEvent.click(checkbox());
    fireEvent.click(screen.getByTestId("agent-save"));
    await waitFor(() => expect(command).toHaveBeenCalledWith("config.edit", { op: { kind: "captain.set", patch: { ...agent, browser: true } } }));
  });

  test("known missing output is shown without disabling browser; context changes clear notes and discard stale facts", async () => {
    const stale = deferred<CommandResults["agent.capabilities"]>();
    fixture((type, fields) => {
      if (type !== "agent.capabilities") return;
      const id = (fields.context as typeof context).id;
      if (id === context.id) return stale.promise;
      if (id === "without-output") return { ...ready, media: { sources: [] } };
      return ready; // absent media is unknown, not known unsupported
    });
    const view = render(<AgentEditor initial={agent} context={context} onSave={() => {}} />);
    view.rerender(<AgentEditor initial={agent} context={{ ...context, id: "without-output" }} onSave={() => {}} />);
    const note = "This agent cannot return screenshot files to this conversation.";
    await screen.findByText(note);
    await supported();
    expect(checkbox().disabled).toBe(false);
    await act(async () => stale.resolve({ ...ready, media: { sources: ["base64"] } }));
    expect(screen.getByText(note)).toBeTruthy();
    view.rerender(<AgentEditor initial={agent} context={{ ...context, id: "unknown-output" }} onSave={() => {}} />);
    await supported();
    expect(screen.queryByText(note)).toBeNull();
    expect(checkbox().disabled).toBe(false);
  });

  test("approval support follows contextual facts without disabling browser tools", async () => {
    fixture((type, fields) => {
      if (type !== "agent.capabilities") return;
      const id = (fields.context as typeof context).id;
      return {...ready, ...(id === "known" ? {approvals: {status: "supported"}} : id === "blocked" ? {approvals: {status: "unsupported", code: "unsupported-transport"}} : {})};
    });
    const view = render(<AgentEditor initial={agent} context={{...context, id: "known"}} onSave={() => {}} />);
    await screen.findByText("Tool requests can ask for approval; existing agent policies still apply.");
    view.rerender(<AgentEditor initial={agent} context={{...context, id: "blocked"}} onSave={() => {}} />);
    await screen.findByText("This agent cannot ask for tool approval in this conversation.");
    expect(checkbox().disabled).toBe(false);
    view.rerender(<AgentEditor initial={agent} context={{...context, id: "unknown"}} onSave={() => {}} />);
    await screen.findByText("Tool approval support is unverified.");
    expect(screen.queryByText("This agent cannot ask for tool approval in this conversation.")).toBeNull();
  });

  test("an unsupported choice can be cleared without setup or weakened permissions", async () => {
    const command = fixture((type) => type === "agent.capabilities" ? { browser: { status: "unsupported", code: "tool-restriction", message: "The selected policy excludes browser tools" } } : undefined);
    render(<AgentEditor initial={{ ...agent, browser: true }} context={context} onSave={setCaptain} />);
    await screen.findByText("The selected policy excludes browser tools");
    expect(checkbox().disabled).toBe(false);
    expect((screen.getByTestId("agent-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(checkbox());
    expect(checkbox().disabled).toBe(true);
    fireEvent.click(screen.getByTestId("agent-save"));
    await waitFor(() => expect(command).toHaveBeenCalledWith("config.edit", { op: { kind: "captain.set", patch: { ...agent, browser: false } } }));
    expect(command.mock.calls.some(([type]) => type === "browser.prepare")).toBe(false);
  });

  test("context changes discard stale replies and closing cancels owned preparation", async () => {
    const old = deferred<CommandResults["agent.capabilities"]>();
    const setup = deferred<CommandResults["browser.prepare"]>();
    const command = fixture((type, fields) => type === "agent.capabilities" && (fields.context as typeof context).id === context.id ? old.promise : type === "browser.prepare" ? setup.promise : undefined);
    const view = render(<AgentEditor initial={agent} context={context} onSave={() => {}} />);
    const next = { ...context, id: "f1065e28-867a-4532-a8e6-1f879b61d5ba" };
    view.rerender(<AgentEditor initial={agent} context={next} onSave={() => {}} />);
    await supported();
    await act(async () => old.resolve({ browser: { status: "unsupported", code: "unsupported-host", message: "Stale host" } }));
    expect(screen.queryByText("Stale host")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Set up browser" }));
    const operationId = command.mock.calls.find(([type]) => type === "browser.prepare")![1].operationId;
    view.unmount();
    expect(command).toHaveBeenCalledWith("browser.cancel", { operationId });
    await act(async () => setup.resolve({ status: "ready", checkedAt: 42 }));
  });

  test("setup failure and retry preserve the choice, and cancellation ignores late success", async () => {
    const pending = deferred<CommandResults["browser.prepare"]>();
    let attempts = 0;
    const command = fixture((type) => type === "browser.prepare" ? (++attempts === 1 ? { status: "not-ready", code: "launch-failed", message: "Install the host browser libraries" } : pending.promise) : undefined);
    render(<AgentEditor initial={{ ...agent, model: "custom" }} context={context} onSave={setCaptain} />);
    await supported();
    fireEvent.click(screen.getByRole("button", { name: "Set up browser" }));
    await screen.findByText("Install the host browser libraries");
    expect(checkbox().checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Retry browser setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel browser setup" }));
    await screen.findByText("Browser setup cancelled");
    await act(async () => pending.resolve({ status: "ready", checkedAt: 1 }));
    expect(screen.queryByText("Browser ready")).toBeNull();
    expect(command.mock.calls.some(([type]) => type === "config.edit")).toBe(false);
  });

  test("session overrides preserve false and reset browser to configuration with null", async () => {
    const command = fixture();
    const summary = { path: "/tmp/spex.yaml", captain: { ...agent, browser: true }, players: [], playbooks: [] };
    const [captain] = sessionAgents({ players: [], agentSettings: {} }, summary as Parameters<typeof sessionAgents>[1]);
    const onSave = vi.fn(async () => {});
    const view = render(<AgentSettingsPopover agent={captain!} context={context} readOnly={false} anchorRef={createRef()} onSave={onSave} onClose={() => {}} />);
    await supported();
    expect(checkbox().checked).toBe(true);
    fireEvent.click(checkbox());
    fireEvent.click(screen.getByTestId("agent-save-captain"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ browser: false })));
    expect(command.mock.calls.some(([type]) => type === "config.edit")).toBe(false);
    view.unmount();
    render(<AgentSettingsPopover agent={{ ...captain!, settings: { browser: false } }} context={context} readOnly={false} anchorRef={createRef()} onSave={onSave} onClose={() => {}} />);
    await supported();
    fireEvent.click(screen.getByRole("button", { name: "Use browser setting from Settings" }));
    expect(checkbox().checked).toBe(true);
    fireEvent.click(screen.getByTestId("agent-save-captain"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ browser: null })));
  });

  test("authoring prepares its configured agent without editing global or draft choice", async () => {
    const command = fixture();
    render(<ConfiguredBrowserTools agent={agent} context={{ kind: "draft", projectId: "me/demo-spex", id: "my-draft" }} />);
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("draft-browser"));
    await supported();
    expect(command).toHaveBeenCalledWith("agent.capabilities", { agent, context: { kind: "draft", projectId: "me/demo-spex", id: "my-draft" } });
    expect(checkbox().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Set up browser" }));
    await screen.findByText("Browser ready");
    expect(checkbox().checked).toBe(false);
    expect(command.mock.calls.some(([type]) => type === "config.edit")).toBe(false);
  });

  test("unknown custom-adapter support never becomes an enabled browser by inference", async () => {
    const command = fixture((type) => type === "agent.capabilities" ? { browser: { status: "unknown" } } : undefined);
    render(<AgentEditor initial={agent} onSave={() => {}} />);
    await screen.findByText("Browser support is unverified");
    expect(checkbox().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Set up browser" })).toBeNull();
    expect(command.mock.calls.some(([type]) => type === "browser.prepare")).toBe(false);
  });

  test("a failed cancel request does not falsely report that host work stopped", async () => {
    const pending = deferred<CommandResults["browser.prepare"]>();
    fixture((type) => type === "browser.prepare" ? pending.promise : type === "browser.cancel" ? Promise.reject(new Error("Cancellation unavailable")) : undefined);
    const view = render(<AgentEditor initial={agent} onSave={() => {}} />);
    await supported();
    fireEvent.click(screen.getByRole("button", { name: "Set up browser" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel browser setup" }));
    await screen.findByText("Cancellation unavailable");
    expect(screen.queryByText("Browser setup cancelled")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel browser setup" })).toBeTruthy();
    await act(async () => pending.resolve({ status: "ready", checkedAt: 1 }));
    expect(screen.getByText("Browser ready")).toBeTruthy();
    view.unmount();
  });

  test("a configured browser keeps other edits saveable while support is unknown, but a new browser waits for support", async () => {
    const command = fixture((type) => type === "agent.capabilities" ? Promise.reject(new Error("Core unavailable")) : undefined);
    const view = render(<AgentEditor initial={{ ...agent, browser: true }} context={context} onSave={setCaptain} />);
    await screen.findByText("Core unavailable");
    fireEvent.change(screen.getByTestId("agent-effort"), { target: { value: "high" } });
    const save = screen.getByTestId("agent-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(command).toHaveBeenCalledWith("config.edit", { op: { kind: "captain.set", patch: { ...agent, effort: "high" } } }));
    view.unmount();

    // Copying a browser-enabled Captain newly admits Browser here.
    render(<AgentEditor initial={agent} captain={{ ...agent, browser: true }} context={context} onSave={() => {}} />);
    await screen.findByText("Core unavailable");
    fireEvent.click(screen.getByTestId("agent-same-as-captain"));
    expect(checkbox().checked).toBe(true);
    expect((screen.getByTestId("agent-save") as HTMLButtonElement).disabled).toBe(true);
  });

  test("a conversation keeps its configured browser while saving an effort its support check could not confirm", async () => {
    fixture((type) => type === "agent.capabilities" ? { browser: { status: "unknown" } } : undefined);
    const summary = { path: "/tmp/spex.yaml", captain: { ...agent, browser: true }, players: [], playbooks: [] };
    const [captain] = sessionAgents({ players: [], agentSettings: {} }, summary as Parameters<typeof sessionAgents>[1]);
    const onSave = vi.fn(async () => {});
    render(<AgentSettingsPopover agent={captain!} context={context} readOnly={false} anchorRef={createRef()} onSave={onSave} onClose={() => {}} />);
    await screen.findByText("Browser support is unverified");
    fireEvent.change(screen.getByTestId("agent-captain-effort-mode"), { target: { value: "pin" } });
    fireEvent.change(screen.getByTestId("agent-captain-effort-value"), { target: { value: "high" } });
    const save = screen.getByTestId("agent-save-captain") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ effort: "high", browser: null })));
  });

  test("a failed capability check can retry without losing an unsaved model", async () => {
    let failed = false;
    fixture((type) => { if (type === "agent.capabilities" && !failed) { failed = true; return Promise.reject(new Error("Core unavailable")); } });
    render(<AgentEditor initial={{ ...agent, model: "kept-model" }} onSave={() => {}} />);
    await screen.findByText("Core unavailable");
    expect(checkbox().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry browser support check" }));
    await supported();
    expect((screen.getByTestId("agent-model") as HTMLInputElement).value).toBe("kept-model");
  });
});
