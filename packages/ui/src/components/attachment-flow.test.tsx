// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { File as BinaryFile } from "node:buffer";
import { createHash } from "node:crypto";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MEDIA_CHUNK_BYTES, type MediaAsset } from "@sublang/spex-core/protocol";

import { Composer } from "./Composer.js";
import { initialSessionView } from "../state/reducer.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { useComposerAttachments } from "../lib/useComposerAttachments.js";
import { readMediaAsset } from "../lib/media-client.js";

const owner = { kind: "project", id: "p1" } as const;
const saved = useAppStore.getState();
const commands = vi.fn();
const transfers = new Map<string, { bytes: Buffer; name: string; mimeType: string; byteLength: number }>();
let interruptChunk = false;
let rejectTurn = false;

beforeEach(() => {
  transfers.clear();
  interruptChunk = false;
  rejectTurn = false;
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = () => "blob:http://localhost/upload";
    static revokeObjectURL = () => {};
  });
  commands.mockReset().mockImplementation(async (type, input) => {
    if (type === "media.begin") {
      if (!transfers.has(input.uploadId)) transfers.set(input.uploadId, { ...input, bytes: Buffer.alloc(0) });
      return { uploadId: input.uploadId, offset: transfers.get(input.uploadId)!.bytes.length };
    }
    if (type === "media.chunk") {
      const transfer = transfers.get(input.uploadId)!;
      const bytes = Buffer.from(input.data, "base64");
      expect(bytes.length).toBeLessThanOrEqual(MEDIA_CHUNK_BYTES);
      expect(input.offset).toBe(transfer.bytes.length);
      transfer.bytes = Buffer.concat([transfer.bytes, bytes]);
      if (interruptChunk) { interruptChunk = false; throw new Error("Connection lost after receipt"); }
      return { uploadId: input.uploadId, offset: transfer.bytes.length };
    }
    if (type === "media.finish") {
      const { bytes, name, mimeType, byteLength } = transfers.get(input.uploadId)!;
      expect(bytes.length).toBe(byteLength);
      return { uploadId: input.uploadId, offset: byteLength, asset: { assetId: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, name, mimeType, byteLength } };
    }
    if (type === "media.cancel") { transfers.delete(input.uploadId); return {}; }
    if (type === "turn.submit" && rejectTurn) throw new Error("Provider unavailable");
    if (type === "ledger.get") return { intents: [], attention: [], badge: 0 };
    return { accepted: true, queued: false };
  });
  setClientForTests({ command: commands } as never);
  useAppStore.setState({ attachmentDrafts: {}, sessions: [], views: {}, stagedIntents: {}, runErrors: {} });
});

afterEach(() => {
  cleanup();
  for (const key of Object.keys(useAppStore.getState().attachmentDrafts)) useAppStore.getState().removeAttachmentFiles(key);
  useAppStore.setState(saved);
  setClientForTests(undefined);
  vi.unstubAllGlobals();
});

function Conversation() {
  const media = useComposerAttachments("session:s1", owner);
  const [text, setText] = useState("");
  const error = useAppStore((state) => state.runErrors.s1);
  return <Composer view={initialSessionView([])} composer={{ draft: text, queued: [] }} connected
    error={error} attachments={media.controls} onDraftChange={setText}
    onSubmit={async (value) => { await useAppStore.getState().submitBossText("s1", value, media.assets); media.consume(); }}
    onAbort={() => {}} onRemoveQueued={() => {}} onDismissError={() => {}} />;
}

test("run-view-159: resumes retained bytes after disconnect and navigation, retaining failed attachment-only sends", async () => {
  interruptChunk = true;
  const bytes = Buffer.alloc(MEDIA_CHUNK_BYTES + 19, 123);
  const file = new BinaryFile([bytes], "screen.png", { type: "image/png" }) as unknown as File;
  const first = render(<Conversation />);
  fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [file] } });
  await screen.findByText("Connection lost after receipt");
  const id = useAppStore.getState().attachmentDrafts["session:s1"][0].id;
  expect(useAppStore.getState().attachmentDrafts["session:s1"][0].file).toBe(file);
  first.unmount();
  render(<Conversation />);
  fireEvent.click(screen.getByRole("button", { name: "Retry screen.png" }));
  await screen.findByText("Ready");
  expect(commands.mock.calls.filter(([type]) => type === "media.begin").map(([, input]) => input.uploadId)).toEqual([id, id]);
  expect(transfers.get(id)!.bytes).toEqual(bytes);
  rejectTurn = true;
  fireEvent.click(screen.getByTestId("send-button"));
  await screen.findByText("Provider unavailable");
  expect(screen.getByText("screen.png")).toBeTruthy();
  rejectTurn = false;
  fireEvent.click(screen.getByTestId("send-button"));
  await waitFor(() => expect(screen.queryByText("screen.png")).toBeNull());
  const sends = commands.mock.calls.filter(([type]) => type === "turn.submit");
  expect(sends).toHaveLength(2);
  expect(sends[0][1]).toEqual(sends[1][1]);
  expect(sends[1][1]).toMatchObject({ sessionId: "s1", text: "", attachments: [{ name: "screen.png", byteLength: bytes.length }] });
});

