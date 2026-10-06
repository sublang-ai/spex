// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// playbook-library-88: rendered Register defaults reach the real typed
// command boundary. No compiler, provider or config writer is substituted.
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { commandSchema } from "@sublang/spex-core/protocol";
import type { DraftInfo, SessionPlayerSummary } from "@sublang/spex-core/protocol";
import type { DraftRegisterForm } from "../state/store.js";
import { DraftRegisterTab, type RegisterInput } from "./DraftRegisterTab.js";

afterEach(cleanup);
const agent = { adapter: "codex", model: "gpt-6.1-sol", effort: "xhigh" } as const;

function renderForm(
  roles: string[],
  options: {
    proposal?: DraftInfo["proposal"];
    roster?: string[];
    form?: DraftRegisterForm;
  } = {},
) {
  const draft: DraftInfo = {
    id: "delivery", projectId: "me/demo-spex", createdAt: 0, touchedAt: 0, firstLine: "# Delivery",
    activity: "idle", state: "compiled", queued: [], player: null, agent,
    ready: true, failures: 0,
    compile: { at: 0, by: "boss", outcome: "ok", roles },
    ...(options.proposal ? { proposal: options.proposal } : {}),
  };
  const players: SessionPlayerSummary[] = (options.roster ?? []).map((id) => ({
    id, agent, display: "gpt-6.1-sol @ xhigh", boundBy: [],
  }));
  const submitted = vi.fn(async (_input: RegisterInput) => undefined);
  function Form() {
    const [form, setForm] = useState(options.form);
    return <DraftRegisterTab draft={draft} source={{ markdown: "# Delivery\n\nDeliver a synthetic skill.", version: "v1", mtime: 0, by: "agent" }}
      players={players} form={form} connected readiness={[]} onForm={setForm} onRegister={submitted} />;
  }
  render(<Form />);
  const row = (role: string) => screen.getByTestId(`register-player-${role}`) as HTMLSelectElement;
  const choices = () => Object.fromEntries(roles.map((role) => [role, row(role).value]));
  const newOptions = () => Object.fromEntries(roles.map((role) => [role,
    Array.from(row(role).options).filter((option) => option.value.startsWith("new:")).map((option) => option.value),
  ]));
  return {
    choices, newOptions,
    choose: (role: string, value: string) => fireEvent.change(row(role), { target: { value } }),
    async submit() {
      const button = screen.getByTestId("register-submit") as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      fireEvent.click(button);
      await vi.waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
      const input = submitted.mock.calls[0][0];
      // Assertion occurs outside the callback: the UI cannot catch a
      // validator failure and accidentally turn this test green.
      const parsed = commandSchema.parse({ type: "draft.register", id: "fixture-request", projectId: draft.projectId, draftId: draft.id, ...input });
      expect(parsed.type).toBe("draft.register");
      return input;
    },
  };
}

test("Chinese roles mint three valid distinct lanes in a typed Register command", async () => {
  const form = renderForm(["协调者", "验证者", "发布负责人"]);
  expect(form.choices()).toEqual({ 协调者: "new:dev.role", 验证者: "new:dev.role-2", 发布负责人: "new:dev.role-3" });
  const input = await form.submit();
  expect(input.bindings).toEqual({ 协调者: "dev.role", 验证者: "dev.role-2", 发布负责人: "dev.role-3" });
  expect(Object.keys(input.newPlayers!)).toEqual(["dev.role", "dev.role-2", "dev.role-3"]);
  for (const block of Object.values(input.newPlayers!)) {
    expect(block).toEqual({ ...agent, permissions: { mode: "auto" } });
  }
});

test("a generic fallback never silently selects a roster lane", async () => {
  const form = renderForm(["协调者", "验证者"], { roster: ["dev.role", "dev.role-2"] });
  expect(form.choices()).toEqual({ 协调者: "new:dev.role-3", 验证者: "new:dev.role-4" });
  const input = await form.submit();
  expect(Object.keys(input.newPlayers!)).toEqual(["dev.role-3", "dev.role-4"]);
});

