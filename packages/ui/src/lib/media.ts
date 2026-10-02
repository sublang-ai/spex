// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useEffect, useState } from "react";
import type { MediaAsset } from "@sublang/spex-core/protocol";
import { i18n } from "../i18n.js";

/** Original record identity, never the currently selected agent settings. */
export interface MediaOrigin {
  kind?: "player" | "preparation";
  actorId?: string;
  turnId?: number;
  callId?: string;
  runtimeSessionId?: string;
  toolUseId?: string;
}

export function mediaOrigin(origin: MediaOrigin | undefined, scope: "native" | "playbook" = "native"): string | undefined {
  if (!origin) return undefined;
  const parts = [
    origin.actorId ? origin.kind === "preparation"
      ? i18n._("Browser preparation · {actor}", {actor: origin.actorId})
      : i18n._("From {actor}", {actor: origin.actorId}) : undefined,
    origin.turnId !== undefined ? i18n._("Turn {turn}", {turn: origin.turnId}) : undefined,
    origin.callId ? i18n._("Invocation {call}", {call: origin.callId}) : undefined,
    origin.runtimeSessionId ? scope === "playbook"
      ? i18n._("Playbook runtime {session}", {session: origin.runtimeSessionId})
      : i18n._("Agent session {session}", {session: origin.runtimeSessionId}) : undefined,
    origin.toolUseId ? i18n._("Tool {tool}", {tool: origin.toolUseId}) : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Replay envelopes may include unknown data; recognize only the asset contract. */
export function storedAsset(value: unknown): MediaAsset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const asset = value as MediaAsset;
  return typeof asset.assetId === "string" && /^sha256:[a-f0-9]{64}$/.test(asset.assetId)
    && Number.isSafeInteger(asset.byteLength) && asset.byteLength >= 0
    && typeof asset.mimeType === "string" && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(asset.mimeType)
    && (asset.name === undefined || typeof asset.name === "string") ? asset : undefined;
}

/** Only inert raster formats receive an inline image preview. */
export function isRasterImage(mimeType: string): boolean {
  return /^(?:image\/(?:png|jpeg|gif|webp|avif|bmp))$/i.test(mimeType);
}

/** The view owns each URL, including its replacement and unmount cleanup.
 * No remote or agent-supplied URL enters this path (run-view-153/155). */
export function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [current, setCurrent] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setCurrent({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return current?.blob === blob ? current?.url : undefined;
}

/** A reference is a deliberate link, never a preview request. */
export function externalMediaLink(uri: string): string | undefined {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}
