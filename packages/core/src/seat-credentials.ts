// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A seat's agent credentials (core-service-126, settings-49, DR-132): the
// administrator's shared credential file and the member's own credentials
// are read when the core starts and before each agent run into the
// process environment every adapter inherits at spawn, so a value replaced
// between runs reaches the next run while a running agent process keeps
// the copy it was spawned with. For an agent the member set a credential
// of their own for, the file's names are left out and the member's put
// in, so the member's own wins whatever the agent's precedence. Readiness
// on a seat counts these forms as an agent's credential half and runs the
// agent's own status command with the run's environment. No value of
// either file is written anywhere else or logged.

import { readFileSync } from "node:fs";
import { locateAgentExecutable } from "@sublang/cligent";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";
import type { RunCommand } from "./forge.js";
import { i18n } from "./i18n.js";
import type { AdapterCredential, AdapterName } from "./protocol.js";

/** Each agent's shared and own forms (settings-49): every name the shared
 * file may carry for it and a member may set, and among them the names
 * holding a credential — Kimi's model name, base URL and provider type
 * only accompany its key. */
export const AGENT_CREDENTIAL_FORMS: Readonly<Record<AdapterName, { names: readonly string[]; keys: readonly string[] }>> = {
  claude: {
    names: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    keys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  },
  codex: {
    names: ["CODEX_ACCESS_TOKEN", "CODEX_API_KEY", "OPENAI_API_KEY"],
    keys: ["CODEX_ACCESS_TOKEN", "CODEX_API_KEY", "OPENAI_API_KEY"],
  },
  opencode: { names: ["OPENCODE_AUTH_CONTENT"], keys: ["OPENCODE_AUTH_CONTENT"] },
  gemini: {
    names: ["GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_API_KEY"],
    keys: ["GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_API_KEY"],
  },
  kimi: {
    names: ["KIMI_MODEL_API_KEY", "KIMI_MODEL_NAME", "KIMI_MODEL_BASE_URL", "KIMI_MODEL_PROVIDER_TYPE"],
    keys: ["KIMI_MODEL_API_KEY"],
  },
};

const ADAPTERS = Object.keys(AGENT_CREDENTIAL_FORMS) as AdapterName[];
const FORM_NAMES: ReadonlySet<string> = new Set(ADAPTERS.flatMap((adapter) => AGENT_CREDENTIAL_FORMS[adapter].names));

/** What an agent's status command answered. */
interface StatusAnswer { code: number; stdout: string; stderr: string }

/** An agent's own status command (settings-49), where it has one, and
 * the answers of it that report the credential expired or refused. Only
 * such an answer decides: one saying the agent is not signed in — as
 * Codex's says of an API key, which its status never counts — a
 * configuration error, or a command that could not run decide nothing,
 * so expired stands apart from "not signed in" (DR-132). */
const STATUS_COMMANDS: Partial<Record<AdapterName, { args: readonly string[]; refuses: (answer: StatusAnswer) => boolean }>> = {
  // Claude's counts every form in its environment: `loggedIn: false`
  // while one is in force is that form refused.
  claude: {
    args: ["auth", "status"],
    refuses: (answer) => {
      try {
        const parsed = JSON.parse(answer.stdout) as unknown;
        return parsed !== null && typeof parsed === "object" && (parsed as { loggedIn?: unknown }).loggedIn === false;
      } catch {
        return false;
      }
    },
  },
  // Codex's checks an access token alone, failing with "Error checking
  // login status: …" where it refuses one; an API key reads "Not logged
  // in".
  codex: {
    args: ["login", "status"],
    refuses: (answer) => {
      const said = `${answer.stdout}\n${answer.stderr}`;
      return answer.code !== 0 && !/not logged in/i.test(said) && /error checking login status|expired/i.test(said);
    },
  },
};

/** The shared file's forms, read as `NAME=value` lines: blank lines and
 * lines starting with `#` ignored, the value everything after the first
 * `=` with no shell quoting or expansion and possibly empty, and a name
 * that is no agent's form ignored, as is a line holding no `=`. A name
 * given twice takes its last value; a leading byte-order mark is no
 * part of the text. */
