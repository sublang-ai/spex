# Native Windows Codex isolation snapshot

This unpublished local build of `@sublang/cligent` 0.36.1 includes the adjacent Windows Codex isolation final-response and PowerShell module-cache patches. It retains `--ignore-user-config`, the caller permission policy, authentication/session home and bounded native-child cleanup. It uses the installed SDK public executable/environment options and the embedding Node/Electron runtime, without a global Node executable or WSL.

The archive keeps the upstream package version. The file dependency and SHA-256 in `provenance.json` identify these unpublished bytes. Replace the file dependency after a coordinated Cligent release contains the fix and native Windows acceptance passes. This build performs no registry publication.

To reproduce, check out the recorded upstream commit, apply `windows-codex-isolation.patch` then `codex-final-response.patch` and `powershell-module-cache.patch`, install the recorded dependencies, build, and run `npm pack --ignore-scripts`. The patch contains the decision record and native Windows real-SDK integration check. Upstream license and notices remain inside the archive.

The terminal result follows the public Codex SDK finalResponse contract: the last completed agent message, with explicit native result precedence; progress remains streamed and journaled.

Windows SDK shell configuration sets only PSModuleAnalysisCachePath (explicit inherited value, otherwise NUL), leaving environment inheritance and permission mapping unchanged. This prevents PowerShell 5.1 cache fallback into the caller cwd when LOCALAPPDATA is filtered.

The 20261031.1 archive additionally applies `windows-native-sandbox.patch` to the compiled adapter after the preceding build. Bounded Windows calls prefer the host-compatible native MXC backend and carry a Windows command-shell capability instruction through Codex's native configuration. File/shell/network permissions, approval policy and managed requirements are retained. The existing snapshot version convention is unchanged; the archive name and recorded hashes identify these bytes. Native Node and packaged Electron calls must read real fixture bytes, and a native read-only probe must reject writes; a model's successful reply alone is insufficient.
