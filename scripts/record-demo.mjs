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
// The whole procedure, from a built tree:
//
//   DEMO_PROJECT=~/spex-demo node scripts/demo-core.mjs &
//   CORE_URL="ws://127.0.0.1:8138/?token=demo" \
//     SCRIPT_PATH="$PWD/scripts/demo-script.mjs" OUT="$PWD/demo.mp4" \
//     ./node_modules/.bin/electron scripts/record-demo.mjs
//
// The core keeps its own store, so a recording never touches the app's
// own data; the project it drives is a real git repo whose base state
// the recording expects (reset it between takes).
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
// app.getAppPath() is this script's own directory when Electron is
// pointed at a file rather than a package, so the UI is resolved from
// the repo root instead.
const UI_INDEX =
  process.env.UI_INDEX ??
  join(app.getAppPath(), "..", "apps", "desktop", "ui-dist", "index.html");
const SCRIPT_PATH = process.env.SCRIPT_PATH;
const FPS = Number(process.env.FPS ?? 12);
// Two sizes, deliberately different. The page is laid out at a size
// that fits three panes and a machine drawing comfortably; the file is
// delivered 1080 wide. The host renders at 2x, so the frame arrives at
// twice the layout and is downscaled once, which is what keeps small
// text sharp at the delivered size.
const WIDTH = Number(process.env.WIDTH ?? 1440);
const HEIGHT = Number(process.env.HEIGHT ?? 810);
const OUT_WIDTH = Number(process.env.OUT_WIDTH ?? 1080);
// Even, because yuv420p halves both dimensions.
const OUT_HEIGHT =
  Number(process.env.OUT_HEIGHT ?? 0) ||
  Math.round((OUT_WIDTH * HEIGHT) / WIDTH / 2) * 2;
