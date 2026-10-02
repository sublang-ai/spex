// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// media-15: the served UI, real authenticated core and immutable stores;
// only provider replies are substituted. These are decodable PNG bytes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator } from "@playwright/test";
import { test, expect, open, nav } from "../src/harness";
import { measure, record, setRail } from "../src/fit";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const image = (name: string) => ({ name, mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });

async function transfer(target: Locator, kind: "paste" | "drop", name: string): Promise<void> {
  await target.evaluate((element, { kind, name, data }) => {
    const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], name, { type: "image/png" }));
    element.dispatchEvent(kind === "paste"
      ? new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true })
      : new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, { kind, name, data: PNG });
}

async function decoded(figure: Locator): Promise<void> {
  const img = figure.getByRole("img");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
}

test.describe("session inputs and queued intent ownership", () => {
  test.use({ appOptions: { project: true, realCaptain: true } });
  test("media-15: picker, paste and drop submit a file-only session and survive restart; queue edit and Undo retain files", async ({ page, app }) => {
    test.setTimeout(90_000);
    await open(page, app);
    const initialComposer = page.getByTestId("start-composer");
    const composer = page.getByTestId("boss-composer");
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Attach files", exact: true }).click();
    await (await chooserPromise).setFiles(image("picked.png"));
    await transfer(initialComposer, "paste", "pasted.png");
    await transfer(initialComposer, "drop", "dropped.png");
    const files = page.getByRole("list", { name: "Attachments", exact: true });
    await expect(files.getByText("Ready", { exact: true })).toHaveCount(3);
    await expect(initialComposer).toHaveValue("");
    const defects: string[] = [];
    await setRail(page, false);
    for (const width of [320, 900]) {
      await page.setViewportSize({ width, height: 800 });
      record(`Attachment composer ${width}px`, await measure(page), defects);
    }
    expect(defects).toEqual([]);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const captain = page.getByTestId("captain-pane");
    await expect(captain).toContainText("What would you like me to do with the attached material?");
    for (const name of ["picked.png", "pasted.png", "dropped.png"]) await decoded(captain.getByRole("figure", { name, exact: true }));
    const session = (await app.core.command("session.list", {}))[0];
    expect(session.title).toContain("picked.png");
    const history = await app.core.command("history.get", { sessionId: session.id });
    const turn = history.records.find(({ record }) => record.type === "turn_started")!.record;
    if (turn.type !== "turn_started") throw new Error("Expected accepted turn");
    expect(turn.turn.prompt).toBe("");
    expect(turn.turn.attachments?.map((asset) => asset.name)).toEqual(["picked.png", "pasted.png", "dropped.png"]);
    for (const asset of turn.turn.attachments ?? []) {
      const result = await app.core.command("media.read", { owner: { kind: "session", id: session.id }, assetId: asset.assetId, offset: 0, length: 65536 });
      expect(Buffer.from(result.data, "base64")).toEqual(Buffer.from(PNG, "base64"));
    }
    await expect(composer).toBeEnabled();
    await app.stop();
    await app.start();
    await page.reload();
    await setRail(page, true);
    await page.getByTestId(`sidebar-session-${session.id}`).click();
    await setRail(page, false);
    for (const name of ["picked.png", "pasted.png", "dropped.png"]) await decoded(page.getByTestId("captain-pane").getByRole("figure", { name, exact: true }));

    // A follow-up is shelved through the actual composer, edited and
    // removed/restored through Overview, then reopened from disk.
    await composer.fill("Keep this visual reference");
    await page.getByLabel("Attach files", { exact: true }).setInputFiles(image("queued.png"));
    await expect(files.getByText("Ready", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Add to Up next", exact: true }).click();
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    const row = page.getByTestId(/^upnext-row-/).filter({ hasText: "Keep this visual reference" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Actions for Keep this visual reference" }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await expect(files).toContainText("queued.png");
    await page.getByRole("textbox", { name: "Edit intent text" }).fill("Edited visual reference");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const edited = page.getByTestId(/^upnext-row-/).filter({ hasText: "Edited visual reference" });
    await edited.getByRole("button", { name: "Actions for Edited visual reference" }).click();
    await page.getByRole("menuitem", { name: "Remove", exact: true }).click();
    await expect(edited).toHaveCount(0);
    await page.getByTestId(`upnext-removed-${app.projectId}`).getByRole("button", { name: "Undo" }).click();
    await expect(edited).toBeVisible();
    await app.stop();
    await app.start();
    await page.reload();
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(edited).toBeVisible();
    await edited.getByRole("button", { name: "Actions for Edited visual reference" }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await expect(files).toContainText("queued.png");
    await expect(files.getByText("Ready", { exact: true })).toHaveCount(1);
  });

  test("media-15: a lost chunk acknowledgement retries the retained file against the real upload transaction", async ({ page, app }) => {
    let dropped = false;
    let chunkId: string | undefined;
    const begins: string[] = [];
    await page.routeWebSocket(/.*/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === "media.begin") begins.push(message.uploadId);
        if (!dropped && message.type === "media.chunk") chunkId = message.id;
        server.send(raw);
      });
      server.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (!dropped && chunkId && message.type === "reply" && message.id === chunkId) {
          dropped = true;
          // The real core committed this chunk; only its acknowledgement
          // is lost. The next WebSocket reconnects to that same core.
          socket.close({ code: 1012, reason: "fixture connection reset" });
          server.close();
        } else socket.send(raw);
      });
    });
    await open(page, app);
    await expect(page.getByTestId("start-composer")).toBeEnabled();
    const selected = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Attach files", exact: true }).click();
    await (await selected).setFiles(image("retry.png"));
    const files = page.getByRole("list", { name: "Attachments", exact: true });
    await expect(files).toContainText("Upload failed");
    await expect(page.getByRole("button", { name: "Retry retry.png" })).toBeEnabled();
    await page.getByRole("button", { name: "Retry retry.png" }).click();
    await expect(files).toContainText("Ready");
    expect(dropped).toBe(true);
    expect(begins).toHaveLength(2);
    expect(begins[0]).toBe(begins[1]);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await decoded(page.getByTestId("captain-pane").getByRole("figure", { name: "retry.png", exact: true }));
    const session = (await app.core.command("session.list", {}))[0];
    const history = await app.core.command("history.get", { sessionId: session.id });
    const turn = history.records.find(({ record }) => record.type === "turn_started")!.record;
    if (turn.type !== "turn_started" || !turn.turn.attachments?.[0]) throw new Error("Expected accepted attachment");
    const response = await app.core.command("media.read", { owner: { kind: "session", id: session.id }, assetId: turn.turn.attachments[0].assetId, offset: 0, length: 65536 });
    expect(Buffer.from(response.data, "base64")).toEqual(Buffer.from(PNG, "base64"));
  });
});

