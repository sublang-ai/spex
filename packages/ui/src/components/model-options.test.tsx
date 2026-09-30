// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdapterName, AgentOptions } from "@sublang/spex-core/protocol";
import { useAppStore } from "../state/store.js";
import { AgentEditor, AgentEditorPopover } from "./AgentEditor.js";
import { BindingEditorPopover } from "./BindingEditor.js";
import { createRef } from "react";

const originalLoad = useAppStore.getState().loadAgentOptions;
const options = (adapter: AdapterName = "claude"): AgentOptions => ({
  adapter, effortValues: ["low", "high", "max", ...(adapter === "claude" ? ["ultracode"] : adapter === "codex" ? ["ultra"] : [])], fastModeSupported: true,
  discovery: { status: "available", ...(adapter === "claude" ? { unreportedEffortValues: ["ultracode"] } : {}), models: [
    { id: "claude-fable-5-1", name: "Fable", effortValues: ["low", "high"], fastModeSupported: false },
    { id: "plain-model", name: "Plain", effortValues: [], fastModeSupported: false },
    { id: "unknown-model", name: "Unknown" },
    { id: "fable", name: "Fable alias", resolvedModel: "claude-fable-5-1-resolved", effortValues: ["high"], fastModeSupported: false },
  ] },
});
beforeEach(() => useAppStore.setState({ loadAgentOptions: vi.fn(async (adapter) => options(adapter)) }));
afterEach(() => { cleanup(); useAppStore.setState({ loadAgentOptions: originalLoad }); });

async function ready() { await screen.findByText("Models reported by the installed runtime."); }

/** Choose a row of a model field's listbox the way a pointer does:
 * open it from its trigger, then press the row holding `value`. */
function chooseModel(testId: string, value: string) {
  fireEvent.click(screen.getByTestId(`${testId}-trigger`));
  const row = within(screen.getByTestId(`${testId}-listbox`)).getAllByRole("option")
    .find((option) => option.dataset.value === value);
  if (!row) throw new Error(`no row for ${value}`);
  fireEvent.click(row);
}

const CUSTOM_ROW = "__spex_custom__";

test("runtime model selection narrows tuning and preserves a draft needing correction", async () => {
  const save = vi.fn();
  render(<AgentEditor initial={{ adapter: "claude", model: "claude-fable-5.1", effort: "max", fastMode: true }} onSave={save} />);
  await ready();
  expect((screen.getByTestId("agent-model") as HTMLInputElement).value).toBe("claude-fable-5.1");
  chooseModel("agent-model", "claude-fable-5-1");
  expect(screen.queryByTestId("agent-model")).toBeNull();
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect((screen.getByTestId("agent-effort") as HTMLSelectElement).value).toBe("max");
  expect((screen.getByTestId("agent-save") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByTestId("agent-effort"), { target: { value: "high" } });
  fireEvent.click(screen.getByTestId("agent-fast-mode"));
  fireEvent.click(screen.getByTestId("agent-save"));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ adapter: "claude", model: "claude-fable-5-1", effort: "high", fastMode: null }));
});

test("known no effort differs from unknown model support and allows explicit custom models", async () => {
  render(<AgentEditor initial={{ adapter: "claude" }} onSave={vi.fn()} />);
  await ready();
  chooseModel("agent-model", "plain-model");
  expect(Array.from((screen.getByTestId("agent-effort") as HTMLSelectElement).options).map((entry) => entry.value)).toEqual(["", "ultracode"]);
  expect(screen.queryByTestId("agent-fast-mode")).toBeNull();
  chooseModel("agent-model", "unknown-model");
  expect(screen.getByText(/Effort options apply to the adapter/)).toBeTruthy();
  expect(screen.getByTestId("agent-fast-mode")).toBeTruthy();
  chooseModel("agent-model", CUSTOM_ROW);
  fireEvent.change(screen.getByTestId("agent-model"), { target: { value: "private-alias" } });
  expect((screen.getByTestId("agent-model") as HTMLInputElement).value).toBe("private-alias");
});