test("ordinary named ASCII defaults remain unchanged", async () => {
  const form = renderForm(["Triager", "Code Reviewer", "Reviewer_v2"]);
  expect(form.choices()).toEqual({ Triager: "new:dev.triager", "Code Reviewer": "new:dev.code-reviewer", Reviewer_v2: "new:dev.reviewer_v2" });
  expect(Object.keys((await form.submit()).newPlayers!)).toEqual(["dev.triager", "dev.code-reviewer", "dev.reviewer_v2"]);
});

test("digit-leading, punctuation-only and underscore-leading roles still yield valid distinct lanes", async () => {
  const form = renderForm(["3D Reviewer", "---", "_QA", "协调者"]);
  expect(form.choices()).toEqual({ "3D Reviewer": "new:dev.role-3d-reviewer", "---": "new:dev.role", _QA: "new:dev.role-qa", 协调者: "new:dev.role-2" });
  expect(Object.keys((await form.submit()).newPlayers!)).toHaveLength(4);
});

test("normalization collisions allocate distinct automatic lanes", async () => {
  const form = renderForm(["Code Reviewer", "Code-Reviewer"]);
  expect(form.choices()).toEqual({ "Code Reviewer": "new:dev.code-reviewer", "Code-Reviewer": "new:dev.code-reviewer-2" });
  expect(Object.keys((await form.submit()).newPlayers!)).toEqual(["dev.code-reviewer", "dev.code-reviewer-2"]);
});

test("roster reuse and offered new options stay stable through Boss choices", async () => {
  const form = renderForm(["Code Reviewer", "Code-Reviewer"], { roster: ["dev.code-reviewer", "dev.code-reviewer-2"] });
  const initialChoices = { "Code Reviewer": "dev.code-reviewer", "Code-Reviewer": "new:dev.code-reviewer-4" };
  const initialOptions = { "Code Reviewer": ["new:dev.code-reviewer-3"], "Code-Reviewer": ["new:dev.code-reviewer-4"] };
  expect(form.choices()).toEqual(initialChoices);
  expect(form.newOptions()).toEqual(initialOptions);
  form.choose("Code Reviewer", "new:dev.code-reviewer-3");
  expect(form.choices()).toEqual({ "Code Reviewer": "new:dev.code-reviewer-3", "Code-Reviewer": "new:dev.code-reviewer-4" });
  expect(form.newOptions()).toEqual(initialOptions);
  form.choose("Code Reviewer", "dev.code-reviewer");
  expect(form.choices()).toEqual(initialChoices);
  expect(form.newOptions()).toEqual(initialOptions);
  expect(Object.keys((await form.submit()).newPlayers!)).toEqual(["dev.code-reviewer-4"]);
});

test("selecting an automatically offered collision lane keeps every default and option stable", async () => {
  const form = renderForm(["Code Reviewer", "Code-Reviewer", "Auditor"]);
  const choices = form.choices();
  const options = form.newOptions();
  form.choose("Code-Reviewer", "new:dev.code-reviewer-2");
  expect(form.choices()).toEqual(choices);
  expect(form.newOptions()).toEqual(options);
  expect(Object.keys((await form.submit()).newPlayers!)).toHaveLength(3);
});

test("an earlier automatic lane avoids a later case-insensitive explicit new proposal", async () => {
  const form = renderForm(["Triager", "Verifier"], { proposal: { command: "deliver", intent: "Explicit proposal", players: { verifier: "dev.triager" } } });
  expect(form.choices()).toEqual({ Triager: "new:dev.triager-2", Verifier: "new:dev.triager" });
  const input = await form.submit();
  expect(input.command).toBe("deliver");
  expect(Object.keys(input.newPlayers!)).toEqual(["dev.triager-2", "dev.triager"]);
});

test("an earlier automatic lane avoids a later explicit Boss new choice", async () => {
  const form = renderForm(["Triager", "Verifier"], { form: { command: "chosen", intent: "Boss choice", players: { Verifier: "new:dev.triager" }, newPlayers: {} } });
  expect(form.choices()).toEqual({ Triager: "new:dev.triager-2", Verifier: "new:dev.triager" });
  expect(form.newOptions().Verifier).toEqual(["new:dev.triager"]);
  expect((await form.submit()).intent).toBe("Boss choice");
});

