<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-215: Developer ID macOS Downloads

## Status

Accepted (2026-11-03) on the owner's request to reuse the verified KeySync signing identity and notarization credentials for Spex.
Amends [DR-184](184-native-desktop-tag-packages.md) and [DR-177](177-native-desktop-installers.md) for macOS signing and notarization; architectures, Windows signing status and publication gates remain.

## Context

The Mac download is currently ad-hoc signed and not notarized.
An isolated Spex beta.26 App and DMG passed actual Developer ID signing, Apple notarization, ticket validation and Gatekeeper assessment with the existing credentials.
That acceptance required a fresh temporary keychain to sign the DMG after packaging rather than relying on the builder's DMG signing.

## Decision

- Keep Spex and `ai.sublang.spex`, using the configured Developer ID Application identity and team independently of the product name.
- Require signing credentials for the distribution command and the native Mac tag job; never fall back silently to unsigned or pending-notarization downloads.
- Sign the App with hardened runtime and Electron's required entitlements, preserving its Electron-as-Node compiler and native dependencies.
- Obtain Accepted notarization and staple the App before packaging the DMG, then sign that DMG with a secure timestamp in a fresh temporary keychain, obtain Accepted notarization and staple it.
- Verify both signatures, tickets and Gatekeeper assessments, including the App inside the final DMG, before making the Mac download eligible for publication.
- Inject private P12 and P8 inputs from repository secrets into temporary files, restore the keychain search list and delete temporary keychains and private inputs after use, leaving the default keychain and trust settings alone.
- Keep the verified public Apple G2 intermediate and root certificates separate from private signing credentials.

## Consequences

Mac releases require the configured signing service and Apple notarization to be available.
Windows downloads remain unsigned and the existing two-platform release gate remains.
Local unsigned developer directory builds require explicit builder overrides and are not the distribution command.