test("late discovery never replaces another adapter's options; unavailable discovery can refresh", async () => {
  let first!: (value: AgentOptions) => void;
  const load = vi.fn((adapter: AdapterName): Promise<AgentOptions> => adapter === "claude"
    ? new Promise((resolve) => { first = resolve; })
    : Promise.resolve({ ...options(adapter), discovery: { status: "unavailable", reason: "Offline" } }));
  useAppStore.setState({ loadAgentOptions: load });
  render(<AgentEditor initial={{ adapter: "claude", model: "keep-me" }} onSave={vi.fn()} />);
  fireEvent.click(screen.getByTestId("agent-adapter-codex"));
  await screen.findByText("Model list unavailable: Offline");
  first(options());
  await waitFor(() => expect(screen.queryByTestId("agent-model-trigger")).toBeNull());
  fireEvent.change(screen.getByTestId("agent-model"), { target: { value: "custom-codex" } });
  load.mockResolvedValue({ ...options("codex"), discovery: { status: "available", models: [{ id: "gpt-6-astra", name: "Astra" }] } });
  fireEvent.click(screen.getByText("Refresh models"));
  await ready();
  expect((screen.getByTestId("agent-model") as HTMLInputElement).value).toBe("custom-codex");
  fireEvent.click(screen.getByTestId("agent-model-trigger"));
  expect(screen.getByRole("option", { name: "Astra gpt-6-astra" })).toBeTruthy();
});

test("role binding uses its player's discovered model while preserving inheritance", async () => {
  const save = vi.fn(async () => {});
  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", display: "Fable" }}
    players={[{ id: "analyst", agent: { adapter: "claude", model: "claude-fable-5-1", effort: "high" }, display: "Fable", boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={save} onClose={vi.fn()} />);
  await ready();
  fireEvent.change(screen.getByTestId("binding-model-mode"), { target: { value: "pin" } });
  expect(screen.getByTestId("binding-model-value-trigger").textContent).toBe("Fable claude-fable-5-1");
  fireEvent.change(screen.getByTestId("binding-model-mode"), { target: { value: "provider" } });
  expect((screen.getByTestId("binding-model-mode") as HTMLSelectElement).value).toBe("provider");
  fireEvent.change(screen.getByTestId("binding-model-mode"), { target: { value: "pin" } });
  fireEvent.change(screen.getByTestId("binding-effort-mode"), { target: { value: "pin" } });
  expect(Array.from((screen.getByTestId("binding-effort-value") as HTMLSelectElement).options).map((entry) => entry.value)).toEqual(["", "low", "high", "ultracode"]);
  fireEvent.change(screen.getByTestId("binding-effort-mode"), { target: { value: "provider" } });
  fireEvent.click(screen.getByTestId("binding-save"));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ playerId: "analyst", model: "claude-fable-5-1", effort: false }));
});


test("role model choices validate inherited effort and fast mode", async () => {
  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", model: "claude-fable-5-1", display: "Fable" }}
    players={[{ id: "analyst", agent: { adapter: "claude", effort: "max", fastMode: true }, display: "Claude", boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={vi.fn(async () => {})} onClose={vi.fn()} />);
  await ready();
  expect((screen.getByTestId("binding-effort-mode") as HTMLSelectElement).value).toBe("inherit");
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByTestId("binding-effort-mode"), { target: { value: "provider" } });
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByTestId("binding-fast-mode"), { target: { value: "off" } });
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(false);
});


