// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { ClipboardEvent, DragEvent, RefObject } from "react";

import { currentLocale, i18n } from "../i18n.js";
import { isRasterImage, useBlobUrl } from "../lib/media.js";
import { Icon } from "./Icon.js";

/** UI upload state only: an opaque id identifies the entry to its owner.
 * The application facade owns transfer, validation and durable references. */
export interface ComposerFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  state: "uploading" | "ready" | "error";
  /** A reported fraction from zero to one; absence means indeterminate. */
  progress?: number;
  error?: string;
  /** Locally acquired bytes, never a remote preview URL. */
  preview?: Blob;
}

export interface ComposerAttachmentControls {
  files: readonly ComposerFile[];
  onFiles(files: File[]): void;
  onRemove(id: string): void;
  onRetry?(id: string): void;
  disabled?: boolean;
  /** Picker guidance only; validation remains with the upload owner. */
  accept?: string;
}

/** Shared content gate; connection/activity gates stay with each composer. */
export function canSubmitContent(
  text: string,
  files: readonly ComposerFile[] = [],
): boolean {
  return (
    (text.trim().length > 0 || files.length > 0) &&
    files.every((file) => file.state === "ready")
  );
}

export function composerFileDrop(
  event: DragEvent,
  controls: ComposerAttachmentControls,
): void {
  const files = Array.from(event.dataTransfer.files);
  if (!files.length && !Array.from(event.dataTransfer.types).includes("Files")) return;
  // Even a disabled composer must not navigate to a dropped file.
  event.preventDefault();
  if (!controls.disabled && files.length) controls.onFiles(files);
}

export function composerFilePaste(
  event: ClipboardEvent,
  controls: ComposerAttachmentControls,
): void {
  const files = Array.from(event.clipboardData.files);
  if (!files.length) return;
  // Mixed text + image clipboard content still inserts its ordinary text.
  if (!event.clipboardData.getData("text/plain")) event.preventDefault();
  if (!controls.disabled) controls.onFiles(files);
}

const ACTION_CLASS =
  "inline-flex min-h-6 shrink-0 items-center justify-center rounded px-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800";

export function AttachmentPicker({
  controls,
  buttonRef,
  inputRef,
}: {
  controls: ComposerAttachmentControls;
  buttonRef: RefObject<HTMLButtonElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={controls.accept}
        disabled={controls.disabled}
        aria-label={i18n._("Attach files")}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          // Picking the same file after removal or failure must fire again.
          event.currentTarget.value = "";
          if (!controls.disabled && files.length) controls.onFiles(files);
          buttonRef.current?.focus();
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        disabled={controls.disabled}
        onClick={() => inputRef.current?.click()}
        className={ACTION_CLASS}
      >
        <Icon name="plus" className="mr-1 h-3.5 w-3.5" />
        {i18n._("Attach files")}
      </button>
    </>
  );
}

function AttachmentChip({
  file,
  controls,
  onRemove,
}: {
  file: ComposerFile;
  controls: ComposerAttachmentControls;
  onRemove(): void;
}) {
  const preview = useBlobUrl(isRasterImage(file.mimeType) ? file.preview : undefined);
  const progress = Number.isFinite(file.progress)
    ? Math.round(Math.max(0, Math.min(1, file.progress!)) * 100)
    : undefined;
  return (
    <li className="flex min-w-0 max-w-full items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-1.5 dark:border-neutral-700 dark:bg-neutral-800/60">
      {preview ? (
        <img src={preview} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <Icon name="file" className="mt-1 h-5 w-5 shrink-0 text-neutral-500" />
      )}
      <div className="min-w-0 flex-1">
        <div title={file.name} className="truncate text-xs font-medium">{file.name}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>{i18n._("{size} bytes", { size: file.size.toLocaleString(currentLocale()) })}</span>
          <span role="status">
            {file.state === "ready"
              ? i18n._("Ready")
              : file.state === "error"
                ? i18n._("Upload failed")
                : progress === undefined
                  ? i18n._("Uploading…")
                  : i18n._("Uploading {progress}%", { progress })}
          </span>
        </div>
        {file.state === "uploading" ? (
          <progress
            max={100}
            value={progress}
            aria-label={i18n._("Uploading {name}", { name: file.name })}
            className="mt-1 block h-1 w-full"
          />
        ) : null}
        {file.state === "error" && file.error ? (
          <p role="alert" className="mt-0.5 text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400">{file.error}</p>
        ) : null}
      </div>
      {file.state === "error" && controls.onRetry ? (
        <button
          type="button"
          disabled={controls.disabled}
          onClick={() => controls.onRetry?.(file.id)}
          aria-label={i18n._("Retry {name}", { name: file.name })}
          className={ACTION_CLASS}
        >{i18n._("Retry")}</button>
      ) : null}
      <button
        type="button"
        disabled={controls.disabled}
        onClick={onRemove}
        aria-label={i18n._("Remove {name}", { name: file.name })}
        className={`${ACTION_CLASS} min-w-6`}
      ><Icon name="close" className="h-3.5 w-3.5" /></button>
    </li>
  );
}

export function AttachmentChips({
  controls,
  pickerRef,
}: {
  controls: ComposerAttachmentControls;
  pickerRef: RefObject<HTMLButtonElement | null>;
}) {
  if (!controls.files.length) return null;
  return (
    <ul aria-label={i18n._("Attachments")} className="flex max-h-40 flex-col gap-1 overflow-y-auto">
      {controls.files.map((file) => (
        <AttachmentChip key={file.id} file={file} controls={controls} onRemove={() => {
          pickerRef.current?.focus();
          controls.onRemove(file.id);
        }} />
      ))}
    </ul>
  );
}
