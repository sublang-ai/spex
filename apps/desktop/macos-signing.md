<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Mac distribution signing

`npm run package:mac -w apps/desktop` builds a Developer ID signed arm64 App,
notarizes and staples it, packages it in a DMG, signs that DMG in a fresh
temporary keychain, then notarizes, staples and verifies the final download.
It does not publish a release. A missing credential or any failed check fails
the command; a timed-out or pending notarization is not accepted.

The product remains `Spex` / `ai.sublang.spex`. Its publisher is the supplied
Developer ID Application certificate, checked against `APPLE_TEAM_ID`.
The default keychain and trust settings are never changed; temporary signing
keychains are deleted and the original search list is restored after use.
The package retains Electron's RunAsNode capability and its physical dependency
tree. The strict packaged compiler check also runs after App signing.

## GitHub repository secrets

Configure these on the repository whose app tag will run the workflow.
Secrets belonging to the KeySync repository are not automatically shared.
Use the verified original credential files and values; never commit them.

| SPEX secret | Corresponding KeySync secret |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | `KEYSYNC_MACOS_CERTIFICATE_P12_BASE64` |
| `MACOS_CERTIFICATE_PASSWORD` | `KEYSYNC_MACOS_CERTIFICATE_PASSWORD` |
| `APPLE_API_KEY_P8_BASE64` | `KEYSYNC_APPLE_API_KEY_P8_BASE64` |
| `APPLE_API_KEY_ID` | `KEYSYNC_APPLE_API_KEY_ID` |
| `APPLE_API_ISSUER` | `KEYSYNC_APPLE_API_ISSUER` |
| `APPLE_TEAM_ID` | `KEYSYNC_APPLE_TEAM_ID` |

Only the Mac signing stage receives the secrets, after dependency installation
and source builds. It decodes P12/P8 to files with mode
0600 under the runner's temporary directory and removes them in an `always()`
step. Public artifacts include `macos-signing.json`, two Apple receipts and
the existing compiler verification report, never private inputs or keychains.
Both native jobs still have to succeed before the existing release job runs.
Builder's pre-signing updater manifest and blockmap are removed because DMG
signing and stapling change those bytes; this channel publishes the final DMG
and the existing final-download SHA256SUMS, not updater sidecars.

## Local use

Set `CSC_LINK` to the original P12 file, `CSC_KEY_PASSWORD` to its password,
`APPLE_API_KEY` to the original P8 file, and `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, `APPLE_TEAM_ID` to the corresponding values in a private
process environment. The input files are read, never modified or copied into
the repository. Use the same distribution command as CI.

`SPEX_MAC_OUTPUT_DIR` selects an isolated output directory and
`SPEX_ELECTRON_DIST` optionally selects an already unpacked, matching Electron
distribution for local validation. The normal CI does not require either.
For unsigned developer directory builds only, call electron-builder explicitly
with `--mac --dir --arm64 --publish never --config.mac.identity=null
--config.mac.forceCodeSigning=false`; this is not a distributable release.

## Public certificate chain

`build/apple/` contains public Apple certificates, not private signing keys.
No trust override is applied when they are imported into the temporary keychain.
Their SHA-256 values are checked by the distribution script before use.

| File | Apple source | SHA-256 |
| --- | --- | --- |
| `DeveloperIDG2CA.cer` | https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer | `f16cd3c54c7f83cea4bf1a3e6a0819c8aaa8e4a1528fd144715f350643d2df3a` |
| `AppleRootCA.cer` | https://www.apple.com/appleca/AppleIncRootCertificate.cer | `b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024` |

This is the G2 chain of the verified existing Developer ID credential.
Changing to another certificate chain requires reviewing the public chain files.
The Electron entitlements are the builder's existing JIT, executable-memory and
native-library compatibility defaults, explicitly retained for App and helpers.

The orchestration tests use recorded tool responses; they do not establish
Apple service acceptance. Real credential, signing, notarization and Gatekeeper
results must be recorded separately. GitHub runner/secret transport additionally
requires a real CI run; local success is not that CI result.