test("an adapter without fast-mode requests cannot acquire an explicit Off override", async () => {
  useAppStore.setState({ loadAgentOptions: async (adapter) => ({ ...options(adapter), fastModeSupported: false }) });
  const save = vi.fn(async () => {});
  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", fastMode: false, display: "Gemini" }}
    players={[{ id: "analyst", agent: { adapter: "gemini" }, display: "Gemini", boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={save} onClose={vi.fn()} />);
  await ready();
  expect(screen.getByRole("option", { name: "Off (unsupported)" })).toBeTruthy();
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByTestId("binding-fast-mode"), { target: { value: "inherit" } });
  expect(screen.queryByTestId("binding-fast-mode")).toBeNull();
  fireEvent.click(screen.getByTestId("binding-save"));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ fastMode: null })));
});

test.each(["claude-fable-5-1", "plain-model"])("discovery-unreported effort remains available for %s in both editors", async (model) => {
  const saveAgent = vi.fn();
  const agent = render(<AgentEditor initial={{ adapter: "claude", model, effort: "ultracode" }} allowUnchanged onSave={saveAgent} />);
  await ready();
  expect(screen.getByRole("option", { name: "ultracode (adapter-wide)" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByTestId("agent-save"));
  expect(saveAgent).toHaveBeenCalledWith({ adapter: "claude", model, effort: "ultracode" });
  agent.unmount();

  const saveBinding = vi.fn(async () => {});
  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", model, display: "Claude" }}
    players={[{ id: "analyst", agent: { adapter: "claude", effort: "ultracode" }, display: "Claude", boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={saveBinding} onClose={vi.fn()} />);
  await ready();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByTestId("binding-save"));
  expect(saveBinding).toHaveBeenCalledWith(expect.objectContaining({ effort: undefined }));
  fireEvent.change(screen.getByTestId("binding-effort-mode"), { target: { value: "pin" } });
  expect(screen.getByRole("option", { name: "ultracode (adapter-wide)" })).toBeTruthy();
  await waitFor(() => expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByTestId("binding-save"));
  expect(saveBinding).toHaveBeenLastCalledWith(expect.objectContaining({ effort: "ultracode" }));
});

test("canonical pins use alias metadata without rewriting; selecting an alias writes its ID", async () => {
  const save = vi.fn();
  const canonical = "claude-fable-5-1-resolved";
  render(<AgentEditor initial={{ adapter: "claude", model: canonical, effort: "high" }} allowUnchanged onSave={save} />);
  await ready();
  expect(screen.queryByText(/Not in this runtime's list/)).toBeNull();
  // A canonical pin reads as itself, never as the alias it resolves.
  expect(screen.getByTestId("agent-model-trigger").textContent).toBe(canonical);
  expect(Array.from((screen.getByTestId("agent-effort") as HTMLSelectElement).options).map((entry) => entry.value)).toEqual(["", "high", "ultracode"]);
  expect(screen.queryByTestId("agent-fast-mode")).toBeNull();
  fireEvent.click(screen.getByTestId("agent-save"));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: canonical }));
  await waitFor(() => expect((screen.getByTestId("agent-save") as HTMLButtonElement).disabled).toBe(false));
  chooseModel("agent-model", "fable");
  fireEvent.click(screen.getByTestId("agent-save"));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ model: "fable" }));
});

