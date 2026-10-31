// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Build-time CRT staging; end users need neither a compiler nor a global runtime install.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  throw new Error("Windows runtime staging must run on a Windows build host");
}
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let source = process.env.SPEX_WINDOWS_CRT_DIR;
if (!source) {
  const vswhere = join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft Visual Studio/Installer/vswhere.exe");
  const vs = execFileSync(vswhere, ["-latest", "-property", "installationPath"], { encoding: "utf8" }).trim();
  const base = join(vs, "VC/Redist/MSVC");
  const candidates = readdirSync(base).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
  for (const version of candidates) {
    const directory = join(base, version, "x64/Microsoft.VC143.CRT");
    if (existsSync(join(directory, "vcruntime140.dll"))) { source = directory; break; }
  }
}
if (!source) throw new Error("Windows build requires the Microsoft x64 CRT redistributable directory");
const target = join(desktop, "build/windows-runtime");
mkdirSync(target, { recursive: true });
const manifest = [];
// A pwsh -> npm/cmd -> Node -> powershell.exe chain otherwise passes
// PowerShell 7's incompatible modules to Windows PowerShell 5.1.
// Let this child reconstruct its own default module search path.
const signatureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PSMODULEPATH"),
);
for (const name of ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"]) {
  const file = join(source, name);
  const signature = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:SPEX_CRT_SIGNATURE_FILE; @{status=$s.Status.ToString();subject=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress"],
  { encoding: "utf8", env: { ...signatureEnv, SPEX_CRT_SIGNATURE_FILE: file } }));
  if (signature.status !== "Valid" || !signature.subject?.includes("Microsoft")) {
    throw new Error(`${name}: Microsoft signature verification failed`);
  }
  copyFileSync(file, join(target, name));
  manifest.push({ name, sha256: createHash("sha256").update(readFileSync(file)).digest("hex"), signature });
}
writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Verified and staged Microsoft CRT redistributables for the Windows desktop");
