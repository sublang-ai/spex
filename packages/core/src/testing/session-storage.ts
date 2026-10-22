// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Deliberate fixture edits at a stopped or lease-held boundary. Production
// uses the public lifecycle; tests that inject malformed semantic state use
// Playbook's own physical encoder rather than duplicate its chunk format.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";

const sibling = (name: string): string => new URL(`./bin/${name}.js`, import.meta.resolve("@sublang/playbook/session-host")).href;
const identity = (file: string): { sessionsDir: string; sessionId: string } => ({
  sessionsDir: dirname(file), sessionId: basename(file).replace(/\.(?:records\.jsonl|replay\.json|json)$/, ""),
});

export async function readSessionManifest(file: string): Promise<any> {
  const { sessionsDir, sessionId } = identity(file);
  return createSessionStore({ sessionsDir }).readManifest(sessionId);
}

export async function writeSessionManifest(file: string, manifest: any): Promise<void> {
  if (JSON.parse(readFileSync(file, "utf8")).schemaVersion !== 8) {
    writeFileSync(file, JSON.stringify(manifest), { mode: 0o600 });
    return;
  }
  const { createSessionChunks } = await import(sibling("session-chunks"));
  const { encodeStoredManifest } = await import(sibling("storage-manifest"));
  const { sessionsDir, sessionId } = identity(file);
  const bytes = await encodeStoredManifest(manifest, createSessionChunks({ directory: join(sessionsDir, `${sessionId}.chunks`) }));
  writeFileSync(file, bytes, { mode: 0o600 });
}

async function boundedReplay(file: string): Promise<any | undefined> {
  const { sessionsDir, sessionId } = identity(file);
  if (!existsSync(join(sessionsDir, `${sessionId}.replay.json`))) return undefined;
  const { createBoundedReplay } = await import(sibling("session-replay"));
  return createBoundedReplay({ sessionId, sessionsDir });
}

export async function readSessionReplay(file: string): Promise<Buffer> {
  const replay = await boundedReplay(file);
  return replay ? replay.readBytes() : readFileSync(file);
}

export async function writeSessionReplay(file: string, bytes: string | Uint8Array): Promise<void> {
  const replay = await boundedReplay(file);
  if (!replay) { writeFileSync(file, bytes, { mode: 0o600 }); return; }
  const { sessionsDir, sessionId } = identity(file);
  rmSync(join(sessionsDir, `${sessionId}.replay.json`));
  await replay.initializeBytes(Buffer.from(bytes));
}