test("exact model rows take precedence over another alias's resolution", async () => {
  const catalog = options();
  if (catalog.discovery.status === "available") catalog.discovery.models = [...catalog.discovery.models,
    { id: "claude-fable-5-1-resolved", name: "Exact model", effortValues: ["low"], fastModeSupported: true }];
  useAppStore.setState({ loadAgentOptions: async () => catalog });
  render(<AgentEditor initial={{ adapter: "claude", model: "claude-fable-5-1-resolved", effort: "low" }} allowUnchanged onSave={vi.fn()} />);
  await ready();
  expect(Array.from((screen.getByTestId("agent-effort") as HTMLSelectElement).options).map((entry) => entry.value)).toEqual(["", "low", "ultracode"]);
  expect(screen.getByTestId("agent-fast-mode")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test.each(["available", "unavailable"] as const)("empty custom role model remains a pin with %s discovery", async (status) => {
  if (status === "unavailable") useAppStore.setState({ loadAgentOptions: async () => ({ ...options(), discovery: { status, reason: "Offline" } }) });
  const save = vi.fn(async () => {});
  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", display: "Claude" }}
    players={[{ id: "analyst", agent: { adapter: "claude" }, display: "Claude", boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={save} onClose={vi.fn()} />);
  await screen.findByText(status === "available" ? "Models reported by the installed runtime." : "Model list unavailable: Offline");
  fireEvent.change(screen.getByTestId("binding-model-mode"), { target: { value: "pin" } });
  expect(screen.getByRole("alert").textContent).toContain("Enter a model ID");
  const input = screen.getByTestId("binding-model-value");
  fireEvent.change(input, { target: { value: "temporary" } });
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByTestId("binding-model-value")).toBe(input);
  expect((screen.getByTestId("binding-model-mode") as HTMLSelectElement).value).toBe("pin");
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("Enter a model ID");
  fireEvent.change(input, { target: { value: "private-alias" } });
  fireEvent.click(screen.getByTestId("binding-save"));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: "private-alias" }));
});

test.each([
  { scope: "reported ultra", efforts: ["high", "ultra"], valid: true },
  { scope: "excluded ultra", efforts: ["high"], valid: false },
  { scope: "known no effort", efforts: [], valid: false },
  { scope: "unknown efforts", efforts: undefined, valid: true },
])("Codex $scope governs agent and inherited role tuning", async ({ efforts, valid }) => {
  useAppStore.setState({ loadAgentOptions: async () => ({
    adapter: "codex", effortValues: ["low", "high", "ultra"], fastModeSupported: true,
    discovery: { status: "available", models: [{ id: "codex-fixture", name: "Codex", effortValues: efforts }] },
  }) });
  const save = vi.fn();
  const agent = render(<AgentEditor initial={{ adapter: "codex", model: "codex-fixture", effort: "ultra" }} allowUnchanged onSave={save} />);
  await ready();
  expect((screen.getByTestId("agent-save") as HTMLButtonElement).disabled).toBe(!valid);
  expect(screen.queryByRole("option", { name: "ultra (adapter-wide)" })).toBeNull();
  if (valid) {
    expect(screen.getByRole("option", { name: "ultra" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("agent-save"));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ effort: "ultra" }));
  } else {
    expect(screen.getByRole("option", { name: "ultra (unsupported)" })).toBeTruthy();
    fireEvent.change(screen.getByTestId("agent-effort"), { target: { value: "" } });
    expect(screen.queryByRole("option", { name: /ultra/ })).toBeNull();
  }
  agent.unmount();

  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", display: "Codex" }}
    players={[{ id: "analyst", agent: { adapter: "codex", model: "codex-fixture", effort: "ultra" }, display: "Codex", boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={vi.fn(async () => {})} onClose={vi.fn()} />);
  await ready();
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(!valid);
  fireEvent.change(screen.getByTestId("binding-effort-mode"), { target: { value: "provider" } });
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByTestId("binding-effort-mode"), { target: { value: "pin" } });
  expect((screen.getByTestId("binding-save") as HTMLButtonElement).disabled).toBe(!valid);
  expect(screen.queryByRole("option", { name: "ultra (adapter-wide)" })).toBeNull();
});

test("a reported tier is never relabeled as an added adapter choice", async () => {
  const catalog = options();
  catalog.discovery = { status: "available", unreportedEffortValues: ["ultracode"],
    models: [{ id: "future-model", name: "Future", effortValues: ["high", "ultracode"] }] };
  useAppStore.setState({ loadAgentOptions: async () => catalog });
  render(<AgentEditor initial={{ adapter: "claude", model: "future-model", effort: "ultracode" }} allowUnchanged onSave={vi.fn()} />);
  await ready();
  expect(screen.getByRole("option", { name: "ultracode" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "ultracode (adapter-wide)" })).toBeNull();
});

// settings-41: catalogs modeled on the Claude and Codex runtimes. Every
// name, id and description is the runtime's own; only the stand-ins
// around them are Spex's (settings-38, DR-091).
const OPUS_WORDS = "Opus 5.5 · Best for everyday, complex tasks";
const claudeCatalog = (defaultModel?: string): AgentOptions => ({
  adapter: "claude", effortValues: ["low", "medium", "high", "max"], fastModeSupported: true,
  discovery: { status: "available", ...(defaultModel ? { defaultModel } : {}), models: [
    { id: "default", name: "Default (recommended)", resolvedModel: "claude-opus-5-5", description: OPUS_WORDS },
    { id: "opus", name: "Opus", resolvedModel: "claude-opus-5-5", description: OPUS_WORDS },
    { id: "claude-fable-5-1[1m]", name: "Fable", resolvedModel: "claude-fable-5-1" },
    { id: "sonnet", name: "Sonnet", resolvedModel: "claude-sonnet-5", description: "Sonnet 5 · Fast and capable" },
    { id: "haiku", name: "Haiku", resolvedModel: "claude-haiku-4-5-20251001" },
  ] },
});
const codexCatalog = (): AgentOptions => ({
  adapter: "codex", effortValues: ["low", "medium", "high"], fastModeSupported: true,
  discovery: { status: "available", models: [
    { id: "gpt-6-astra", name: "GPT-6-Astra", description: "Workhorse model for coding and everyday work." },
    { id: "gpt-6-sol", name: "GPT-6-Sol" },
    { id: "gpt-5.5", name: "gpt-5.5" },
  ] },
});
const catalogs = (claudeDefault?: string) =>
  vi.fn(async (adapter: AdapterName) => (adapter === "codex" ? codexCatalog() : claudeCatalog(claudeDefault)));

/** Each row as a reader meets it: its name, its second line, and
 * whether it is the one chosen. */
function rows(testId: string) {
  return within(screen.getByTestId(`${testId}-listbox`)).getAllByRole("option").map((option) => ({
    name: option.querySelector(`[id="${option.getAttribute("aria-labelledby")}"]`)?.textContent,
    detail: option.getAttribute("aria-describedby")
      ? option.querySelector(`[id="${option.getAttribute("aria-describedby")}"]`)?.textContent
      : undefined,
    selected: option.getAttribute("aria-selected") === "true",
  }));
}

test("settings-41: the trigger and every row name the specific model the runtime reports", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs("opus[1m]") });
  render(<AgentEditor initial={{ adapter: "claude", model: "opus" }} onSave={vi.fn()} />);
  await ready();
  const trigger = screen.getByTestId("agent-model-trigger");
  // The alias reads as its name, then the model it resolves to.
  expect(trigger.textContent).toBe("Opus claude-opus-5-5");
  expect(trigger.getAttribute("title")).toBe("Opus · claude-opus-5-5");
  expect(screen.getByRole("button", { name: "Model (optional) Opus claude-opus-5-5" })).toBe(trigger);
  expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");

  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(rows("agent-model")).toEqual([
    // The runtime's default model, unlisted here, reads as itself.
    { name: "Provider default", detail: "opus[1m]", selected: false },
    { name: "Default (recommended) claude-opus-5-5", detail: OPUS_WORDS, selected: false },
    { name: "Opus claude-opus-5-5", detail: OPUS_WORDS, selected: true },
    // An id that extends its resolved model says more than it: the id.
    { name: "Fable claude-fable-5-1[1m]", detail: undefined, selected: false },
    { name: "Sonnet claude-sonnet-5", detail: "Sonnet 5 · Fast and capable", selected: false },
    { name: "Haiku claude-haiku-4-5-20251001", detail: undefined, selected: false },
    { name: "Custom model…", detail: undefined, selected: false },
  ]);
  const chosen = screen.getByRole("option", { name: "Opus claude-opus-5-5", description: OPUS_WORDS });
  // The chosen row wears the check; a long line keeps its whole in a title.
  expect(chosen.querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("option", { name: "Sonnet claude-sonnet-5" }).querySelector("svg")).toBeNull();
  expect(chosen.getAttribute("title")).toBe(`Opus · claude-opus-5-5\n${OPUS_WORDS}`);
});

