// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MediaAsset, MediaOwner } from "@sublang/spex-core/protocol";

import { getClient } from "../state/store.js";
import { readMediaAsset } from "../lib/media-client.js";
import { i18n } from "../i18n.js";
import { TrustedMedia, type TrustedMediaContent } from "./TrustedMedia.js";
import { outputBlock } from "../lib/tool-body.js";
import { storedAsset } from "../lib/media.js";

const OwnerContext = createContext<MediaOwner | undefined>(undefined);
export function MediaOwnerProvider({ owner, children }: { owner: MediaOwner; children: ReactNode }) {
  return <OwnerContext.Provider value={owner}>{children}</OwnerContext.Provider>;
}

export interface RecordedMedia { mimeType: string; uri?: string; name?: string }

export function assetReference(value: unknown): MediaAsset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.type !== "asset_reference" || !item.asset || typeof item.asset !== "object") return undefined;
  return storedAsset(item.asset);
}

function useStoredAsset(asset: Pick<MediaAsset, "assetId"> & Partial<MediaAsset> | undefined, enabled = true) {
  const owner = useContext(OwnerContext);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; content: TrustedMediaContent }>();
  const assetId = asset?.assetId;
  const byteLength = asset?.byteLength;
  const mimeType = asset?.mimeType;
  const key = JSON.stringify([owner?.kind, owner?.id, assetId, byteLength, mimeType]);
  useEffect(() => {
    if (!enabled || !assetId) return;
    const abort = new AbortController();
    const setContent = (content: TrustedMediaContent) => setLoaded({ key, content });
    setContent({ state: "loading" });
    if (!owner) { setContent({ state: "unavailable", reason: i18n._("The file's conversation is unavailable.") }); return; }
    void Promise.resolve().then(() => readMediaAsset(getClient(), owner, { assetId, byteLength, mimeType }, abort.signal))
      .then((blob) => { if (!abort.signal.aborted) setContent({ state: "ready", blob }); })
      .catch((error: Error) => { if (!abort.signal.aborted) setContent({ state: "unavailable", reason: error.message }); });
    return () => abort.abort();
  }, [owner?.kind, owner?.id, assetId, byteLength, mimeType, key, enabled, attempt]);
  return { content: loaded?.key === key ? loaded.content : { state: "loading" } as TrustedMediaContent, retry: () => setAttempt((value) => value + 1) };
}

export function StoredMedia({ asset, media, origin }: { asset?: MediaAsset; media?: RecordedMedia; origin?: string }) {
  const match = media?.uri?.match(/^playbook-asset:(sha256:[a-f0-9]{64})$/);
  const selected = asset ?? (match ? { assetId: match[1] as MediaAsset["assetId"], mimeType: media?.mimeType } : undefined);
  const { content, retry } = useStoredAsset(selected);
  const name = asset?.name ?? media?.name ?? i18n._("Attachment");
  return <TrustedMedia name={name} mimeType={asset?.mimeType ?? media?.mimeType ?? "application/octet-stream"}
    origin={origin}
    content={selected ? content : media?.uri ? { state: "external", uri: media.uri } : { state: "unavailable" }}
    onRetry={selected ? retry : undefined} />;
}

/** Tool detail is read only after the user opens its containing tool card. */
export function DeferredToolOutput({ asset, visible }: { asset: MediaAsset; visible: boolean }) {
  const { content, retry } = useStoredAsset(asset, visible);
  const [output, setOutput] = useState<ReturnType<typeof outputBlock>>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (content.state !== "ready") { setOutput(undefined); return; }
    let disposed = false;
    setError(undefined);
    void content.blob.text().then((text) => {
      if (!disposed) setOutput(outputBlock(JSON.parse(text)));
    }).catch((cause: Error) => { if (!disposed) setError(cause.message); });
    return () => { disposed = true; };
  }, [content]);
  if (!visible) return null;
  if (output) return <pre data-kind={output.kind} className="whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-xs text-neutral-600 dark:text-neutral-400">{output.text}</pre>;
  const unavailable = content.state === "unavailable" ? content.reason : error;
  return <div className="text-xs text-neutral-500">
    {unavailable ? <><span role="alert">{i18n._("Tool details unavailable: {reason}", { reason: unavailable })}</span> <button type="button" className="text-brand-600 hover:underline dark:text-brand-300" onClick={retry}>{i18n._("Retry")}</button></> : i18n._("Loading tool details…")}
  </div>;
}
