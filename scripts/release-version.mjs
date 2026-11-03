// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Release metadata only: no dependency resolution, lifecycle scripts or Git writes.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NUMBER = "(0|[1-9][0-9]*)";
const FORM = new RegExp(`^(app|cli)-v(${NUMBER}\\.${NUMBER}\\.${NUMBER})(?:-beta\\.([1-9][0-9]*))?$`);
export function parseTag(tag) {
  const match = FORM.exec(tag);
  if (!match || match[0] !== tag || (match[1] === "cli" && match[6])) throw new Error(`Invalid release tag: ${tag}; use app-vX.Y.Z[-beta.N] or cli-vX.Y.Z`);
  const [, channel, base, , , , n = ""] = match;
  const version = base + (n ? `-beta.${n}` : "");
  return { tag, channel, version, base, n, beta: Boolean(n), title: `Spex ${channel === "app" ? "App" : "CLI"} v${version}` };
}
export function packagePaths(release) {
  return release.channel === "app" ? ["apps/desktop", "apps/server"] : ["packages/cli"];
}
export function prepareVersion(root, release) {
  const lockPath = join(root, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (lock.lockfileVersion < 2 || !lock.packages) throw new Error("Release preparation needs a workspace lockfile");
  // Read/validate the complete change set before writing any file.
  const manifests = packagePaths(release).map(path => {
    if (!lock.packages[path]) throw new Error(`Missing locked workspace: ${path}`);
    const file = join(root, path, "package.json");
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (!value.name || !value.version) throw new Error(`Invalid package manifest: ${path}`);
    return { path, file, value };
  });
  for (const { path, file, value } of manifests) {
    value.version = release.version;
    lock.packages[path].version = release.version;
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  verifyVersion(root, release);
}
export function verifyVersion(root, release) {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  for (const path of packagePaths(release)) {
    const version = JSON.parse(readFileSync(join(root, path, "package.json"), "utf8")).version;
    if (version !== release.version || lock.packages?.[path]?.version !== release.version) throw new Error(`${path}: prepared package/lock version does not match ${release.tag}`);
  }
}
export async function requireUnpublished(release, { releases, registry = "https://registry.npmjs.org", request = fetch } = {}) {
  if (releases.some(item => item.tag_name === release.tag)) throw new Error(`Release already exists: ${release.tag}`);
  if (release.channel === "cli") {
    const response = await request(`${registry}/@sublang%2fspex/${release.version}`, { signal: AbortSignal.timeout(30_000) });
    if (response.status === 200) throw new Error(`npm version already exists: ${release.version}`);
    if (response.status !== 404) throw new Error(`npm registry check failed: HTTP ${response.status}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = Object.fromEntries(args.map(arg => {
      const match = /^--([a-z-]+)=(.*)$/.exec(arg);
      if (!match) throw new Error(`Unknown argument: ${arg}`);
      return [match[1], match[2]];
    }));
    const release = parseTag(options.tag ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? "");
    if ((options.channel ?? process.env.RELEASE_CHANNEL) && (options.channel ?? process.env.RELEASE_CHANNEL) !== release.channel) throw new Error("Release tag/channel mismatch");
    if (command === "prepare") prepareVersion(resolve(options.root ?? "."), release);
    else if (command === "verify") verifyVersion(resolve(options.root ?? "."), release);
    else if (command !== "check") throw new Error("Use check, prepare or verify");
    const output = Object.entries(release).map(([name, value]) => `${name}=${value}`).join("\n") + "\n";
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
    process.stdout.write(output);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