test.each([
  { defaultModel: "sonnet", reads: "Sonnet · claude-sonnet-5" },
  { defaultModel: undefined, reads: undefined },
])("settings-41: the provider default names the runtime's default model ($defaultModel)", async ({ defaultModel, reads }) => {
  useAppStore.setState({ loadAgentOptions: catalogs(defaultModel) });
  render(<AgentEditor initial={{ adapter: "claude" }} onSave={vi.fn()} />);
  await ready();
  const trigger = screen.getByTestId("agent-model-trigger");
  expect(trigger.textContent).toBe(reads ? `Provider default ${reads}` : "Provider default");
  // In one line of text the words and the default model join as a
  // name and its specific model do (settings-38).
  expect(trigger.getAttribute("title")).toBe(reads ? `Provider default · ${reads}` : "Provider default");
  fireEvent.click(trigger);
  expect(rows("agent-model")[0]).toEqual({ name: "Provider default", detail: reads, selected: true });
});

test("settings-41: Codex rows named as their ids read by name, with the runtime's description", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs() });
  render(<AgentEditor initial={{ adapter: "codex", model: "gpt-6-astra" }} onSave={vi.fn()} />);
  await ready();
  expect(screen.getByTestId("agent-model-trigger").textContent).toBe("GPT-6-Astra");
  fireEvent.click(screen.getByTestId("agent-model-trigger"));
  expect(rows("agent-model")).toEqual([
    { name: "Provider default", detail: undefined, selected: false },
    { name: "GPT-6-Astra", detail: "Workhorse model for coding and everyday work.", selected: true },
    { name: "GPT-6-Sol", detail: undefined, selected: false },
    { name: "gpt-5.5", detail: undefined, selected: false },
    { name: "Custom model…", detail: undefined, selected: false },
  ]);
});