export function parseSharedCredentials(text: string): Map<string, string> {
  const values = new Map<string, string>();
  // An editor's byte-order mark is no part of the first name.
  for (const raw of (text.startsWith("\uFEFF") ? text.slice(1) : text).split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.trim() === "" || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at <= 0) continue;
    const name = line.slice(0, at);
    if (FORM_NAMES.has(name)) values.set(name, line.slice(at + 1));
  }
  return values;
}

/** The shared file as it stands: read, absent — no file at the path — or
 * unreadable. */
type SharedRead = { state: "read"; values: Map<string, string> } | { state: "absent" } | { state: "unreadable" };

function readSharedFile(path: string): SharedRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { state: "absent" } : { state: "unreadable" };
  }
  return { state: "read", values: parseSharedCredentials(text) };
}

/** What a run's environment was composed from: the shared file's state
 * (`none` where no file is configured or none stands), the file's values
 * in force — the last read's while it cannot be read — and the member's
 * own credentials by agent. */
export interface SeatCredentialSources {
  shared: "none" | "read" | "unreadable";
  sharedValues: ReadonlyMap<string, string>;
  own: Readonly<Partial<Record<AdapterName, Readonly<Record<string, string>>>>>;
}

/**
 * The environment a seat's runs inherit (core-service-126): `target` is
 * the process environment the adapters copy at spawn. Every agent's form
 * names in it are written from the member's own credential for that
 * agent where one is set, else from the shared file, else as the process
 * started with them; a file that cannot be read leaves the file's part as
 * it was.
 */
export class SeatEnvironment {
  /** Each form name as the process started with it. */
  private readonly baseline = new Map<string, string | undefined>();
  private sharedValues = new Map<string, string>();
  /** The form names the last read decided from the member's own
   * credentials or the shared file, each with its value or none. */
  private decided = new Map<string, string | undefined>();

  constructor(
    private readonly target: NodeJS.ProcessEnv,
    private readonly sharedFile: string | undefined,
    private readonly ownCredentials: () => Partial<Record<AdapterName, Readonly<Record<string, string>>>>,
  ) {
    for (const name of FORM_NAMES) this.baseline.set(name, target[name]);
  }

  /** Read both files and write the environment the next run inherits;
   * never throws, and names no value. */
  prepare(): SeatCredentialSources {
    let shared: SeatCredentialSources["shared"] = "none";
    if (this.sharedFile !== undefined) {
      const read = readSharedFile(this.sharedFile);
      if (read.state === "unreadable") shared = "unreadable";
      else if (read.state === "read") {
        shared = "read";
        this.sharedValues = read.values;
      } else this.sharedValues = new Map();
    }
    let own: Partial<Record<AdapterName, Readonly<Record<string, string>>>> = {};
    try {
      own = this.ownCredentials();
    } catch {
      // A credentials file that will not read is reported where it is
      // listed (storage-44); a run proceeds without the member's own.
      own = {};
    }
    const decided = new Map<string, string | undefined>();
    for (const adapter of ADAPTERS) {
      const mine = own[adapter];
      for (const name of AGENT_CREDENTIAL_FORMS[adapter].names) {
        if (mine) decided.set(name, mine[name]);
        else if (this.sharedValues.has(name)) decided.set(name, this.sharedValues.get(name));
        const value = decided.has(name) ? decided.get(name) : this.baseline.get(name);
        if (value === undefined) delete this.target[name];
        else this.target[name] = value;
      }
    }
    this.decided = decided;
    return { shared, sharedValues: new Map(this.sharedValues), own };
  }

  /** `base` as an agent run spawned with an environment of its own
   * inherits it — a compile's (playbook-library-42): every form name the
   * last read decided written as it decided it, the others as `base`
   * holds them. */
  envFor(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    if (base === this.target) return base;
    const env = { ...base };
    for (const [name, value] of this.decided) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
    return env;
  }

  /** Each form name back as the process started with it, at stop. */
  restore(): void {
    for (const [name, value] of this.baseline) {
      if (value === undefined) delete this.target[name];
      else this.target[name] = value;
    }
  }

  /** The values a run of `adapter` inherits now, by form name. */
  runValues(adapter: AdapterName): Record<string, string> {
    const values: Record<string, string> = {};
    for (const name of AGENT_CREDENTIAL_FORMS[adapter].names) {
      const value = this.target[name];
      if (value !== undefined) values[name] = value;
    }
    return values;
  }
}

