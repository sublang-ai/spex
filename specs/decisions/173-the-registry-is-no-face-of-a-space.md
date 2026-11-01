# DR-173: The registry is no face of a Space

## Status

Accepted (2026-10-31) on the owner's clarification that one Spex Space site, `spex.sublang.ai`, is the registry itself and lists, on its Groups page, the Spaces where groups live, such as `git.sublang.xyz`.
Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in the Space surface's map and in a Space's heading, and [DR-168](168-independent-package-registry.md) in how the registry is shown; everything else in both stands.

## Context

- The public registry at `spex.sublang.ai` is one service: packages are published to it and read from it, and its sign-in is a GitHub or GitLab account there.
- Its public directory lists Spaces by display name, origin and sign-in kinds; each Space is a site of its own, with its own accounts, where a person's groups and records live.
- One origin may serve both, as `spex.sublang.ai` does, but a Space listed in the directory serves no registry of its own; a project names its registry in `spex.yaml`, the public one by default.
- DR-172 drew the registry as a second face of every Space: one registry line beneath each Space's heading on the Space surface, and a chooser "of the directory's registries" on the Packages tab.
  There is no such list, and a registry line under `git.sublang.xyz` would name a registry that does not exist there.

## Decision

- The registry stands nowhere on the Space surface.
  A Space's heading carries its display name, the person's login, New group, Sign out and its overflow, and nothing of packages or the registry.
- The registry's sign-in stands where packages are managed alone: the Packages tab's header, and the command line's `login` without `--space`.
- The Packages tab's registry chooser offers the public registry by its display name, the registry the environment's `spex.yaml` already names where that is another, and "Other…" revealing a field for a registry's address; it reads no directory for registries.
- The sign-in card's chooser of Spaces stays as DR-172 decided, fed by the public registry's directory, and names each Space by its display name; it never names the Git host behind a Space.

## Consequences

- space-1 and space-113 lose the registry line; space-119 retires and its id is never reused; playbook-library-119 names the chooser's three entries.
- The Space surface's `RegistryLine` and its tests and journey steps are removed in the same change; the Packages tab's header keeps the registry account.
- The IDE still makes one registry sign-in serve every project naming that registry, as DR-168 decided.
