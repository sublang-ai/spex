// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { Blob as BinaryBlob } from "node:buffer";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MediaAsset, TmuxPlayRecord } from "@sublang/spex-core/protocol";

import { applyRecords, initialSessionView } from "../state/reducer.js";
import { setClientForTests } from "../state/store.js";
import { CaptainPane } from "./CaptainPane.js";
import { PlayerPane } from "./PlayerPane.js";
import { DraftConversation } from "./DraftConversation.js";
import { MediaOwnerProvider, StoredMedia } from "./StoredMedia.js";

const picture: MediaAsset = { assetId: `sha256:${"a".repeat(64)}`, name: "screen.png", mimeType: "image/png", byteLength: 4 };
const detailBytes = Buffer.from(JSON.stringify({ content: "Original tool detail", untouched: [1, 2, 3] }));
const detail: MediaAsset = { assetId: `sha256:${"b".repeat(64)}`, name: "tool-result.json", mimeType: "application/json", byteLength: detailBytes.length };
const evidence: Extract<TmuxPlayRecord, { type: "playbook_evidence" }> = {
  type: "playbook_evidence", timestamp: 7, turnId: 1, callId: "working-call-17",
  origin: { kind: "player", actorId: "inspector", toolUseId: "t1", runtimeSessionId: "playbook-runtime-2" }, asset: picture,
};
const workerMedia: Extract<TmuxPlayRecord, {type: "player_event"}> = {
  type: "player_event", timestamp: 6, turnId: 1, playerId: "inspector",
  event: {type: "media", agent: "claude-code", timestamp: 6, sessionId: "native-session-2", payload: {
    mimeType: "image/png", name: picture.name, toolUseId: "t1", source: {type: "uri", uri: `playbook-asset:${picture.assetId}`},
  }},
};
const command = vi.fn();
const revokeObjectURL = vi.fn();
const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("Blob", BinaryBlob);
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = () => "blob:http://localhost/trusted";
    static revokeObjectURL = revokeObjectURL;
  });
  revokeObjectURL.mockClear();
  fetchSpy.mockClear();
  command.mockReset().mockImplementation(async (type, input) => {
    expect(type).toBe("media.read");
    const asset = input.assetId === detail.assetId ? detail : picture;
    const bytes = asset === detail ? detailBytes : Buffer.from([137, 80, 78, 71]);
    return { asset, offset: input.offset, data: bytes.subarray(input.offset, input.offset + input.length).toString("base64"), eof: true };
  });
  setClientForTests({ command } as never);
});

afterEach(() => { cleanup(); setClientForTests(undefined); vi.unstubAllGlobals(); });

function replay() {
  const records = [
    { type: "turn_started", turn: { id: 1, prompt: "", attachments: [picture] } },
    { type: "captain_event", event: { type: "media", payload: { mimeType: "image/png", name: "hidden-controller.png", source: { type: "uri", uri: "https://hidden.test/controller.png" } } } },
    { type: "player_prompt", playerId: "inspector", prompt: "Inspect the page" },
    { type: "player_event", playerId: "inspector", event: { type: "tool_use", payload: { toolUseId: "t1", toolName: "browser_screenshot", input: {} } } },
    { type: "player_event", playerId: "inspector", event: { type: "tool_result", payload: { toolUseId: "t1", status: "success", output: { type: "asset_reference", asset: detail } } } },
    workerMedia,
    evidence,
    { type: "captain_reply", text: "The page is ready." },
    { type: "player_event", playerId: "inspector", event: { type: "media", payload: { mimeType: "video/mp4", name: "External recording", source: { type: "uri", uri: "https://example.test/recording.mp4" } } } },
  ];
  return applyRecords(initialSessionView([{ id: "inspector" }]), records.map((record, index) => ({ seq: index + 1, record: { timestamp: index + 1, turnId: 1, ...record } as TmuxPlayRecord })));
}

function History({ kind = "session" }: { kind?: "session" | "draft" }) {
  const view = replay();
  return <MediaOwnerProvider owner={{ kind, id: kind === "session" ? "s1" : "authoring" }}>
    <CaptainPane view={view} />
    <PlayerPane view={view.players.inspector} />
  </MediaOwnerProvider>;
}