/** Adapter imports whose every run first calls `before` (core-service-126):
 * the environment is written as the run starts, just before the adapter
 * spawns its runtime, so no adapter takes a per-run environment. */
export function seatAdapterImports(imports: PlayerAdapterImports, before: () => void): PlayerAdapterImports {
  type Runner = new (...args: any[]) => { run(...args: unknown[]): unknown };
  const wrapped = new WeakMap<Runner, Runner>();
  const loaders: Record<string, () => Promise<Runner>> = {};
  for (const [adapter, load] of Object.entries(imports) as [string, () => Promise<Runner>][]) {
    loaders[adapter] = async () => {
      const Adapter = await load();
      let Seated = wrapped.get(Adapter);
      if (!Seated) {
        Seated = class extends Adapter {
          run(...args: unknown[]): unknown {
            before();
            return super.run(...args);
          }
        };
        wrapped.set(Adapter, Seated);
      }
      return Seated;
    };
  }
  return loaders as unknown as PlayerAdapterImports;
}

/** The credential half of readiness on a seat (settings-49). */
export interface SeatCredentialHalf {
  ready: boolean;
  requirement?: string;
  credential: AdapterCredential;
}

/** The executable of the agent's own status command: the one its SDK
 * spawns, found by cligent's lookup, else its name on `PATH`. */
function statusExecutable(adapter: "claude" | "codex"): string {
  try {
    const located = locateAgentExecutable(adapter);
    if (located.state === "present") return located.path;
  } catch {
    // Its name on PATH answers instead.
  }
  return adapter;
}

const ownPhrase = (): string => i18n._({
  id: "Your own credential",
  comment: "Readiness on a team server's seat: the agent runs on a credential the member placed in Settings",
});
const sharedPhrase = (): string => i18n._({
  id: "Signed in by this server's administrator",
  comment: "Readiness on a team server's seat: the agent runs on the sign-in the server's administrator shared",
});

/**
 * An adapter's credential class on a seat (settings-49): `own` where the
 * member set a credential for the agent, else `unreadable` where the
 * shared file cannot be read, else `shared` where a form of the agent is
 * in the shared file, else none; an own or shared credential the agent's
 * status command, run with the run's environment, reports expired or
 * refused is `expired`.
 */
export async function seatCredentialHalf(
  adapter: AdapterName,
  sources: SeatCredentialSources,
  runValues: Record<string, string>,
  run: RunCommand,
): Promise<SeatCredentialHalf> {
  const forms = AGENT_CREDENTIAL_FORMS[adapter];
  const own = sources.own[adapter] !== undefined;
  const shared = !own && sources.shared === "read" && forms.keys.some((name) => (sources.sharedValues.get(name) ?? "") !== "");
  if (own || shared) {
    const status = STATUS_COMMANDS[adapter];
    if (status && (adapter === "claude" || adapter === "codex")) {
      let refused = false;
      try {
        refused = status.refuses(await run(statusExecutable(adapter), [...status.args], undefined, runValues));
      } catch {
        refused = false;
      }
      if (refused) {
        const phrase = own
          ? i18n._({
              id: "Your own credential has expired",
              comment: "Readiness on a team server's seat: the agent's status command reports the credential the member placed expired or refused",
            })
          : i18n._({
              id: "This server's shared sign-in has expired: ask its administrator",
              comment: "Readiness on a team server's seat: the agent's status command reports the administrator's shared sign-in expired or refused",
            });
        return { ready: false, requirement: phrase, credential: { class: "expired", phrase } };
      }
    }
    return { ready: true, credential: own ? { class: "own", phrase: ownPhrase() } : { class: "shared", phrase: sharedPhrase() } };
  }
  if (sources.shared === "unreadable") {
    const phrase = i18n._({
      id: "This server's shared sign-in cannot be read: ask its administrator",
      comment: "Readiness on a team server's seat: the file holding the administrator's shared sign-ins cannot be read",
    });
    return { ready: false, requirement: phrase, credential: { class: "unreadable", phrase } };
  }
  const phrase = i18n._({
    id: "sign in by setting your own credential for {adapter} in the Credentials section",
    comment: "Adapter requirement on a team server's seat, where no credential of the agent is set; `adapter` is the agent's name and the Credentials section is the one in Settings",
    values: { adapter },
  });
  return { ready: false, requirement: phrase, credential: { class: "none", phrase } };
}
