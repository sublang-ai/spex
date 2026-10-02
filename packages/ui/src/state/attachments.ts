// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {
  MEDIA_MAX_TURN_BYTES,
  MEDIA_MAX_TURN_FILES,
  type MediaAsset,
  type MediaUploadOwner,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import type { ComposerFile } from "../components/ComposerAttachments.js";
import { fileMimeType, uploadMediaFile, type MediaClient } from "../lib/media-client.js";

export interface AttachmentDraft extends ComposerFile {
  owner: MediaUploadOwner;
  file?: File;
  asset?: MediaAsset;
}

export interface AttachmentState {
  attachmentDrafts: Record<string, readonly AttachmentDraft[]>;
  attachmentDraftTexts: Record<string, string>;
  setAttachmentDraftText(key: string, text: string | undefined): void;
  addAttachmentFiles(key: string, owner: MediaUploadOwner, files: readonly File[]): void;
  removeAttachmentFiles(key: string, ids?: readonly string[]): void;
  retryAttachmentFile(key: string, id: string): void;
  stageAttachmentAssets(key: string, owner: MediaUploadOwner, assets: readonly MediaAsset[]): void;
}

/** Upload state outlives mounted composers; browser files never cross the wire. */
export function createAttachmentState(
  set: (update: Partial<AttachmentState>) => void,
  get: () => AttachmentState,
  client: () => MediaClient,
): AttachmentState {
  const running = new Map<string, AbortController>();
  const replace = (key: string, files: readonly AttachmentDraft[]) =>
    set({ attachmentDrafts: { ...get().attachmentDrafts, [key]: files } });
  const update = (key: string, id: string, fields: Partial<AttachmentDraft>) =>
    replace(key, (get().attachmentDrafts[key] ?? []).map((file) => file.id === id ? { ...file, ...fields } : file));

  const start = async (key: string, id: string) => {
    const files = get().attachmentDrafts[key] ?? [];
    const index = files.findIndex((file) => file.id === id);
    const selected = files[index];
    if (!selected?.file || running.has(id)) return;
    if (index >= MEDIA_MAX_TURN_FILES || files.slice(0, index + 1).reduce((total, file) => total + file.size, 0) > MEDIA_MAX_TURN_BYTES) {
      update(key, id, { state: "error", error: i18n._("Select up to 16 files and 256 MiB per message.") });
      return;
    }
    const controller = new AbortController();
    running.set(id, controller);
    update(key, id, { state: "uploading", error: undefined });
    try {
      const asset = await uploadMediaFile(client(), selected.owner, selected.file, id, {
        signal: controller.signal,
        onProgress: (progress) => update(key, id, { progress }),
      });
      if (!controller.signal.aborted) update(key, id, { state: "ready", asset, progress: 1 });
    } catch (error) {
      if (!controller.signal.aborted) update(key, id, {
        state: "error",
        error: error instanceof Error ? error.message : i18n._("The upload failed. Try again."),
      });
    } finally {
      // Removal can race an unacknowledged begin. Repeat cancel after that
      // request settles so a late-created staging file is not orphaned.
      if (controller.signal.aborted) {
        try { await client().command("media.cancel", { uploadId: id }); }
        catch { /* The core expires unreachable incomplete transfers. */ }
      }
      if (running.get(id) === controller) running.delete(id);
    }
  };

  return {
    attachmentDrafts: {},
    attachmentDraftTexts: {},
    setAttachmentDraftText(key, text) {
      const { [key]: _old, ...rest } = get().attachmentDraftTexts;
      set({ attachmentDraftTexts: text === undefined ? rest : { ...rest, [key]: text } });
    },
    addAttachmentFiles(key, owner, files) {
      const additions = files.map((file): AttachmentDraft => ({
        id: crypto.randomUUID(), name: file.name, mimeType: fileMimeType(file),
        size: file.size, state: "uploading", progress: 0, file, preview: file, owner,
      }));
      replace(key, [...(get().attachmentDrafts[key] ?? []), ...additions]);
      for (const file of additions) void start(key, file.id);
    },
    removeAttachmentFiles(key, ids) {
      const files = get().attachmentDrafts[key] ?? [];
      const removed = new Set(ids ?? files.map((file) => file.id));
      replace(key, files.filter((file) => !removed.has(file.id)));
      for (const file of files) if (removed.has(file.id)) {
        running.get(file.id)?.abort();
        if (file.state !== "ready") {
          try { void client().command("media.cancel", { uploadId: file.id }).catch(() => {}); }
          catch { /* A disconnected client cannot cancel; the core expires incomplete bytes. */ }
        }
      }
    },
    retryAttachmentFile(key, id) { void start(key, id); },
    stageAttachmentAssets(key, owner, assets) {
      get().removeAttachmentFiles(key);
      replace(key, assets.map((asset) => ({
        id: crypto.randomUUID(), name: asset.name ?? i18n._("Attachment"),
        mimeType: asset.mimeType, size: asset.byteLength, state: "ready", asset, owner,
      })));
    },
  };
}
