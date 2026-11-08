// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The credential helper's line (git-host-36): Git runs it with `sh` on
// every platform — on Windows, Git for Windows' own — so each path in it
// is one word in single quotes, and a path holding no line break or NUL
// runs as it is. CI runs this file on Windows on the Node the app's
// Electron ships, whose path holds backslashes.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { GIT_CREDENTIAL_FILE_ENV, currentRuntime, gitCredentialHelperPath, memberHelperCommand, withGitCredential } from "./git-credential.js";
import { scratchDir } from "./testing/scratch.js";

/** A folder name holding what `sh` reads specially: a space, `$`, a
 * backtick and a single quote — and, where a name may hold one, a double
 * quote. A backslash, which Windows' own paths hold, is no character of a
 * POSIX name Node loads a module under. */
const ODD = `odd $HOME \`x\` 'q'${process.platform === "win32" ? "" : ` "dq"`}`;

/** The helper the app ships, copied into a folder named `ODD`. */
function oddHelper(): string {
  const folder = join(scratchDir("spex-credential-line-"), ODD);
  mkdirSync(folder, { recursive: true });
  const helper = join(folder, "git-credential-spex.mjs");
  copyFileSync(gitCredentialHelperPath(), helper);
  return helper;
}

/** What a real Git's `credential fill` answers through `configArgs`, its
 * own and the device's configuration set aside. */
function fill(configArgs: readonly string[], env: NodeJS.ProcessEnv): string {
  const run = spawnSync("git", [...configArgs, "credential", "fill"], {
    input: "protocol=https\nhost=example.test\n\n",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

test("git-host-36: Git runs the helper's line on this runtime, each path one word however it is spelled", async () => {
  const runtime = currentRuntime();
  for (const helperPath of [gitCredentialHelperPath(), oddHelper()]) {
    const handle = await withGitCredential({ username: "oauth2", secret: "tok", origin: "https://example.test" }, runtime, { helperPath });
    try {
      assert.equal(handle.env.ELECTRON_RUN_AS_NODE, runtime.electron ? "1" : undefined, "[git-host-9] the app's own runtime runs the helper as Node");
      assert.match(fill(handle.configArgs, handle.env), /^username=oauth2\npassword=tok\n/m, `[git-host-9] Git runs the helper at ${JSON.stringify(helperPath)} and takes its answer`);
    } finally { await handle.dispose(); }
  }
});

test("git-host-36: the helper's line quotes each path as one word and refuses only a path no line carries", async () => {
  const electron = await withGitCredential({ username: "oauth2", secret: "s3cret" }, { execPath: "/Applications/Spex.app/Contents/MacOS/Spex", electron: true });
  try {
    assert.equal(electron.env.ELECTRON_RUN_AS_NODE, "1");
    assert.deepEqual(electron.configArgs.slice(0, 3), ["-c", "credential.helper=", "-c"], "[git-host-9] the device's own helpers are reset first");
    assert.match(electron.configArgs[3], /^credential\.helper=!'\/Applications\/Spex\.app\/Contents\/MacOS\/Spex' '.*git-credential-spex\.mjs'$/, "[git-host-9] the runtime, then the script");
    assert.equal(readFileSync(electron.env[GIT_CREDENTIAL_FILE_ENV] ?? "", "utf8"), "username=oauth2\npassword=s3cret\n");
  } finally { await electron.dispose(); }
  // A Windows path, and one holding what `sh` interprets: each one word.
  const windows = await withGitCredential({ username: "oauth2", secret: "x" }, { execPath: String.raw`C:\Users\a b\AppData\Local\Programs\Spex\Spex.exe`, electron: true }, { helperPath: String.raw`C:\Users\a b\it's $x\git-credential-spex.mjs` });
  try {
    assert.equal(windows.configArgs[3], String.raw`credential.helper=!'C:\Users\a b\AppData\Local\Programs\Spex\Spex.exe' 'C:\Users\a b\it'\''s $x\git-credential-spex.mjs'`, "[git-host-9] backslashes, a space, `$` and a quote stand in single quotes");
  } finally { await windows.dispose(); }
  assert.equal(
    memberHelperCommand({ execPath: "/opt/spex/bin/node", electron: false }, "/home/m/.spex/local/code-credentials.yaml", { helperPath: "/opt/spex/it's/helper.mjs" }),
    String.raw`!'/opt/spex/bin/node' '/opt/spex/it'\''s/helper.mjs' --member '/home/m/.spex/local/code-credentials.yaml'`,
    "[git-host-9] the member mode's line quotes its paths alike",
  );
  await assert.rejects(withGitCredential({ username: "oauth2", secret: "x" }, { execPath: "/tmp/a\nb", electron: false }), /cannot be quoted/, "[git-host-9] a path no line carries is refused");
  await assert.rejects(withGitCredential({ username: "oauth2", secret: "x\ny" }, currentRuntime()), /cannot carry/);
});

test("git-host-36: the shipped helper answers get from the file at its origin alone and ignores store and erase", async () => {
  const handle = await withGitCredential({ username: "oauth2", secret: "tok" }, currentRuntime());
  try {
    const ask = (operation: string) => execFileSync(process.execPath, [gitCredentialHelperPath(), operation], { input: "protocol=https\nhost=example.test\n\n", encoding: "utf8", env: { ...process.env, ...handle.env } });
    assert.equal(ask("get"), "username=oauth2\npassword=tok\n\n", "[git-host-9] get is answered from the file");
    assert.equal(ask("store"), "", "[git-host-9] store is ignored");
    assert.equal(ask("erase"), "", "[git-host-9] erase is ignored");
  } finally { await handle.dispose(); }
  const scoped = await withGitCredential({ username: "oauth2", secret: "tok", origin: "https://EXAMPLE.test:443/git" }, currentRuntime());
  try {
    const ask = (protocol: string, host: string) => execFileSync(process.execPath, [gitCredentialHelperPath(), "get"], { input: `protocol=${protocol}\nhost=${host}\n\n`, encoding: "utf8", env: { ...process.env, ...scoped.env } });
    assert.equal(ask("https", "example.test"), "username=oauth2\npassword=tok\n\n", "[git-host-9] the normalized origin is answered");
    assert.equal(ask("https", "EXAMPLE.test:443"), "username=oauth2\npassword=tok\n\n");
    assert.equal(ask("http", "example.test"), "", "[git-host-9] another scheme is not");
    assert.equal(ask("https", "example.test:444"), "", "[git-host-9] another port is not");
    assert.equal(ask("https", "elsewhere.test"), "", "[git-host-9] another host is not");
  } finally { await scoped.dispose(); }
});
