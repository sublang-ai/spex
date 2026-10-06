// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Release archives (spex.pub DR-016): a gzipped tarball rooted at
// `<pkg>/` holding the declared release files and nothing else, each
// with its owner-execute bit. Packing is deterministic, so one release
// always packs to the same checksum; unpacking refuses a link or a
// special entry and anything outside the root.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkRelease, parseManifestText, portablePathIssues, readRelease, sha256Hex, type Issue, type Manifest, type ReleaseFile } from "./format.js";
import type { RegistrySource } from "./registry.js";
import { gunzip, gzip, readTar, writeTar } from "./tar.js";

/** Pack files into a release archive rooted at `<pkg>/`. */
export function packFiles(pkg: string, files: readonly { path: string; executable: boolean; data: Uint8Array }[]): Uint8Array {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return gzip(writeTar(sorted.map((file) => ({
    path: `${pkg}/${file.path}`,
    type: "file" as const,
    mode: file.executable ? 0o755 : 0o644,
    data: file.data,
  }))));
}

/** Pack a release folder's declared files. */
export function packRelease(dir: string, manifest: Manifest, files: readonly ReleaseFile[]): Uint8Array {
  return packFiles(manifest.name, files.map((file) => ({
    path: file.path,
    executable: file.executable,
    data: readFileSync(join(dir, ...file.path.split("/"))),
  })));
}

export interface UnpackedRelease {
  manifest: Manifest | null;
  files: ReleaseFile[];
  data: Map<string, Uint8Array>;
  issues: Issue[];
}

/** Unpack and check a release archive as the registry does. */
export function unpackRelease(tgz: Uint8Array, pkg: string): UnpackedRelease {
  const issues: Issue[] = [];
  const data = new Map<string, Uint8Array>();
  const files: ReleaseFile[] = [];
  let entries;
  try {
    entries = readTar(gunzip(tgz));
  } catch (error) {
    return { manifest: null, files, data, issues: [{ rule: "archive", message: `not a gzipped tarball: ${(error as Error).message}` }] };
  }
  const root = `${pkg}/`;
  for (const entry of entries) {
    if (entry.path === pkg && entry.type === "directory") continue;
    if (!entry.path.startsWith(root)) {
      issues.push({ path: entry.path, rule: "archive", message: `lies outside the archive's root ${root}` });
      continue;
    }
    const path = entry.path.slice(root.length);
    if (entry.type === "directory") continue;
    if (entry.type === "symlink" || entry.type === "hardlink") { issues.push({ path, rule: "link", message: "is a link; a release holds files only" }); continue; }
    if (entry.type !== "file") { issues.push({ path, rule: "special", message: "is a special file; a release holds files only" }); continue; }
    if (data.has(path)) { issues.push({ path, rule: "path", message: "appears twice in the archive" }); continue; }
    data.set(path, entry.data);
    files.push({ path, size: entry.data.length, sha256: sha256Hex(entry.data), executable: (entry.mode & 0o100) !== 0 });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  issues.push(...portablePathIssues(files.map((file) => file.path)).filter((issue) => !issues.some((other) => other.path === issue.path)));
  const meta = data.get("meta.yaml");
  if (!meta) {
    issues.push({ path: "meta.yaml", rule: "manifest", message: "the release has no meta.yaml manifest" });
    return { manifest: null, files, data, issues };
  }
  const parsed = parseManifestText(Buffer.from(meta).toString("utf8"));
  issues.push(...parsed.issues);
  if (parsed.manifest) issues.push(...checkRelease((path) => data.get(path), parsed.manifest, files));
  return { manifest: parsed.manifest, files, data, issues };
}

/** Publish a release folder as it is (environments-10): read and check
 * it as the core reads any release, pack its declared files, upload. */
export async function publishRelease(registry: RegistrySource, dir: string): Promise<{ name: string; version: string; checksum: string }> {
  const { manifest, files } = await readRelease(dir);
  const tgz = packRelease(dir, manifest, files);
  const name = `${manifest.org}/${manifest.name}`;
  await registry.publish(name, manifest.version, tgz);
  return { name, version: manifest.version, checksum: sha256Hex(tgz) };
}
