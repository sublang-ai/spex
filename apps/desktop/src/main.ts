// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Spex desktop main process (SHELL package): captures the login-shell
// environment, boots the core in-process, and loads the built web UI
// in a sandboxed renderer that speaks the same WebSocket protocol as
// any browser (no Electron IPC for app features, SHELL-10).

import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification as ElectronNotification,
} from "electron";
import { CoreService } from "@sublang/spex-core";

import { captureLoginShellEnv, mergeEnv } from "./shell-env.js";
import { AttentionTracker, notificationFor } from "./notifications.js";

let service: CoreService | undefined;
let window: BrowserWindow | undefined;
let quitting = false;

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  void main();
}

async function main(): Promise<void> {
  await app.whenReady();

  // Credentials exported in shell profiles must be visible before
  // any adapter readiness check (SHELL-12, DR-004).
  const captured = await captureLoginShellEnv();
  mergeEnv(process.env, captured);

  service = await CoreService.start({
    dbPath: join(app.getPath("userData"), "spex.db"),
    port: 0,
  });

  const tracker = new AttentionTracker();
  service.events.onRecord = (envelope) => {
    const badge = tracker.apply(envelope);
    if (process.platform === "darwin") app.setBadgeCount(badge);
    const prefs = service?.notificationPrefs() ?? {};
    const notification = notificationFor(envelope, prefs);
    if (notification && ElectronNotification.isSupported()) {
      const shown = new ElectronNotification({
        title: notification.title,
        body: notification.body,
      });
      shown.on("click", () => {
        window?.show();
        window?.focus();
      });
      shown.show();
    }
  };
  service.events.onSessionState = (session) => {
    if (!session.live) {
      const badge = tracker.clear(session.id);
      if (process.platform === "darwin") app.setBadgeCount(badge);
    }
  };

  // Native bridge (DR-008): OS pickers only, one invoke channel.
  ipcMain.handle("spex:pick-directory", async () => {
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  window = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Spex",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(app.getAppPath(), "preload.cjs"),
    },
  });

  // Acceptance mode (SPEX_ACCEPTANCE=<png path>): render, report the
  // renderer's real state, capture a screenshot, and exit — so "it
  // boots" can never again pass for "it shows a white window".
  const acceptancePath = process.env.SPEX_ACCEPTANCE;
  const consoleErrors: string[] = [];
  if (acceptancePath) {
    window.webContents.on("console-message", (_event, level, message) => {
      // The CSP advisory is dev-only noise; it disappears when packaged.
      if (level >= 2 && !message.includes("Electron Security Warning")) {
        consoleErrors.push(message);
      }
    });
    window.webContents.on(
      "did-fail-load",
      (_event, code, description, url) => {
        consoleErrors.push(`did-fail-load ${code} ${description} ${url}`);
      },
    );
  }

  await window.loadFile(join(app.getAppPath(), "ui-dist", "index.html"), {
    query: { core: `ws://127.0.0.1:${service.port()}` },
  });

  if (acceptancePath) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
    const state = (await window.webContents.executeJavaScript(
      `({
        rootChildren: document.getElementById("root")?.children.length ?? 0,
        bodyText: document.body.innerText.slice(0, 400),
        title: document.title,
      })`,
    )) as { rootChildren: number; bodyText: string; title: string };
    const image = await window.webContents.capturePage();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(acceptancePath, image.toPNG());
    console.log(
      JSON.stringify({ acceptance: state, consoleErrors }, null, 2),
    );
    quitting = true;
    await shutdown();
    app.exit(consoleErrors.length > 0 || state.rootChildren === 0 ? 1 : 0);
    return;
  }

  app.on("before-quit", (event) => {
    if (quitting) return;
    if (service?.hasActiveTurns()) {
      const choice = dialog.showMessageBoxSync({
        type: "warning",
        buttons: ["Keep running", "Quit anyway"],
        defaultId: 0,
        cancelId: 0,
        message: "A playbook turn is still running.",
        detail: "Quitting aborts active turns and disposes sessions.",
      });
      if (choice === 0) {
        event.preventDefault();
        return;
      }
    }
    event.preventDefault();
    quitting = true;
    void shutdown().then(() => app.quit());
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

async function shutdown(): Promise<void> {
  try {
    await service?.stop();
  } catch {
    // Nothing actionable at quit time.
  }
  service = undefined;
}
