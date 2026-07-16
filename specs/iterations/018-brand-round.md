<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-018: Brand Round

## Goal

Apply DR-013: SubLang brand tokens in the UI theme, the monogram
logo in the sidebar and favicon, and the app icon for packaged and
dev runs.

## Deliverables

- [x] Specs: DR-013, DR-010 amendment note, SHELL-23, map rows
- [x] UI: brand ramp + warm light neutrals + Euclid-preferred sans
  as Tailwind tokens; indigo→brand sweep; sidebar monogram;
  favicon; brand focus ring, selection, and native-control
  accent; AA-safe muted ink on paper
- [x] Desktop: monogram `icon.icns` for electron-builder; dev dock
  icon

## Tasks

1. Record DR-013, note the amendment in DR-010, add SHELL-23, and
   update `map.md`.
2. Add brand theme tokens and the monogram asset to `packages/ui`;
   sweep indigo classes to the brand ramp; place the sidebar mark
   and favicon.
3. Generate the monogram icns; point the electron-builder mac
   config at it and set the dev dock icon.

## Acceptance criteria

- Monorepo build and tests green; `spex lint` clean on the specs
  tree.
- Light and dark themes render with brand-purple interaction color;
  primary text/control pairs pass WCAG AA spot checks.
- The packaged-build config carries the monogram icon; a dev launch
  shows it in the dock.