test("settings-41: a pin known only by resolution and an unlisted value read as themselves", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs() });
  const { unmount } = render(<AgentEditor initial={{ adapter: "claude", model: "claude-sonnet-5" }} onSave={vi.fn()} />);
  await ready();
  const trigger = screen.getByTestId("agent-model-trigger");
  expect(trigger.textContent).toBe("claude-sonnet-5");
  expect(screen.queryByText(/Not in this runtime's list/)).toBeNull();
  fireEvent.click(trigger);
  // Its own row, chosen, beside the alias it is never rewritten to.
  expect(rows("agent-model").slice(0, 2)).toEqual([
    { name: "Provider default", detail: undefined, selected: false },
    { name: "claude-sonnet-5", detail: undefined, selected: true },
  ]);
  unmount();

  render(<AgentEditor initial={{ adapter: "claude", model: "claude-opus-5" }} onSave={vi.fn()} />);
  await ready();
  expect(screen.getByTestId("agent-model-trigger").textContent).toBe("Custom model…");
  expect((screen.getByTestId("agent-model") as HTMLInputElement).value).toBe("claude-opus-5");
  expect(screen.getByText("Not in this runtime's list. Check the model ID.")).toBeTruthy();
});

test("settings-41: the keyboard opens, walks, chooses and dismisses the list", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs("opus[1m]") });
  const onClose = vi.fn();
  render(<AgentEditorPopover title="Captain agent" initial={{ adapter: "claude", model: "opus" }} onSave={vi.fn()} onClose={onClose} />);
  await ready();
  const trigger = screen.getByTestId("agent-model-trigger");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const listbox = screen.getByTestId("agent-model-listbox");
  // The list takes focus with the chosen row active.
  expect(document.activeElement).toBe(listbox);
  const active = () => document.getElementById(listbox.getAttribute("aria-activedescendant") ?? "")?.getAttribute("data-value");
  expect(active()).toBe("opus");
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  expect(active()).toBe("claude-fable-5-1[1m]");
  fireEvent.keyDown(listbox, { key: "ArrowUp" });
  fireEvent.keyDown(listbox, { key: "ArrowUp" });
  expect(active()).toBe("default");
  fireEvent.keyDown(listbox, { key: "End" });
  expect(active()).toBe("__spex_custom__");
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  expect(active()).toBe("__spex_custom__");
  fireEvent.keyDown(listbox, { key: "Home" });
  expect(active()).toBe("");
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  // Enter chooses the active row, closes the list and hands focus back.
  fireEvent.keyDown(listbox, { key: "Enter" });
  expect(screen.queryByTestId("agent-model-listbox")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(trigger.textContent).toBe("Sonnet claude-sonnet-5");

  // Escape dismisses the list alone: the editor around it stays open.
  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  fireEvent.keyDown(screen.getByTestId("agent-model-listbox"), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByTestId("agent-model-listbox"), { key: "Escape" });
  expect(screen.queryByTestId("agent-model-listbox")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(trigger.textContent).toBe("Sonnet claude-sonnet-5");
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByTestId("agent-popover")).toBeTruthy();

  // Space chooses too, and Tab closes the list from the trigger.
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByTestId("agent-model-listbox"), { key: "Home" });
  fireEvent.keyDown(screen.getByTestId("agent-model-listbox"), { key: " " });
  expect(trigger.textContent).toBe("Provider default opus[1m]");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByTestId("agent-model-listbox"), { key: "Tab" });
  expect(screen.queryByTestId("agent-model-listbox")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  // With the list closed, Escape is the editor's again.
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("settings-41: a pointer chooses a row, and a press outside closes the list", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs() });
  const save = vi.fn();
  render(<AgentEditor initial={{ adapter: "claude", model: "opus" }} onSave={save} />);
  await ready();
  const trigger = screen.getByTestId("agent-model-trigger");
  fireEvent.click(trigger);
  fireEvent.mouseMove(screen.getByRole("option", { name: "Haiku claude-haiku-4-5-20251001" }));
  fireEvent.click(screen.getByRole("option", { name: "Haiku claude-haiku-4-5-20251001" }));
  expect(screen.queryByTestId("agent-model-listbox")).toBeNull();
  expect(trigger.textContent).toBe("Haiku claude-haiku-4-5-20251001");

  fireEvent.click(trigger);
  expect(screen.getByTestId("agent-model-listbox")).toBeTruthy();
  // A second press on the trigger closes what the first opened.
  fireEvent.click(trigger);
  expect(screen.queryByTestId("agent-model-listbox")).toBeNull();
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(screen.queryByTestId("agent-model-listbox")).toBeNull();
  expect(trigger.textContent).toBe("Haiku claude-haiku-4-5-20251001");
  fireEvent.click(screen.getByTestId("agent-save"));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: "haiku" }));
});

