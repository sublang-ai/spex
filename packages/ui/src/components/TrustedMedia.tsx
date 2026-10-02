// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useState } from "react";

import { i18n } from "../i18n.js";
import { externalMediaLink, isRasterImage, useBlobUrl } from "../lib/media.js";

/** The core-facing owner supplies bytes and loading state. This component
 * performs no fetching, and never promotes a reference URI to trusted bytes. */
export type TrustedMediaContent =
  | { state: "loading" }
  | { state: "ready"; blob: Blob }
  | { state: "unavailable"; reason?: string }
  | { state: "external"; uri: string };

export interface TrustedMediaProps {
  name: string;
  mimeType: string;
  content: TrustedMediaContent;
  /** The recorded worker/call origin, already phrased by the host. */
  origin?: string;
  onRetry?(): void;
}

const CONTROL_CLASS =
  "inline-flex min-h-6 items-center rounded px-1.5 text-xs text-brand-700 underline-offset-2 hover:underline dark:text-brand-300";

export function TrustedMedia({ name, mimeType, content, origin, onRetry }: TrustedMediaProps) {
  const blob = content.state === "ready" ? content.blob : undefined;
  const url = useBlobUrl(blob);
  const [failedBlob, setFailedBlob] = useState<Blob>();
  const [expandedBlob, setExpandedBlob] = useState<Blob>();
  const failed = blob !== undefined && failedBlob === blob;
  const expanded = blob !== undefined && expandedBlob === blob;
  const image = isRasterImage(mimeType);
  const audio = mimeType.startsWith("audio/");
  const video = mimeType.startsWith("video/");
  const external = content.state === "external" ? externalMediaLink(content.uri) : undefined;
  return (
    <figure className="my-1 flex min-w-0 max-w-full flex-col gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200" aria-label={name}>
      <figcaption className="min-w-0 text-xs">
        <span className="block truncate font-medium" title={name}>{name}</span>
        {origin ? <span className="block text-neutral-500 [overflow-wrap:anywhere] dark:text-neutral-400">{origin}</span> : null}
      </figcaption>
      {content.state === "loading" || (content.state === "ready" && !url) ? (
        <p role="status" className="text-xs text-neutral-500">{i18n._("Loading media…")}</p>
      ) : null}
      {content.state === "unavailable" ? (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <p role="status" className="text-neutral-500 [overflow-wrap:anywhere]">{content.reason ?? i18n._("Media unavailable")}</p>
          {onRetry ? <button type="button" onClick={onRetry} aria-label={i18n._("Retry {name}", { name })} className={CONTROL_CLASS}>{i18n._("Retry")}</button> : null}
        </div>
      ) : null}
      {content.state === "external" ? (
        <div className="flex min-w-0 flex-col gap-1 text-xs">
          <span className="text-neutral-500">{i18n._("External reference")}</span>
          {external ? (
            <a href={external} target="_blank" rel="noreferrer" className={`${CONTROL_CLASS} self-start`} title={content.uri}>{i18n._("Open {name}", { name })}</a>
          ) : (
            <span className="text-neutral-500 [overflow-wrap:anywhere]">{content.uri}</span>
          )}
        </div>
      ) : null}
      {url && !failed && image ? (
        <img
          src={url}
          alt={name}
          onError={() => setFailedBlob(blob)}
          className={`max-w-full self-start rounded object-contain ${expanded ? "max-h-[70vh]" : "max-h-80"}`}
        />
      ) : null}
      {url && !failed && audio ? (
        <audio src={url} controls preload="metadata" aria-label={name} onError={() => setFailedBlob(blob)} className="w-full min-w-0" />
      ) : null}
      {url && !failed && video ? (
        <video src={url} controls playsInline preload="metadata" aria-label={name} onError={() => setFailedBlob(blob)} className="max-h-80 w-full rounded" />
      ) : null}
      {failed ? <p role="status" className="text-xs text-neutral-500">{i18n._("Preview unavailable; the file can still be downloaded")}</p> : null}
      {url ? (
        <div className="flex flex-wrap gap-1">
          {image && !failed ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? i18n._("Collapse image {name}", { name }) : i18n._("Expand image {name}", { name })}
              onClick={() => setExpandedBlob(expanded ? undefined : blob)}
              className={CONTROL_CLASS}
            >{expanded ? i18n._("Collapse image") : i18n._("Expand image")}</button>
          ) : null}
          <a href={url} download={name} className={CONTROL_CLASS}>{i18n._("Download {name}", { name })}</a>
        </div>
      ) : null}
    </figure>
  );
}
