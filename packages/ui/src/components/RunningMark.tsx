// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One aliveness grammar (DR-031, run-view-61): everything that is
// running wears this mark — the active state of a machine, a running
// run's strip, a player's pane. Static under reduced motion, and its
// meaning is in the accessible name, never in the color alone.

export function RunningMark({
  running,
  className = "",
  ...rest
}: {
  running: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      data-running={running ? "true" : "false"}
      className={`h-2 w-2 shrink-0 rounded-full ${
        running
          ? "bg-emerald-500 motion-safe:animate-pulse"
          : "border-2 border-neutral-500"
      } ${className}`}
    >
      <span className="sr-only">{running ? "running" : "idle"}</span>
    </span>
  );
}
