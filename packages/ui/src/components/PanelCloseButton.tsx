// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { ComponentProps } from "react";
import { i18n } from "../i18n.js";
import { Icon } from "./Icon.js";

/** Quiet panel chrome, with the same cross and target size as the
 * app's existing icon controls. The enclosing panel owns dismissal. */
export function PanelCloseButton({
  label = i18n._("Close"),
  title = label,
  className = "",
  ...props
}: Omit<ComponentProps<"button">, "children"> & { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      {...props}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 ${className}`}
    >
      <Icon name="close" />
    </button>
  );
}