test("explicit shared new proposals preserve one provider conversation", async () => {
  const form = renderForm(["协调者", "验证者"], { proposal: { command: "delivery", intent: "Shared deliberately", players: { 协调者: "dev.shared", 验证者: "dev.shared" } } });
  expect(form.choices()).toEqual({ 协调者: "new:dev.shared", 验证者: "new:dev.shared" });
  expect(Object.keys((await form.submit()).newPlayers!)).toEqual(["dev.shared"]);
});

test("explicit Boss sharing and edits win over the proposal", async () => {
  const form = renderForm(["Triager", "Verifier"], {
    proposal: { command: "proposal", intent: "Proposed", players: { Triager: "dev.proposed", Verifier: "dev.other" } },
    form: { command: "chosen", intent: "Boss choice", players: { Triager: "new:dev.shared", Verifier: "new:dev.shared" }, newPlayers: { "dev.shared": { ...agent, instruction: "Explicit shared block" } } },
  });
  expect(form.newOptions()).toEqual({ Triager: ["new:dev.shared"], Verifier: ["new:dev.shared"] });
  const input = await form.submit();
  expect(input.command).toBe("chosen");
  expect(input.intent).toBe("Boss choice");
  expect(Object.keys(input.newPlayers!)).toEqual(["dev.shared"]);
  expect(input.newPlayers!["dev.shared"].instruction).toBe("Explicit shared block");
});

test("explicit Unicode-role proposals may select a shared existing fallback-looking lane", async () => {
  const form = renderForm(["协调者", "验证者"], { roster: ["dev.role"], proposal: { command: "delivery", intent: "Use this existing lane", players: { 协调者: "dev.role", 验证者: "dev.role" } } });
  expect(form.choices()).toEqual({ 协调者: "dev.role", 验证者: "dev.role" });
  expect(form.newOptions()).toEqual({ 协调者: ["new:dev.role-2"], 验证者: ["new:dev.role-3"] });
  expect((await form.submit()).newPlayers).toBeUndefined();
});

test("an automatic roster default avoids a later explicit existing-lane proposal", async () => {
  const form = renderForm(["Coder", "Verifier"], { roster: ["dev.coder"], proposal: { command: "delivery", intent: "Verifier owns that lane", players: { verifier: "dev.coder" } } });
  expect(form.choices()).toEqual({ Coder: "new:dev.coder-2", Verifier: "dev.coder" });
  expect(Object.keys((await form.submit()).newPlayers!)).toEqual(["dev.coder-2"]);
});

test("an automatic roster default avoids a later explicit Boss existing-lane choice", async () => {
  const form = renderForm(["Coder", "Verifier"], { roster: ["dev.coder"], form: { players: { Verifier: "dev.coder" }, newPlayers: {} } });
  expect(form.choices()).toEqual({ Coder: "new:dev.coder-2", Verifier: "dev.coder" });
  expect(Object.keys((await form.submit()).newPlayers!)).toEqual(["dev.coder-2"]);
});

test("explicit equal existing-lane choices preserve deliberate sharing", async () => {
  const form = renderForm(["Coder", "Verifier"], { roster: ["dev.coder"], proposal: { command: "delivery", intent: "Share this existing lane", players: { coder: "dev.coder", verifier: "dev.coder" } } });
  expect(form.choices()).toEqual({ Coder: "dev.coder", Verifier: "dev.coder" });
  expect((await form.submit()).newPlayers).toBeUndefined();
});

test("ordinary uncontested named roster selection remains unchanged", async () => {
  const form = renderForm(["Coder", "Reviewer"], { roster: ["dev.coder", "dev.reviewer"] });
  expect(form.choices()).toEqual({ Coder: "dev.coder", Reviewer: "dev.reviewer" });
  expect(form.newOptions()).toEqual({ Coder: ["new:dev.coder-2"], Reviewer: ["new:dev.reviewer-2"] });
  expect((await form.submit()).newPlayers).toBeUndefined();
});
