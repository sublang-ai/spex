// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Workshop switch (settings-58, DR-203): a constant of the
// interface's code, never read from the environment, so every attendee
// sees the same cards. On, the adapter choices are Claude and Codex and
// a not-ready card offers the Workshop's setup guide (settings-71); the
// release after the Workshop turns it off, restoring every adapter and
// the manual steps alone.

export const WORKSHOP = true;

/** The adapters the switch leaves offered. */
export const WORKSHOP_ADAPTERS = ["claude", "codex"] as const;

/** The Workshop's configuration document (settings-71). */
export const WORKSHOP_GUIDE_URL = "https://merico.feishu.cn/docx/AjiHdkmV1oIAd6xY4CPcWJZpnah";

/** Where the configuration document's steps for an adapter on each
 * platform begin (settings-71): Claude's at the platform's head, Codex's
 * at its own section; any other platform opens it at its top. */
const GUIDE_ANCHORS: Record<string, Record<string, string>> = {
  win32: { claude: "doxcnAdFPoFFjXyeRrnquz98wQ4", codex: "doxcn7rsGnFZ0EKTepBD0qSnXrd" },
  darwin: { claude: "doxcnEXXdRnpDfvWb8k8vHYt16d", codex: "doxcnfsvh6ogCgUgDtH1qeSIrhh" },
};

export function workshopGuideUrl(adapter: string, platform: string | undefined): string {
  const anchor = platform ? GUIDE_ANCHORS[platform]?.[adapter] : undefined;
  return anchor ? `${WORKSHOP_GUIDE_URL}#${anchor}` : WORKSHOP_GUIDE_URL;
}