test.describe("authoring media output", () => {
  test.use({ appOptions: { project: true, authoring: { script: { fallback: {
    result: "The attached interface is visible.",
    deltas: ["The attached interface is visible."],
    tools: [{ toolName: "browser_take_screenshot", input: {}, output: { notes: "Screenshot captured. ".repeat(1000) } }],
    media: [{ name: "native-screen.png", mimeType: "image/png", toolUseId: "fake-tool-0", source: { type: "base64", data: PNG } }],
  } } } } });
  test("media-15: authoring file-only input and native screenshot render from owned bytes after restart", async ({ page, app }) => {
    test.setTimeout(90_000);
    await open(page, app);
    await nav(page, "Playbooks").click();
    await page.getByTestId("new-playbook-id").fill("visual");
    await page.getByTestId("new-playbook-id").press("Enter");
    const workspace = page.getByTestId("authoring-workspace");
    await expect(workspace).toBeVisible();
    await workspace.getByLabel("Attach files", { exact: true }).setInputFiles(image("authoring-input.png"));
    await expect(workspace.getByRole("list", { name: "Attachments" })).toContainText("Ready");
    await expect(page.getByTestId("draft-composer")).toHaveValue("");
    await page.getByTestId("draft-send").click();
    const thread = page.getByTestId("draft-thread");
    await expect(thread).toContainText("The attached interface is visible.");
    await decoded(thread.getByRole("figure", { name: "authoring-input.png", exact: true }));
    const screenshot = thread.getByRole("figure", { name: "native-screen.png", exact: true });
    await decoded(screenshot);
    await expect(screenshot).toContainText(/From author · Turn 1 · Agent session .+ · Tool fake-tool-0/);
    await screenshot.getByRole("button", { name: "Expand image native-screen.png" }).click();
    await expect(screenshot.getByRole("button", { name: "Collapse image native-screen.png" })).toHaveAttribute("aria-expanded", "true");
    await page.getByTestId("draft-working").waitFor({ state: "hidden" });
    const records = readFileSync(join(app.dataDir, "local", "drafts", "visual", "records.jsonl"), "utf8");
    expect(records).not.toContain(PNG);
    expect(records).toContain("playbook-asset:sha256:");
    const defects: string[] = [];
    await setRail(page, false);
    for (const width of [320, 900]) {
      await page.setViewportSize({ width, height: 800 });
      record(`Authoring media ${width}px`, await measure(page), defects);
    }
    expect(defects).toEqual([]);
    await app.stop();
    await app.start();
    await page.reload();
    await nav(page, "Playbooks").click();
    await page.getByTestId("draft-open-visual").click();
    await decoded(page.getByTestId("draft-thread").getByRole("figure", { name: "native-screen.png", exact: true }));
    await decoded(page.getByTestId("draft-thread").getByRole("figure", { name: "authoring-input.png", exact: true }));
  });
});
