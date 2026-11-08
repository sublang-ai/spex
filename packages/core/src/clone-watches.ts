// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What the core watches inside the clones under `workspace/`: each
// clone's `sessions/`, so sessions another host writes appear as they are
// written (core-service-60); each clone's config beside your own group's —
// its `config/`, or the clone itself until that appears — and your own
// group's config folder, so a changed config reloads (core-service-2).
//
// On Windows a watch holds every folder above it where it lies: no rename
// or removal of a folder holding a watched one is admitted there. A step
// moving or removing clones lets go of what is watched within them first
// and takes it up again after, wherever the clones then lie (`release`),
// on every platform alike, so nothing above asks which one it runs on
// (projects-10, space-59, space-60, storage-35, storage-38).

import { existsSync, realpathSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import type { SpexRepository } from "./store.js";

export interface CloneWatchesOptions {
  /** Whether the core watches now: not where its options turn watching
   * off, nor once it is stopping. */
  active: () => boolean;
  /** The clones as the store lists them now. */
  repositories: () => SpexRepository[];
  /** Your own group's key. */
  own: () => string;
  /** Your own group's config file as the core reads it now, which follows
   * your own group's clone when it moves (space-59). */
  configPath: () => string;
  /** Something changed in a clone's `sessions/`: the file it names, where
   * the platform names one. */
  sessionsChanged: (filename: string | null) => void;
  /** A config file changed: your own group's, or a clone's beside it. */
  configChanged: () => void;
  /** Watching resumed after a release: what a watch let go of would have
   * reported meanwhile is read once. */
  resumed: () => void;
}

interface Watched {
  dir: string;
  watcher: FSWatcher;
}

/** Whether `path` is `folder` or lies beneath it. */
function within(path: string, folder: string): boolean {
  const rel = relative(resolve(folder), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export class CloneWatches {
  private own?: Watched;
  private readonly sessions = new Map<string, Watched>();
  private readonly configs = new Map<string, Watched>();
  /** The clones a release holds let go of, by key, with how many
   * releases hold each; your own group's config folder likewise. */
  private readonly held = new Map<string, number>();
  private ownHeld = 0;
  private closed = false;

  constructor(private readonly options: CloneWatchesOptions) {}

  /** Watch the clones as the store lists them now: a clone that appeared,
   * or moved, is watched where it lies, one that left loses its watches,
   * your own group's config folder is watched where it now stands; what
   * a release holds stays let go of. */
  update(): void {
    if (this.closed || !this.options.active()) return;
    this.updateOwn();
    const repositories = this.options.repositories();
    this.updateSessions(repositories);
    this.updateConfigs(repositories);
  }

  /**
   * Let go of everything watched within the clones at `keys` — your own
   * group's config folder too where it lies in one of them — and keep it
   * let go of, whatever `update` is asked meanwhile, until the function
   * returned is called. That call watches the clones again wherever they
   * then lie, and has what a watch let go of would have reported read
   * once (`resumed`).
   */
  release(keys: readonly string[]): () => void {
    const dirs = this.options.repositories().filter((repository) => keys.includes(repository.key)).map((repository) => repository.dir);
    for (const key of keys) {
      this.held.set(key, (this.held.get(key) ?? 0) + 1);
      this.drop(this.sessions, key);
      this.drop(this.configs, key);
    }
    const own = dirs.some((dir) => within(dirname(this.options.configPath()), dir));
    if (own) {
      this.ownHeld += 1;
      this.own?.watcher.close();
      this.own = undefined;
    }
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      for (const key of keys) {
        const count = (this.held.get(key) ?? 1) - 1;
        if (count > 0) this.held.set(key, count);
        else this.held.delete(key);
      }
      if (own) this.ownHeld -= 1;
      if (this.closed || !this.options.active()) return;
      this.update();
      this.options.resumed();
    };
  }

  /** Close every watch for good, as the core stops. */
  close(): void {
    this.closed = true;
    this.own?.watcher.close();
    this.own = undefined;
    for (const { watcher } of this.sessions.values()) watcher.close();
    this.sessions.clear();
    for (const { watcher } of this.configs.values()) watcher.close();
    this.configs.clear();
  }

  /** Your own group's config folder, watched while it stands where the
   * config is now read. */
  private updateOwn(): void {
    const dir = dirname(this.options.configPath());
    if (this.own && (this.own.dir !== dir || this.ownHeld > 0)) {
      this.own.watcher.close();
      this.own = undefined;
    }
    if (this.own || this.ownHeld > 0 || !existsSync(dir)) return;
    const file = basename(this.options.configPath());
    this.own = this.open(dir, (filename) => {
      if (filename && filename !== file) return;
      this.options.configChanged();
    }, () => { this.own = undefined; });
  }

  /** One watch per clone's `sessions/`. */
  private updateSessions(repositories: readonly SpexRepository[]): void {
    const wanted = new Map(repositories.filter((repository) => !this.held.has(repository.key)).map((repository) => [repository.key, repository.sessionsDir]));
    for (const [key, entry] of [...this.sessions]) {
      if (wanted.get(key) !== entry.dir) this.drop(this.sessions, key);
    }
    for (const [key, dir] of wanted) {
      if (this.sessions.has(key) || !existsSync(dir)) continue;
      const watched = this.open(dir, (filename) => this.options.sessionsChanged(filename), () => {
        if (this.sessions.get(key) === watched) this.sessions.delete(key);
      });
      if (watched) this.sessions.set(key, watched);
    }
  }

  /** One watch per clone's config beside your own group's: its
   * `config/`, or the clone until that appears, then inside it. */
  private updateConfigs(repositories: readonly SpexRepository[]): void {
    const own = resolve(this.options.configPath());
    const wanted = new Map<string, SpexRepository>();
    for (const repository of repositories) {
      if (this.held.has(repository.key) || repository.key === this.options.own() || resolve(repository.configPath) === own) continue;
      wanted.set(repository.key, repository);
    }
    const target = (repository: SpexRepository): string | undefined => {
      const configDir = dirname(repository.configPath);
      if (existsSync(configDir)) return configDir;
      return existsSync(repository.dir) ? repository.dir : undefined;
    };
    for (const [key, entry] of [...this.configs]) {
      const repository = wanted.get(key);
      if (!repository || target(repository) !== entry.dir) this.drop(this.configs, key);
    }
    for (const [key, repository] of wanted) {
      if (this.configs.has(key)) continue;
      const dir = target(repository);
      if (!dir) continue;
      const configDir = dirname(repository.configPath);
      const name = dir === configDir ? basename(repository.configPath) : basename(configDir);
      const watched = this.open(dir, (filename) => {
        if (filename && filename !== name) return;
        // `config/` appeared: the file inside it is watched from now.
        if (dir !== configDir) this.update();
        this.options.configChanged();
      }, () => {
        if (this.configs.get(key) === watched) this.configs.delete(key);
      });
      if (watched) this.configs.set(key, watched);
    }
  }

  /** A watch of `dir` by its real path, closed and forgotten (`gone`) on
   * its error — its folder removed under it — or none where the folder
   * left between the check and the watch: the next update watches again.
   * The real path, as the platform spells it: on Windows a watch of a
   * path spelled with an 8.3 short name, as a temporary folder's often
   * is, names each change by a part of the long path cut at the short
   * one's length, which no filter reads. */
  private open(dir: string, changed: (filename: string | null) => void, gone: () => void): Watched | undefined {
    let watcher: FSWatcher;
    try { watcher = watch(realpathSync.native(dir), (_eventType, filename) => changed(filename)); }
    catch { return undefined; }
    watcher.on("error", () => {
      watcher.close();
      gone();
    });
    return { dir, watcher };
  }

  private drop(watches: Map<string, Watched>, key: string): void {
    watches.get(key)?.watcher.close();
    watches.delete(key);
  }
}
