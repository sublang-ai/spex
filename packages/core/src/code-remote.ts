// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/** The portable address of a project's code (storage-3): recognized
 * GitHub addresses share one HTTPS identity, independent of a working
 * folder's SSH setup. This neither probes visibility nor changes Git
 * configuration. Validate the original URL before storing it. */
export function canonicalCodeRemote(remote: string): string {
  if (/[\s\x00-\x1f\x7f]/.test(remote)) return remote;
  let path: string | undefined;
  const scp = /^git@([^/:]+):(.+)$/.exec(remote);
  if (scp?.[1].toLowerCase() === "github.com") path = scp[2];
  else {
    const url = /^(https|ssh):\/\/([^/]+)\/(.+)$/i.exec(remote);
    if (url) {
      const scheme = url[1].toLowerCase();
      const authority = url[2];
      const https = scheme === "https" && /^github\.com(?::443)?$/i.test(authority);
      // The SSH user is case-sensitive even though the host is not.
      const ssh = scheme === "ssh" && authority.startsWith("git@")
        && /^github\.com(?::22)?$/i.test(authority.slice("git@".length));
      if (https || ssh) path = url[3];
    }
  }
  if (path === undefined) return remote;
  const parts = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(path);
  if (!parts) return remote;
  const owner = parts[1].toLowerCase();
  const repository = parts[2].replace(/\.git$/i, "").toLowerCase();
  if (!owner || !repository || [owner, repository].some((part) => part === "." || part === "..")) return remote;
  return `https://github.com/${owner}/${repository}.git`;
}