test("run-view-159: a core restart retries from retained File, removal cancels an incomplete upload", async () => {
  interruptChunk = true;
  const file = new BinaryFile(["bytes"], "notes.pdf", { type: "application/pdf" }) as unknown as File;
  render(<Conversation />);
  fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [file] } });
  await screen.findByText("Connection lost after receipt");
  const id = useAppStore.getState().attachmentDrafts["session:s1"][0].id;
  transfers.clear();
  fireEvent.click(screen.getByRole("button", { name: "Retry notes.pdf" }));
  await screen.findByText("Ready");
  expect(transfers.get(id)!.bytes.toString()).toBe("bytes");
  fireEvent.click(screen.getByRole("button", { name: "Remove notes.pdf" }));
  interruptChunk = true;
  fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [file] } });
  await screen.findByText("Connection lost after receipt");
  const canceled = useAppStore.getState().attachmentDrafts["session:s1"][0].id;
  fireEvent.click(screen.getByRole("button", { name: "Remove notes.pdf" }));
  expect(commands).toHaveBeenCalledWith("media.cancel", { uploadId: canceled });
  expect(transfers.has(canceled)).toBe(false);
});

test("run-view-159: removal during begin cancels a staging file created after the first cancellation", async () => {
  let finishBegin!: () => void;
  commands.mockImplementationOnce((_type, input) => new Promise((resolve) => {
    finishBegin = () => {
      transfers.set(input.uploadId, { ...input, bytes: Buffer.alloc(0) });
      resolve({ uploadId: input.uploadId, offset: 0 });
    };
  }));
  render(<Conversation />);
  const file = new BinaryFile(["bytes"], "late.pdf", { type: "application/pdf" }) as unknown as File;
  fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [file] } });
  const id = useAppStore.getState().attachmentDrafts["session:s1"][0].id;
  fireEvent.click(screen.getByRole("button", { name: "Remove late.pdf" }));
  await act(async () => finishBegin());
  await waitFor(() => expect(commands.mock.calls.filter(([type, input]) => type === "media.cancel" && input.uploadId === id)).toHaveLength(2));
  expect(transfers.has(id)).toBe(false);
  expect(screen.queryByText("late.pdf")).toBeNull();
});

test("run-view-159: project intent staging and draft submission preserve ordered refs and explicit removal", async () => {
  const files: MediaAsset[] = [{ assetId: `sha256:${"a".repeat(64)}`, name: "chart.png", mimeType: "image/png", byteLength: 12 }];
  const intentId = "0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
  useAppStore.setState({
    projects: [{ id: "me/project-spex", path: "/project", name: "project", registeredAt: 0, repository: { key: "me/project-spex", name: "project-spex", group: "me", own: true } }],
    drafts: { d1: { id: "d1", instance: "72000000-0000-4000-8000-0000000000d1", projectId: "me/project-spex", createdAt: 0, touchedAt: 0, firstLine: null, activity: "idle", state: "draft", queued: [], player: null, agent: { adapter: "claude" }, ready: true, failures: 0 } },
  });
  await act(async () => useAppStore.getState().stageDispatch({ id: intentId, projectId: "me/project-spex", text: "", attachments: files, createdAt: 1 }));
  const staged = useAppStore.getState().attachmentDrafts["home:me/project-spex"];
  expect(staged.map((entry) => entry.asset)).toEqual(files);
  // A stored intent's files live in its own directory (media-4).
  expect(staged.map((entry) => entry.owner)).toEqual([{ kind: "intent", projectId: "me/project-spex", intentId }]);
  expect(useAppStore.getState().stagedIntents.home?.title).toBe("chart.png");
  await useAppStore.getState().sendDraft("d1", "  exact text  ", files);
  expect(commands).toHaveBeenCalledWith("draft.send", { projectId: "me/project-spex", draftId: "d1", instance: "72000000-0000-4000-8000-0000000000d1", text: "  exact text  ", attachments: files });
  await useAppStore.getState().editIntent(intentId, "new", []);
  expect(commands).toHaveBeenCalledWith("intent.edit", { intentId, text: "new", attachments: [] });
});

test("run-view-159: trusted reads use bounded opaque ranges and refuse mismatched content", async () => {
  const bytes = Buffer.alloc(MEDIA_CHUNK_BYTES + 5, 77);
  const asset: MediaAsset = { assetId: `sha256:${"b".repeat(64)}`, byteLength: bytes.length, mimeType: "image/png", name: "screen.png" };
  const command = vi.fn(async (_type, input) => ({ asset, offset: input.offset, data: bytes.subarray(input.offset, input.offset + input.length).toString("base64"), eof: input.offset + input.length >= bytes.length }));
  const blob = await readMediaAsset({ command } as never, owner, asset);
  expect(blob.size).toBe(bytes.length);
  expect(blob.type).toBe("image/png");
  expect(command.mock.calls.map(([, input]) => input)).toEqual([0, MEDIA_CHUNK_BYTES].map((offset) => ({ owner, assetId: asset.assetId, offset, length: MEDIA_CHUNK_BYTES })));
  command.mockImplementationOnce(async () => ({ asset, offset: 99, data: "", eof: true }));
  await expect(readMediaAsset({ command } as never, owner, asset)).rejects.toThrow("inconsistent");
});
