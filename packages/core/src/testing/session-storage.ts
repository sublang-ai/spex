// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Deliberate fixture edits at a stopped or lease-held boundary. Production
// uses the public lifecycle; tests that write or damage a session use
// Playbook's own session file layer rather than duplicate its format: the
// manifest file and the replay log it binds (DR-254).
import { rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";

const sibling = (name: string): string => new URL(`./bin/${name}.js`, import.meta.resolve("@sublang/playbook/session-host")).href;
/** A session named by any of its files: its root, or its replay as
 * earlier tests named it. */
const identity = (file: string): { sessionsDir: string; sessionId: string } => ({
  sessionsDir: dirname(file), sessionId: basename(file).replace(/\.(?:records\.jsonl|replay\.json|replay|json)$/, ""),
});
async function filesOf(file: string): Promise<any> {
  const { createSessionFiles } = await import(sibling("session-files"));
  return createSessionFiles(identity(file));
}
/** The replay segment a session's first record opens: `<id>.replay/<it>`. */
export const FIRST_SEGMENT: string = (await import(sibling("session-files"))).segmentName(1);
/** The complete lines of a replay. */
const lines = (bytes: Buffer): number => { let count = 0; for (const byte of bytes) if (byte === 10) count += 1; return count; };

export async function readSessionManifest(file: string): Promise<any> {
  const { sessionsDir, sessionId } = identity(file);
  return createSessionStore({ sessionsDir }).readManifest(sessionId);
}

/** Replace the session's manifest, its replay as it stands. */
export async function writeSessionManifest(file: string, manifest: any): Promise<void> {
  const files = await filesOf(file);
  const { log } = await files.decodeManifest(await files.readManifestFile());
  const { bytes } = await files.prepareManifest(manifest, log);
  await files.replaceManifest(bytes);
}

/** Write a new session whole: its replay, then the manifest binding the
 * replay's lines up to `manifest.replay.seq`. */
export async function writeSession(file: string, manifest: any, replay: string | Uint8Array): Promise<void> {
  const files = await filesOf(file);
  const binding = await files.writeLog(Buffer.from(replay), manifest.replay.seq);
  const { bytes } = await files.prepareManifest(manifest, binding);
  await files.replaceManifest(bytes);
}

export async function readSessionReplay(file: string): Promise<Buffer> {
  const read = await (await filesOf(file)).readLog();
  return Buffer.concat([read.lines, read.partial]);
}

/** Replace the session's replay with `bytes`, its manifest binding as
 * many of them as it checkpointed: what the manifest says of its replay
 * stays as it was, so a shorter or different replay disagrees with it. */
export async function writeSessionReplay(file: string, bytes: string | Uint8Array): Promise<void> {
  const files = await filesOf(file);
  const { manifest } = await files.decodeManifest(await files.readManifestFile());
  const { sessionsDir, sessionId } = identity(file);
  rmSync(join(sessionsDir, `${sessionId}.replay`), { recursive: true, force: true });
  const replay = Buffer.from(bytes);
  const binding = await files.writeLog(replay, Math.min(manifest.replay.seq, lines(replay)));
  const { bytes: root } = await files.prepareManifest(manifest, binding);
  await files.replaceManifest(root);
}