test("run-view-161: durable Boss and attributed evidence render independently of hidden traffic, with lazy original tool detail", async () => {
  const rendered = render(<History />);
  expect(replay().captain.find((line) => line.kind === "media")?.evidence).toEqual(evidence);
  await waitFor(() => expect(screen.getAllByRole("img", { name: "screen.png" })).toHaveLength(3));
  const captain = screen.getByTestId("captain-pane");
  expect(within(captain).getAllByRole("figure", { name: "screen.png" })).toHaveLength(2);
  expect(within(captain).getByText("From inspector · Turn 1 · Invocation working-call-17 · Playbook runtime playbook-runtime-2 · Tool t1")).toBeTruthy();
  expect(screen.getByText("From inspector · Turn 1 · Agent session native-session-2 · Tool t1").closest("figure")?.getAttribute("aria-label")).toBe("screen.png");
  expect(within(captain).getByText("The page is ready.")).toBeTruthy();
  expect(within(screen.getByTestId("boss-bubble")).getByRole("figure", { name: "screen.png" })).toBeTruthy();
  expect(screen.queryByText("hidden-controller.png")).toBeNull();
  expect(command.mock.calls.every(([, input]) => input.owner.kind === "session" && input.owner.id === "s1")).toBe(true);
  expect(command.mock.calls.some(([, input]) => input.assetId === detail.assetId)).toBe(false);
  expect(screen.getByRole("link", { name: "Open External recording" }).getAttribute("href")).toBe("https://example.test/recording.mp4");
  expect(within(screen.getByRole("figure", {name: "External recording"})).getByText("From inspector · Turn 1")).toBeTruthy();
  expect(fetchSpy).not.toHaveBeenCalled();
  const card = screen.getByTestId("tool-body-4").closest("details")!;
  card.open = true;
  fireEvent(card, new Event("toggle"));
  await screen.findByText(/Original tool detail/);
  expect(command.mock.calls.filter(([, input]) => input.assetId === detail.assetId)).toHaveLength(1);
  rendered.unmount();
  expect(revokeObjectURL).toHaveBeenCalledTimes(3);
  command.mockClear();
  render(<History kind="draft" />);
  await waitFor(() => expect(command).toHaveBeenCalledTimes(3));
  expect(command.mock.calls.every(([, input]) => input.owner.kind === "draft" && input.owner.id === "authoring")).toBe(true);
});

test("run-view-161: reopened authoring figures retain recorded identity without guessing missing calls from current settings", async () => {
  const records = [{
    seq: 3,
    record: {type: "player_event", timestamp: 1234, turnId: 2, playerId: "author", event: {
      type: "media", sessionId: "author-session-2", payload: {mimeType: picture.mimeType, name: picture.name, toolUseId: "browser-shot-2", source: {type: "uri", uri: `playbook-asset:${picture.assetId}`}},
    }} as TmuxPlayRecord,
  }];
  const conversation = () => <DraftConversation
    draft={{id: "authoring", createdAt: 1, touchedAt: 2, firstLine: null, activity: "idle", state: "draft", queued: [], player: "current-selection", agent: {adapter: "claude"}, ready: true, failures: 0}}
    draftView={{view: applyRecords(initialSessionView([{id: "author"}]), records), lineSeqs: []}}
    players={[]} readiness={[]} connected={false} composerText=""
    onComposerChange={() => {}} onSend={async () => {}} onAbort={() => {}} onPickAgent={async () => {}}
    onDismissError={() => {}} onOpenRegister={() => {}} onUseSkill={async () => null} />;
  const rendered = render(conversation());
  await screen.findByRole("img", {name: "screen.png"});
  const figure = screen.getByRole("figure", {name: "screen.png"});
  expect(within(figure).getByText("From author · Turn 2 · Agent session author-session-2 · Tool browser-shot-2")).toBeTruthy();
  expect(figure.textContent).not.toMatch(/Invocation |Playbook runtime |current-selection/);
  rendered.unmount();
  command.mockClear();
  render(conversation());
  await screen.findByRole("img", {name: "screen.png"});
  expect(screen.getByText("From author · Turn 2 · Agent session author-session-2 · Tool browser-shot-2")).toBeTruthy();
  expect(command.mock.calls.every(([, input]) => input.owner.kind === "draft" && input.owner.id === "authoring")).toBe(true);
});

test("run-view-161: damaged stored content stays named and retryable, external and unknown local URIs are never fetched", async () => {
  command.mockRejectedValueOnce(new Error("Stored content failed integrity verification"));
  render(<MediaOwnerProvider owner={{ kind: "session", id: "s1" }}>
    <StoredMedia asset={picture} />
    <StoredMedia media={{ mimeType: "image/png", name: "local reference", uri: "file:///private/screen.png" }} />
  </MediaOwnerProvider>);
  await screen.findByText("Stored content failed integrity verification");
  expect(screen.getByRole("figure", { name: "screen.png" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry screen.png" }));
  await screen.findByRole("img", { name: "screen.png" });
  expect(command).toHaveBeenCalledTimes(2);
  expect(screen.getByText("file:///private/screen.png")).toBeTruthy();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("run-view-161: opaque records cannot invent evidence provenance and per-reference MIME aliases reach the Blob", async () => {
  const malformed = [
    { ...evidence, callId: 17 },
    { ...evidence, origin: { kind: "captain", actorId: "hidden" } },
    { ...evidence, origin: { kind: "player", actorId: "" } },
    { ...evidence, asset: { ...picture, assetId: "file:///private/secret.png" } },
  ];
  const view = applyRecords(initialSessionView([]), malformed.map((record, index) => ({ seq: index + 1, record: record as unknown as TmuxPlayRecord })));
  expect(view.captain).toEqual([]);
  const create = vi.spyOn(URL, "createObjectURL");
  render(<MediaOwnerProvider owner={{ kind: "session", id: "s1" }}><StoredMedia media={{ name: "aliased.webp", mimeType: "image/webp", uri: `playbook-asset:${picture.assetId}` }} /></MediaOwnerProvider>);
  await screen.findByRole("img", { name: "aliased.webp" });
  expect((create.mock.calls[0][0] as Blob).type).toBe("image/webp");
});
