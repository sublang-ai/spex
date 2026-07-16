<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-013: SubLang Brand Adoption

## Status

Accepted

## Context

- The UI shipped on placeholder styling: Tailwind's default indigo
  as the interaction hue, stock cool neutrals, and no logo, favicon,
  or app icon.
- SubLang has a design system (claude.ai design project
  `019e240c-0533-7648-91b4-79cdb0f12b90`, "SubLang Design System")
  defining the brand purples, warm paper neutrals, type, and logo
  assets.
  Its canonical marks are the two-tone SUBLANG wordmark and the
  monogram (white SL on a `#890FBC` rounded square), which the
  system designates for favicons and app icons.
- DR-010 §8 reserves indigo for interaction; deviations need a
  recorded decision.
- The owner asked to add the logo and fit the app into the brand
  style minimally — not to rebuild the interface.

## Decision

- Fit in, don't rebuild: DR-010's grammar stands — status palette
  (emerald/amber/red/neutral), one icon language, small type scale,
  one button taxonomy — and DR-011's group hues (sky/fuchsia/teal)
  stand.
- **Interaction hue.** A brand-purple ramp anchored at the system's
  `--accent` `#890FBC` (step 600) and `--accent-dark` `#27063D`
  (step 950) replaces indigo everywhere indigo marked interaction.
  This amends DR-010 §8: *brand purple* is reserved for
  interaction.
- **Warm light theme.** Light-theme neutrals shift to the system's
  warm paper values (page `#F7F4EF`, hover `#EFEAE2`, hairline
  `#E3DED5`, strong border `#D8D2C6`); panels stay white; text
  stays neutral ink.
- **Derived dark theme.** The design system defines a single light
  theme; the app keeps its OS-driven dark theme (DR-010 §7),
  derived as stock dark neutrals plus lighter steps of the same
  brand ramp, with WCAG contrast holding in both themes.
- **Bright purple is artwork-only.** The wordmark's `#A416EF` never
  appears as UI text, border, or fill.
- **Type.** Sans stack prefers Euclid Circular A when installed and
  falls back to the platform sans.
  The licensed font files are not bundled into this public repo.
- **Logo.** The SubLang monogram is the app icon and the in-app
  mark beside the Spex name.
  Logo assets come from the design-system project unmodified —
  never redrawn or re-typeset.
- **Interaction details.** One focus ring — a 2px brand outline at
  2px offset on `:focus-visible`; native control accents and text
  selection ride the brand ramp.
  Light-theme muted text darkens one step so warm paper holds WCAG
  AA (DR-010 §7); dark-theme steps stay stock.
- Brand values live as Tailwind theme tokens in the UI stylesheet,
  one place to retune.

## Consequences

- From this decision on, DR-010 §8 reads "brand purple reserved for
  interaction"; its other clauses are unchanged.
- SHELL gains the packaged-app icon requirement
  ([SHELL-23](../packages/app-shell.md#shell-23)).
- Most users see the platform sans until a font-license decision
  allows shipping Euclid with the app.
- IR-018 materializes this decision across the UI and shell.
