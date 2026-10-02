// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { MediaUploadOwner } from "@sublang/spex-core/protocol";
import type { ComposerAttachmentControls } from "../components/ComposerAttachments.js";
import { useAppStore } from "../state/store.js";

export const homeAttachmentKey = (projectId: string) => `home:${projectId}`;
export const sessionAttachmentKey = (sessionId: string) => `session:${sessionId}`;
export const draftAttachmentKey = (draftId: string) => `draft:${draftId}`;

export function useComposerAttachments(key: string | undefined, owner: MediaUploadOwner | undefined) {
  const stored = useAppStore((state) => key ? state.attachmentDrafts[key] : undefined);
  const files = stored ?? [];
  const controls: ComposerAttachmentControls = {
    files,
    disabled: !owner || !key,
    onFiles: (selected) => {
      if (key && owner) useAppStore.getState().addAttachmentFiles(key, owner, selected);
    },
    onRemove: (id) => { if (key) useAppStore.getState().removeAttachmentFiles(key, [id]); },
    onRetry: (id) => { if (key) useAppStore.getState().retryAttachmentFile(key, id); },
  };
  return {
    controls,
    assets: files.flatMap((file) => file.state === "ready" && file.asset ? [file.asset] : []),
    consume: () => {
      if (key) useAppStore.getState().removeAttachmentFiles(key, files.map((file) => file.id));
    },
  };
}