const FRAME_DIR = process.env.FRAME_DIR ?? "/tmp/spex-demo-frames";
// A real run takes the minutes it takes. The beats a reader must read
// — the task typed, the finished tree — run at capture speed, and the
// stretch where the agents are simply working is compressed, with the
// page carrying a badge saying so for as long as it lasts.
const SPEED = Number(process.env.SPEED ?? 4);

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
      const shot = await this.window.webContents.capturePage();
      const index = String(this.frame++).padStart(5, "0");
      // Resized here rather than in ffmpeg: encoding a 4K PNG per
      // frame is what would drop frames, not the capture itself, and
      // one good downscale beats a capture-size PNG plus a scale
      // filter later.
      writeFileSync(
        join(FRAME_DIR, `f${index}.png`),
        shot
          .resize({ width: OUT_WIDTH, height: OUT_HEIGHT, quality: "best" })
          .toPNG(),
      );
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

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (chunk) => (err += chunk.toString()));
    ff.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg ${code}: ${err.slice(-800)}`)),
    );
  });
}

/** One run of frames at one speed. `count` is the run's length in
 * captured frames; an image sequence reads to the end of the
 * directory, so the segment is bounded by the frames it writes —
 * `-frames:v` after the input is an output limit, not an input one.
 * Every segment leaves the encoder at the same codec and rate, so the
 * pieces join without a re-encode. Frames arrive at the output size
 * already; yuv420p is what keeps the file playable everywhere,
 * QuickTime and slide decks included. */
function encodeSegment(start, count, speed, out) {
  const written = Math.max(1, Math.round(count / speed));
  return ffmpeg([
    "-y",
    "-framerate", String(FPS),
    "-start_number", String(start),
    "-i", join(FRAME_DIR, "f%05d.png"),
    "-vf", `setpts=PTS/${speed},format=yuv420p`,
    "-r", String(FPS),
    "-frames:v", String(written),
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "20",
    out,
  ]);
}

async function encode(frames, fast) {
  if (frames === 0) throw new Error("no frames captured");
  // Three segments: what the reader reads, what the agents work
  // through, what the reader reads again. With no compressed stretch
  // marked it stays one segment at capture speed.
  const cuts =
    fast && fast.end > fast.start
      ? [
          { start: 0, count: fast.start, speed: 1 },
          { start: fast.start, count: fast.end - fast.start, speed: SPEED },
          { start: fast.end, count: frames - fast.end, speed: 1 },
        ].filter((cut) => cut.count > 0)
      : [{ start: 0, count: frames, speed: 1 }];

  const parts = [];
  for (const [index, cut] of cuts.entries()) {
    const part = join(FRAME_DIR, `part${index}.mp4`);
    await encodeSegment(cut.start, cut.count, cut.speed, part);
    parts.push(part);
  }
  if (parts.length === 1) {
    await ffmpeg(["-y", "-i", parts[0], "-c", "copy", "-movflags", "+faststart", OUT]);
    return;
  }
  const list = join(FRAME_DIR, "parts.txt");
  writeFileSync(list, parts.map((part) => `file '${part}'`).join("\n"));
  await ffmpeg([
    "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-c", "copy", "-movflags", "+faststart", OUT,
  ]);
}

app.whenReady().then(async () => {
  // The demo is shot in light mode regardless of the host's setting.
  nativeTheme.themeSource = "light";

  // macOS clamps an ordinary window to the work area, so a layout
  // wider than the host's desktop would be shot silently narrowed. A
  // frameless window allowed to exceed the screen gets the viewport
  // asked for; capturePage reads the renderer, so nothing hanging off
  // the display is lost.
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    enableLargerThanScreen: true,
    frame: false,
    show: true,
    backgroundColor: "#ffffff",
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  window.setBounds({ x: 0, y: 30, width: WIDTH, height: HEIGHT });

  const [pageWidth, pageHeight] = window.getContentSize();
  if (pageWidth !== WIDTH || pageHeight !== HEIGHT) {
    console.error(
      `[record] viewport is ${pageWidth}x${pageHeight}, not ${WIDTH}x${HEIGHT}`,
    );
    app.exit(2);
    return;
  }

  await window.loadFile(UI_INDEX, { query: { core: CORE_URL } });
  // Let the first paint and the core handshake settle before frame 1.
  await new Promise((r) => setTimeout(r, 2500));

  const recorder = new Recorder(window);
  /** The frame range shot while the agents were simply working. */
  const fast = { start: 0, end: 0 };

  /** The badge the page wears for exactly as long as the compressed
   * stretch lasts: a reader should never have to guess that time moved
   * faster than the clock. */
  const badge = (visible) =>
    window.webContents.executeJavaScript(
      `(() => {
        const id = "spex-speed-badge";
        document.getElementById(id)?.remove();
        if (!${visible}) return true;
        const el = document.createElement("div");
        el.id = id;
        el.textContent = "${SPEED}\u00d7 speed";
        el.style.cssText = [
          "position:fixed", "right:14px", "bottom:12px", "z-index:2147483647",
          "padding:3px 9px", "border-radius:999px", "pointer-events:none",
          "background:rgba(23,23,23,0.62)", "color:#fff",
          "font:500 11px ui-sans-serif,system-ui,sans-serif",
          "letter-spacing:0.02em",
        ].join(";");
        document.body.appendChild(el);
        return true;
      })()`,
      true,
    );

  try {
    for (const step of steps) {
      if (step.startsRecording) recorder.start();
      if (step.fast) {
        fast.start = recorder.frame;
        await badge(true);
      }
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
      if (step.fast) {
        await badge(false);
        fast.end = recorder.frame;
      }
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
    console.log(`[record] compressed frames ${fast.start}..${fast.end}`);
    await encode(recorder.frame, fast);
    console.log(
      `[record] ${recorder.frame} frames of ${WIDTH}x${HEIGHT} -> ${OUT_WIDTH}x${OUT_HEIGHT} ${OUT}`,
    );
    app.exit(0);
  } catch (cause) {
    console.error("[record] encode failed:", cause.message);
    app.exit(1);
  }
});
