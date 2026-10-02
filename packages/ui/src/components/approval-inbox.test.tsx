// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ApprovalState, PendingApproval } from "@sublang/spex-core/protocol";
import { ApprovalInbox, ApprovalNotice, ApprovalFeedback } from "./ApprovalInbox.js";
import { setClientForTests, deliverServerMessageForTests, useAppStore } from "../state/store.js";
import type { SpexClient } from "../lib/client.js";

const request: PendingApproval = {id: "request-1", owner: {kind: "session", id: "session-1"}, ownerLabel: "Inspect example", projectName: "Task project", actorId: "inspector", invocationId: "invocation-1", turnId: 3,
  request: {id: "native-id", kind: "tool", agent: "claude-code", sessionId: "native-session", toolUseId: "tool-1", toolName: "desktop.inspect", details: {title: "Read the Example window?", description: "Read only the selected task-owned window"}, input: {app: "Example", content: "<script>untrusted</script>"}, choices: ["allow_once", "deny"], createdAt: 1, expiresAt: Date.now() + 600_000}};
const state = (revision = 1, pending: PendingApproval[] = [request]): ApprovalState => ({generation: "generation-1", revision, pending});
beforeEach(() => useAppStore.setState({connection: "open", approvals: undefined, approvalInboxOpen: false, approvalFocusId: undefined, approvalError: undefined}));
afterEach(() => {cleanup();setClientForTests(undefined);vi.restoreAllMocks();});
function deliver(value: ApprovalState) { act(() => deliverServerMessageForTests({type: "approval.state", state: value})); }

test("core snapshot alone supplies authority, contextual focus defaults Deny and exact owner is answered", async () => {
  const command = vi.fn(async () => ({decision: "deny"}));
  setClientForTests({command} as unknown as SpexClient);
  render(<><main tabIndex={-1} /><ApprovalInbox /><ApprovalNotice owner={request.owner} /></>);
  expect(screen.queryByRole("region", {name: "Tool approvals"})).toBeNull();
  deliver(state());
  fireEvent.click(screen.getByRole("button", {name: "Tool approval needed (1)"}));
  expect(document.activeElement).toBe(screen.getByRole("button", {name: "Deny"}));
  expect(screen.getByLabelText("Requested action").textContent).toContain("<script>untrusted</script>");
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByRole("heading", {name: "Read the Example window?"})).toBeTruthy();
  expect(screen.getByText("Read only the selected task-owned window")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Deny"}));
  await waitFor(() => expect(command).toHaveBeenCalledWith("approval.respond", {generation: "generation-1", requestId: request.id, owner: request.owner, decision: "deny"}));
  // An acknowledgement alone is not a provider execution or a new snapshot.
  expect(screen.getByRole("region", {name: "Tool approvals"})).toBeTruthy();
  deliver(state(2, []));
  expect(screen.queryByRole("region", {name: "Tool approvals"})).toBeNull();
  expect(document.activeElement?.tagName).toBe("MAIN");
});

test("offline requests cannot be answered; conflicts remain visible; older revisions and foreign generations cannot restore authority", async () => {
  const command = vi.fn(async () => {throw new Error("already answered elsewhere");});
  setClientForTests({command} as unknown as SpexClient);
  deliver(state());
  render(<><ApprovalInbox /><ApprovalFeedback /></>);
  fireEvent.click(screen.getByRole("button", {name: "Tool approvals (1)"}));
  act(() => useAppStore.setState({connection: "closed"}));
  expect((screen.getByRole("button", {name: "Approve once"}) as HTMLButtonElement).disabled).toBe(true);
  act(() => useAppStore.setState({connection: "open"}));
  fireEvent.click(screen.getByRole("button", {name: "Approve once"}));
  expect((await screen.findByRole("alert")).textContent).toContain("already answered elsewhere");
  deliver(state(3, []));
  deliver(state(2));
  deliver({...state(99), generation: "old-core"});
  expect(screen.getByRole("alert").textContent).toContain("already answered elsewhere");
  fireEvent.click(screen.getByRole("button", {name: "Dismiss"}));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("region", {name: "Tool approvals"})).toBeNull();
});

test("parallel owners remain distinct and deny-only native choices never offer approval", () => {
  const draft = {...request, id: "request-2", owner: {kind: "draft" as const, id: "draft"}, ownerLabel: "draft", actorId: "author", request: {...request.request, choices: ["deny" as const]}};
  deliver(state(1, [request, draft]));
  render(<><ApprovalInbox /><ApprovalNotice owner={draft.owner} /></>);
  fireEvent.click(screen.getByRole("button", {name: "Tool approval needed (1)"}));
  expect(screen.getAllByRole("button", {name: "Deny"})).toHaveLength(2);
  expect(screen.getAllByRole("button", {name: "Approve once"})).toHaveLength(1);
  expect(document.activeElement).toBe(screen.getAllByRole("button", {name: "Deny"})[1]);
  deliver(state(2, [draft]));
  expect(screen.getByText(/Draft: draft/)).toBeTruthy();
});
