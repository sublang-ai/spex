// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react";

import { activateLanguage } from "../i18n.js";
import { ComposerBox } from "./Composer.js";
import { canSubmitContent, type ComposerFile } from "./ComposerAttachments.js";
import { TrustedMedia } from "./TrustedMedia.js";

const NativeURL = URL;
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

beforeEach(() => {
  let next = 0;
  createObjectURL.mockReset().mockImplementation(() => `blob:http://localhost/fixture-${++next}`);
  revokeObjectURL.mockReset();
  // jsdom has no object URL implementation; acquisition, React effects and
  // lifecycle are real, with only the browser's binary URL registry replaced.
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
});

afterEach(() => {
  cleanup();
  activateLanguage("en");
  vi.unstubAllGlobals();
});

function UploadComposer({
  onSubmit,
  onFiles,
  disabled = false,
}: {
  onSubmit: (input: { text: string; files: ComposerFile[] }) => void;
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ComposerFile[]>([]);
  function update(id: string, patch: Partial<ComposerFile>) {
    setFiles((current) => current.map((file) => file.id === id ? { ...file, ...patch } : file));
  }
  return (
    <>
      <ComposerBox
        field={<textarea aria-label="Message" value={text} onChange={(event) => setText(event.target.value)} />}
        caption={<span>Enter sends</span>}
        attachments={{
          files,
          disabled,
          onFiles(picked) {
            onFiles?.(picked);
            setFiles((current) => [...current, ...picked.map((file, index) => ({
              id: `${current.length + index}`,
              name: file.name,
              mimeType: file.type,
              size: file.size,
              state: "uploading" as const,
              progress: 0.25,
              preview: file,
            }))]);
          },
          onRemove: (id) => setFiles((current) => current.filter((file) => file.id !== id)),
          onRetry: (id) => update(id, { state: "uploading", progress: undefined, error: undefined }),
        }}
        actions={<button disabled={!canSubmitContent(text, files)} onClick={() => onSubmit({ text, files })}>Send</button>}
      />
      {files.map((file) => <div key={file.id}>
        <button onClick={() => update(file.id, { state: "ready" })}>Complete {file.name}</button>
        <button onClick={() => update(file.id, { state: "error", error: "Connection lost" })}>Fail {file.name}</button>
      </div>)}
    </>
  );
}

const imageFile = () => new File([new Uint8Array([137, 80, 78, 71])], "screen.png", { type: "image/png" });

describe("run-view-156: attachment controls with their upload owner", () => {
  test("picks real files, waits for upload, sends empty text, and returns removal focus", () => {
    const onSubmit = vi.fn();
    const onFiles = vi.fn();
    const { unmount } = render(<UploadComposer onSubmit={onSubmit} onFiles={onFiles} />);
    const file = imageFile();
    const input = screen.getByLabelText("Attach files", { selector: "input" }) as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(input.value).toBe("");
    expect(screen.getByText("screen.png")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("25");
    expect(screen.getByText("Uploading 25%")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Complete screen.png" }));
    expect(screen.getByText("Ready")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ text: "", files: [{ name: "screen.png", state: "ready" }] });
    const remove = screen.getByRole("button", { name: "Remove screen.png" });
    remove.focus();
    fireEvent.click(remove);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Attach files" }));
    expect(screen.queryByRole("list", { name: "Attachments" })).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/fixture-1");
    // Selecting the same file again remains a new acquisition.
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledTimes(2);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/fixture-2");
  });

  test("keeps failed files and text, retries one file, and waits for every selected upload", () => {
    render(<UploadComposer onSubmit={vi.fn()} />);
    const first = imageFile();
    const second = new File(["%PDF"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [first, second] } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Compare these" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete screen.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Fail notes.pdf" }));
    expect(screen.getByRole("alert").textContent).toBe("Connection lost");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Compare these");
    fireEvent.click(screen.getByRole("button", { name: "Retry notes.pdf" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("progressbar").hasAttribute("value")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Complete notes.pdf" }));
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
    // No preview is attempted for the document; it remains a named file.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  test("accepts file drop/paste without intercepting text and refuses acquisition when disabled", () => {
    const onFiles = vi.fn();
    const { rerender } = render(<UploadComposer onSubmit={vi.fn()} onFiles={onFiles} />);
    const box = screen.getByTestId("composer-box");
    const file = imageFile();
    const transfer = { files: [file], types: ["Files"], getData: () => "" };
    const drop = createEvent.drop(box, { dataTransfer: transfer });
    fireEvent(box, drop);
    expect(drop.defaultPrevented).toBe(true);
    const paste = createEvent.paste(screen.getByRole("textbox"), { clipboardData: transfer });
    fireEvent(screen.getByRole("textbox"), paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledTimes(2);

    for (const files of [[], [file]]) {
      const ordinary = createEvent.paste(screen.getByRole("textbox"), {
        clipboardData: { files, types: ["text/plain"], getData: () => "Pasted words" },
      });
      fireEvent(screen.getByRole("textbox"), ordinary);
      expect(ordinary.defaultPrevented).toBe(false);
    }
    const textDrop = createEvent.drop(box, { dataTransfer: { files: [], types: ["text/plain"] } });
    fireEvent(box, textDrop);
    expect(textDrop.defaultPrevented).toBe(false);
    expect(onFiles).toHaveBeenCalledTimes(3);

    rerender(<UploadComposer onSubmit={vi.fn()} onFiles={onFiles} disabled />);
    fireEvent.drop(box, { dataTransfer: transfer });
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: transfer });
    fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledTimes(3);
    expect((screen.getByRole("button", { name: "Attach files" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("attachment controls use the chosen language", () => {
    activateLanguage("zh");
    render(<UploadComposer onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "添加文件" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("添加文件", { selector: "input" }), { target: { files: [imageFile()] } });
    expect(screen.getByRole("button", { name: "移除 screen.png" })).toBeTruthy();
    expect(screen.getByText("上传中 25%" )).toBeTruthy();
  });
});

describe("run-view-157: trusted media presentation", () => {
  test("previews, expands and downloads an image, retaining a download after decode failure", () => {
    const blob = new Blob(["image fixture"], { type: "image/png" });
    const { unmount } = render(<TrustedMedia name="Screenshot.png" mimeType="image/png" origin="Inspector · call 7" content={{ state: "ready", blob }} />);
    expect(screen.getByText("Inspector · call 7")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:http://localhost/fixture-1");
    fireEvent.click(screen.getByRole("button", { name: "Expand image Screenshot.png" }));
    expect(screen.getByRole("button", { name: "Collapse image Screenshot.png" }).getAttribute("aria-expanded")).toBe("true");
    const download = screen.getByRole("link", { name: "Download Screenshot.png" });
    expect(download.getAttribute("download")).toBe("Screenshot.png");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Preview unavailable; the file can still be downloaded")).toBeTruthy();
    expect(download.getAttribute("href")).toBe("blob:http://localhost/fixture-1");
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/fixture-1");
  });

  test("uses native non-autoplay audio/video controls and revokes replaced bytes", () => {
    const audio = new Blob(["audio"], { type: "audio/wav" });
    const video = new Blob(["video"], { type: "video/mp4" });
    const { container, rerender } = render(<TrustedMedia name="Audio" mimeType="audio/wav" content={{ state: "ready", blob: audio }} />);
    expect(container.querySelector("audio")?.controls).toBe(true);
    expect(container.querySelector("audio")?.autoplay).toBe(false);
    rerender(<TrustedMedia name="Video" mimeType="video/mp4" content={{ state: "ready", blob: video }} />);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/fixture-1");
    expect(container.querySelector("audio")).toBeNull();
    expect(container.querySelector("video")?.controls).toBe(true);
    expect(container.querySelector("video")?.autoplay).toBe(false);
    expect(screen.getByRole("link", { name: "Download Video" }).getAttribute("href")).toBe("blob:http://localhost/fixture-2");
  });

  test("retains loading/unavailable names and offers explicit retry and non-preview document download", () => {
    const onRetry = vi.fn();
    const { rerender, container } = render(<TrustedMedia name="Report.pdf" mimeType="application/pdf" content={{ state: "loading" }} />);
    expect(screen.getByText("Report.pdf")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading media…");
    rerender(<TrustedMedia name="Report.pdf" mimeType="application/pdf" content={{ state: "unavailable", reason: "Missing stored bytes" }} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry Report.pdf" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("Missing stored bytes");
    rerender(<TrustedMedia name="Report.pdf" mimeType="application/pdf" content={{ state: "ready", blob: new Blob(["%PDF"], { type: "application/pdf" }) }} />);
    expect(screen.getByRole("link", { name: "Download Report.pdf" })).toBeTruthy();
    expect(container.querySelector("iframe,object,embed,img,audio,video")).toBeNull();
  });

  test("never fetches external references or turns unsafe schemes into media or links", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container, rerender } = render(<TrustedMedia name="Remote picture" mimeType="image/png" content={{ state: "external", uri: "https://example.test/beacon.png" }} />);
    const link = screen.getByRole("link", { name: "Open Remote picture" });
    expect(link.getAttribute("href")).toBe("https://example.test/beacon.png");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(container.querySelector("img,audio,video,iframe,object,embed")).toBeNull();
    for (const uri of ["file:///private/report.png", "javascript:alert(1)", "data:image/svg+xml,<svg/>", "blob:https://example.test/untrusted"]) {
      rerender(<TrustedMedia name="Reference" mimeType="image/png" content={{ state: "external", uri }} />);
      expect(screen.queryByRole("link")).toBeNull();
      expect(within(screen.getByRole("figure")).getByText(uri)).toBeTruthy();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
