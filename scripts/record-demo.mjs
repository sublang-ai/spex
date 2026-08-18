#!/usr/bin/env electron
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Demo recorder: loads the built UI against a running core, drives one
// scripted viewing (never the agents — those run for real), and
// captures frames from inside the renderer into an mp4.
//
// macOS denies screen recording to the agent's process, so frames come
// from Electron's own capturePage rather than the display server. That
// also keeps the recording deterministic and free of desktop chrome.
//
//   CORE_URL=ws://…  OUT=demo.mp4  electron scripts/record-demo.mjs
//
// The driving script is a list of steps; each step runs JS in the page
// and then holds for its own dwell, so the pacing is authored rather
// than whatever the agents happened to take.

import { app, BrowserWindow, nativeTheme } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CORE_URL = process.env.CORE_URL;
const OUT = process.env.OUT ?? "demo.mp4";
const UI_INDEX =
  process.env.UI_INDEX ??
  join(app.getAppPath(), "apps", "desktop", "ui-dist", "index.html");
const SCRIPT_PATH = process.env.SCRIPT_PATH;
const FPS = Number(process.env.FPS ?? 12);
const WIDTH = Number(process.env.WIDTH ?? 1280);
const HEIGHT = Number(process.env.HEIGHT ?? 800);
const FRAME_DIR = process.env.FRAME_DIR ?? "/tmp/spex-demo-frames";

if (!CORE_URL) {
  console.error("CORE_URL is required");
  process.exit(2);
}

const steps = SCRIPT_PATH
  ? (await import(SCRIPT_PATH)).default
  : [{ label: "idle", js: "true", dwellMs: 4000 }];

/** Capture at a steady wall-clock rate while the page does its thing. */
class Recorder {
  constructor(window) {
    this.window = window;
    this.frame = 0;
    this.busy = false;
    this.timer = undefined;
  }
  start() {
    rmSync(FRAME_DIR, { recursive: true, force: true });
    mkdirSync(FRAME_DIR, { recursive: true });
    this.timer = setInterval(() => void this.tick(), Math.round(1000 / FPS));
  }
  async tick() {
    // Never queue behind a slow capture: a dropped frame is better
    // than a drifting clock.
    if (this.busy || this.window.isDestroyed()) return;
    this.busy = true;
    try {
      const image = await this.window.webContents.capturePage();
      const index = String(this.frame++).padStart(5, "0");
      writeFileSync(join(FRAME_DIR, `f${index}.png`), image.toPNG());
    } catch {
      // A capture that fails mid-teardown ends the recording, not the run.
    } finally {
      this.busy = false;
    }
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}

async function encode(frames) {
  if (frames === 0) throw new Error("no frames captured");
  await new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      [
        "-y",
        "-framerate", String(FPS),
        "-i", join(FRAME_DIR, "f%05d.png"),
        // Even dimensions and yuv420p keep the file playable everywhere,
        // including QuickTime and slide decks.
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "20",
        "-movflags", "+faststart",
        OUT,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    ff.stderr.on("data", (chunk) => (err += chunk.toString()));
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-800)}`)),
    );
  });
}

app.whenReady().then(async () => {
  // The demo is shot in light mode regardless of the host's setting.
  nativeTheme.themeSource = "light";

  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: true,
    backgroundColor: "#ffffff",
    webPreferences: { sandbox: true, contextIsolation: true },
  });

  await window.loadFile(UI_INDEX, { query: { core: CORE_URL } });
  // Let the first paint and the core handshake settle before frame 1.
  await new Promise((r) => setTimeout(r, 2500));

  const recorder = new Recorder(window);

  try {
    for (const step of steps) {
      if (step.startsRecording) recorder.start();
      if (step.js) {
        const result = await window.webContents.executeJavaScript(
          `(async () => { ${step.js} })()`,
          true,
        );
        if (result && result.abort) {
          throw new Error(`step "${step.label}" aborted: ${result.abort}`);
        }
        if (step.label) console.log(`[record] ${step.label}`, result ?? "");
      }
      // Real agents take as long as they take: a step can wait on the
      // page's own state instead of guessing a dwell.
      if (step.waitForJs) {
        const deadline = Date.now() + (step.timeoutMs ?? 600_000);
        let settled = false;
        while (Date.now() < deadline) {
          const ok = await window.webContents.executeJavaScript(
            `(() => { try { return Boolean(${step.waitForJs}); } catch { return false; } })()`,
            true,
          );
          if (ok) {
            settled = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        if (!settled) {
          throw new Error(`step "${step.label}" timed out waiting`);
        }
        console.log(`[record] ${step.label} settled`);
      }
      if (step.dwellMs) await new Promise((r) => setTimeout(r, step.dwellMs));
    }
  } catch (cause) {
    console.error("[record] script failed:", cause.message);
    recorder.stop();
    app.exit(1);
    return;
  }

  recorder.stop();
  await new Promise((r) => setTimeout(r, 200));
  try {
    await encode(recorder.frame);
    console.log(`[record] ${recorder.frame} frames -> ${OUT}`);
    app.exit(0);
  } catch (cause) {
    console.error("[record] encode failed:", cause.message);
    app.exit(1);
  }
});