test("settings-41: Custom model… opens the typed field, which keeps what is typed", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs() });
  const save = vi.fn();
  render(<AgentEditor initial={{ adapter: "claude", model: "opus" }} onSave={save} />);
  await ready();
  expect(screen.queryByTestId("agent-model")).toBeNull();
  chooseModel("agent-model", CUSTOM_ROW);
  expect(screen.getByTestId("agent-model-trigger").textContent).toBe("Custom model…");
  const typed = screen.getByTestId("agent-model") as HTMLInputElement;
  fireEvent.change(typed, { target: { value: "opus[1m]" } });
  expect((screen.getByTestId("agent-model") as HTMLInputElement).value).toBe("opus[1m]");
  fireEvent.click(screen.getByTestId("agent-model-trigger"));
  expect(rows("agent-model").at(-1)).toEqual({ name: "Custom model…", detail: undefined, selected: true });
  fireEvent.keyDown(screen.getByTestId("agent-model-listbox"), { key: "Escape" });
  fireEvent.click(screen.getByTestId("agent-save"));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: "opus[1m]" }));
});

test("settings-41: the agent editor lays the model field across its full width", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs() });
  render(<AgentEditor initial={{ adapter: "claude", model: "opus" }} onSave={vi.fn()} />);
  await ready();
  const trigger = screen.getByTestId("agent-model-trigger");
  // A simulated document measures no layout: the field's cell spans
  // both columns of the editor's grid.
  const cell = trigger.closest(".grid > *");
  expect(cell?.className).toContain("col-span-2");
});

