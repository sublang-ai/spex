// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Workshop switch (settings-56, DR-174): a constant of the
// interface's code, never read from the environment, so an attendee
// signed in before the Workshop sees what one who ran the setup script
// sees. On, the adapter choices are Claude and Codex and each card's
// configuration steps lead with the setup script; the release after
// the Workshop turns it off, restoring every adapter.

export const WORKSHOP = true;

/** The adapters the switch leaves offered. */
export const WORKSHOP_ADAPTERS = ["claude", "codex"] as const;