test.each([
  { adapter: "claude" as const, model: "opus", reads: "inherit the player (Opus · claude-opus-5-5)" },
  { adapter: "codex" as const, model: "gpt-6-astra", reads: "inherit the player (GPT-6-Astra)" },
  { adapter: "claude" as const, model: "claude-opus-5", reads: "inherit the player (claude-opus-5)" },
])("playbook-library-39: the inherit choice names $model by the display rule", async ({ adapter, model, reads }) => {
  useAppStore.setState({ loadAgentOptions: catalogs() });
  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", display: model }}
    players={[{ id: "analyst", agent: { adapter, model }, display: model, boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={vi.fn(async () => {})} onClose={vi.fn()} />);
  await ready();
  const inherit = (screen.getByTestId("binding-model-mode") as HTMLSelectElement).options[0];
  expect(inherit.textContent).toBe(reads);
});

test.each([
  { adapter: "claude" as const, reads: "inherit the player (Provider default · Sonnet · claude-sonnet-5)" },
  { adapter: "codex" as const, reads: "inherit the player (Provider default)" },
])("playbook-library-39: the inherit choices name a $adapter player's unset model and effort as the provider's default", async ({ adapter, reads }) => {
  // Claude's catalog reports the model it runs by default; Codex's
  // reports none, so its provider default is named by the words alone.
  useAppStore.setState({ loadAgentOptions: catalogs("sonnet") });
  render(<BindingEditorPopover role="analyst" position="dev.analyst" binding={{ playerId: "analyst", display: adapter }}
    players={[{ id: "analyst", agent: { adapter }, display: adapter, boundBy: [] }]}
    anchorRef={createRef<HTMLButtonElement>()} onSave={vi.fn(async () => {})} onClose={vi.fn()} />);
  await ready();
  const inherit = (screen.getByTestId("binding-model-mode") as HTMLSelectElement).options[0];
  expect(inherit.textContent).toBe(reads);
  // An unset effort takes the same words: no inherit choice reads bare.
  const effort = (screen.getByTestId("binding-effort-mode") as HTMLSelectElement).options[0];
  expect(effort.textContent).toBe("inherit the player (Provider default)");
});

test("settings-36: a switched adapter's field starts over on the provider default", async () => {
  useAppStore.setState({ loadAgentOptions: catalogs() });
  const save = vi.fn();
  render(<AgentEditor initial={{ adapter: "claude", model: "opus" }} onSave={save} />);
  await ready();
  chooseModel("agent-model", CUSTOM_ROW);
  fireEvent.change(screen.getByTestId("agent-model"), { target: { value: "hand-typed" } });
  fireEvent.click(screen.getByTestId("agent-adapter-codex"));
  await waitFor(() => expect(screen.getByTestId("agent-model-trigger").textContent).toBe("Provider default"));
  expect(screen.queryByTestId("agent-model")).toBeNull();
  fireEvent.click(screen.getByTestId("agent-save"));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ adapter: "codex", model: null }));
});
