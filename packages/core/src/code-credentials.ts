// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The member's own credentials on a seat (storage-44, settings-48,
// DR-132): `local/code-credentials.yaml`, exactly `{format: 1, hosts:
// {<host>: {token, username?}}, agents: {<adapter>: {<NAME>: value}}}`,
// owner-only under a `local/` made owner-only. Each entry is written and
// removed as a versioned write, as the app token's file is (storage-19):
// in one synchronous step the file is read, the entry compared with the
// one its writer read, and the file replaced only where they are equal,
// every other entry kept and the file removed with its last one. A file
// of another format is refused and left as it is; a malformed entry is
// refused by every read and write of it and reported, others kept. No
// value ever enters an error, a diagnostic or a log: a file that will
// not read is reported by its path, the YAML parser's warnings and
// errors, which quote the file, reaching no output.

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { closed, isObject, knownFormat, need, StorageFormatError, writeApplicationBytes } from "./files.js";
import { i18n } from "./i18n.js";
import { adapterNameSchema, type AdapterName, type CredentialList } from "./protocol.js";
import { AGENT_CREDENTIAL_FORMS } from "./seat-credentials.js";

/** The path of the member's credentials file under a home. */
export function codeCredentialsPath(homeDir: string): string {
  return join(homeDir, "local", "code-credentials.yaml");
}

/** A code host's credential: the token and, where the host asks for one,
 * the username sent with it. */
export interface HostCredential { token: string; username?: string }

/** An agent's own credential: values by its form names (settings-49). */
export type AgentCredential = Readonly<Record<string, string>>;

/** A code host as a member names one: a DNS host name with an optional
 * `:port` — no scheme, path, userinfo or spaces — in lowercase; null for
 * anything else. */
export function canonicalHost(name: string): string | null {
  const at = name.lastIndexOf(":");
  const hostname = (at < 0 ? name : name.slice(0, at)).toLowerCase();
  const port = at < 0 ? null : name.slice(at + 1);
  if (hostname.length === 0 || hostname.length > 253) return null;
  if (!hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (port !== null && !(/^[1-9][0-9]{0,4}$/.test(port) && Number(port) <= 65_535)) return null;
  return port === null ? hostname : `${hostname}:${port}`;
}

/** A host's token or username: one line of text, never blank. */
const isLine = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && !/[\u0000-\u001f\u007f]/.test(value);
/** An agent's value: never blank, and carrying no NUL, which no process
 * environment holds. */
const isValue = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && !value.includes("\0");

export const isAdapterName = (name: string): name is AdapterName => adapterNameSchema.safeParse(name).success;

function wellFormedHost(key: string, entry: unknown): entry is HostCredential {
  return canonicalHost(key) === key && isObject(entry) &&
    Object.keys(entry).every((field) => field === "token" || field === "username") &&
    isLine(entry.token) && (entry.username === undefined || isLine(entry.username));
}

function wellFormedAgent(key: string, entry: unknown): entry is AgentCredential {
  if (!isAdapterName(key) || !isObject(entry)) return false;
  const names = Object.keys(entry);
  const forms = AGENT_CREDENTIAL_FORMS[key].names;
  return names.length > 0 && names.every((name) => forms.includes(name) && isValue(entry[name]));
}

const sameHost = (a: HostCredential | null, b: HostCredential | null): boolean =>
  a === null || b === null ? a === b : a.token === b.token && a.username === b.username;

function sameAgent(a: AgentCredential | null, b: AgentCredential | null): boolean {
  if (a === null || b === null) return a === b;
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((name) => Object.hasOwn(b, name) && a[name] === b[name]);
}

interface CredentialsDocument { hosts: Record<string, unknown>; agents: Record<string, unknown> }

export interface CodeCredentialStore {
  /** A code host's credential, null where none is set, read before each
   * transport to that host; refused where the file or the entry will
   * not read. */
  readHost(host: string): HostCredential | null;
  /** An agent's own credential, null where none is set. */
  readAgent(adapter: AdapterName): AgentCredential | null;
  /** Every agent's well-formed credential, read before each agent run;
   * refused where the file will not read, a malformed entry left out. */
  readAgents(): Partial<Record<AdapterName, AgentCredential>>;
  /** A versioned write of one host's entry: `next`, or none, in place of
   * `expected`, the entry its writer read, or none; false, and nothing
   * written, where another stands by then. */
  replaceHost(host: string, expected: HostCredential | null, next: HostCredential | null): boolean;
  /** The same for one agent's entry. */
  replaceAgent(adapter: AdapterName, expected: AgentCredential | null, next: AgentCredential | null): boolean;
  /** The entries set, no secret among them; a malformed one is left to
   * the diagnostics. */
  list(): CredentialList;
  /** The file refused, or each malformed entry, as storage diagnostics. */
  diagnostics(): { file: string; reason: string; blocking: boolean }[];
}

export function codeCredentialStore(homeDir: string): CodeCredentialStore {
  const dir = join(homeDir, "local");
  const file = codeCredentialsPath(homeDir);

  function load(): CredentialsDocument | null {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new StorageFormatError(file, (error as NodeJS.ErrnoException).code ?? String(error));
    }
    let doc: unknown;
    try {
      // At "error" the parser emits no warning, each quoting the file,
      // yet still throws where the YAML will not read; "silent" would
      // read it.
      doc = parseYaml(text, { logLevel: "error" });
    } catch {
      // The parser's own words quote the file, which may hold a secret.
      throw new StorageFormatError(file, i18n._({
        id: "not valid YAML; preserved unchanged",
        comment: "Storage diagnostic: a YAML file of the home does not parse; the file is left as it is",
      }));
    }
    need(isObject(doc), file, i18n._({ id: "expected an object", comment: "Storage diagnostic: a record in the file is not an object" }));
    // A format is named only where it is a number: one written by hand
    // may hold anything, a secret among it.
    need(typeof doc.format === "number", file, i18n._({
      id: "unsupported format; preserved unchanged",
      comment: "Storage diagnostic: the seat's credentials file names a layout version that is no number, which is not repeated; the file is left as it is",
    }));
    knownFormat(doc, file, 1);
    closed(doc, ["format", "hosts", "agents"], [], file);
    need(isObject(doc.hosts) && isObject(doc.agents), file, i18n._({ id: "expected an object", comment: "Storage diagnostic: a record in the file is not an object" }));
    return { hosts: { ...doc.hosts }, agents: { ...doc.agents } };
  }

  // An entry is named only by a key that is a host or an agent: a key
  // written by hand may hold anything, a secret among it.
  const malformedHost = (host: string): StorageFormatError => new StorageFormatError(file, canonicalHost(host) === host
    ? i18n._({
        id: "the host entry {name} is malformed; preserved unchanged",
        comment: "Storage diagnostic: a code host's entry in the seat's credentials file will not read; {name} is its host name as the file keys it",
        values: { name: host },
      })
    : i18n._({
        id: "a host entry keyed by no host name is malformed; preserved unchanged",
        comment: "Storage diagnostic: the seat's credentials file holds a code host's entry under a key that is no host name, which is not repeated",
      }));
  const malformedAgent = (adapter: string): StorageFormatError => new StorageFormatError(file, isAdapterName(adapter)
    ? i18n._({
        id: "the agent entry {name} is malformed; preserved unchanged",
        comment: "Storage diagnostic: an agent's entry in the seat's credentials file will not read; {name} is the agent's name",
        values: { name: adapter },
      })
    : i18n._({
        id: "an agent entry keyed by no agent's name is malformed; preserved unchanged",
        comment: "Storage diagnostic: the seat's credentials file holds an agent's entry under a key that is no agent's name, which is not repeated",
      }));

  function hostOf(doc: CredentialsDocument | null, host: string): HostCredential | null {
    if (doc === null || !Object.hasOwn(doc.hosts, host)) return null;
    const entry = doc.hosts[host];
    if (!wellFormedHost(host, entry)) throw malformedHost(host);
    return { token: entry.token, ...(entry.username !== undefined ? { username: entry.username } : {}) };
  }

  function agentOf(doc: CredentialsDocument | null, adapter: AdapterName): AgentCredential | null {
    if (doc === null || !Object.hasOwn(doc.agents, adapter)) return null;
    const entry = doc.agents[adapter];
    if (!wellFormedAgent(adapter, entry)) throw malformedAgent(adapter);
    return { ...entry };
  }

  /** Write `doc` as it stands, or remove the file once it holds no entry. */
  function save(doc: CredentialsDocument): true {
    if (Object.keys(doc.hosts).length === 0 && Object.keys(doc.agents).length === 0) {
      rmSync(file, { force: true });
      return true;
    }
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeApplicationBytes(file, stringifyYaml({ format: 1, hosts: doc.hosts, agents: doc.agents }));
    return true;
  }

  return {
    readHost: (host) => hostOf(load(), canonicalHost(host) ?? host),
    readAgent: (adapter) => agentOf(load(), adapter),
    readAgents: () => {
      const doc = load();
      const agents: Partial<Record<AdapterName, AgentCredential>> = {};
      for (const [adapter, entry] of Object.entries(doc?.agents ?? {})) {
        if (wellFormedAgent(adapter, entry)) agents[adapter as AdapterName] = { ...entry };
      }
      return agents;
    },
    replaceHost: (host, expected, next) => {
      const doc = load() ?? { hosts: {}, agents: {} };
      if (!sameHost(hostOf(doc, host), expected)) return false;
      if (next === null) {
        if (!Object.hasOwn(doc.hosts, host)) return true;
        delete doc.hosts[host];
      } else doc.hosts[host] = { token: next.token, ...(next.username !== undefined ? { username: next.username } : {}) };
      return save(doc);
    },
    replaceAgent: (adapter, expected, next) => {
      const doc = load() ?? { hosts: {}, agents: {} };
      if (!sameAgent(agentOf(doc, adapter), expected)) return false;
      if (next === null) {
        if (!Object.hasOwn(doc.agents, adapter)) return true;
        delete doc.agents[adapter];
      } else doc.agents[adapter] = { ...next };
      return save(doc);
    },
    list: () => {
      const doc = load();
      const hosts: CredentialList["hosts"] = [];
      for (const [name, entry] of Object.entries(doc?.hosts ?? {})) {
        if (wellFormedHost(name, entry)) hosts.push({ name, ...(entry.username !== undefined ? { username: entry.username } : {}) });
      }
      const agents: CredentialList["agents"] = [];
      for (const [name, entry] of Object.entries(doc?.agents ?? {})) {
        if (wellFormedAgent(name, entry)) agents.push({ name: name as AdapterName, names: Object.keys(entry).sort() });
      }
      hosts.sort((a, b) => a.name.localeCompare(b.name));
      agents.sort((a, b) => a.name.localeCompare(b.name));
      return { hosts, agents };
    },
    diagnostics: () => {
      let doc: CredentialsDocument | null;
      try {
        doc = load();
      } catch (error) {
        if (error instanceof StorageFormatError) return [{ file: error.file, reason: error.reason, blocking: false }];
        throw error;
      }
      const reports: { file: string; reason: string; blocking: boolean }[] = [];
      for (const [name, entry] of Object.entries(doc?.hosts ?? {})) {
        if (!wellFormedHost(name, entry)) reports.push({ file, reason: malformedHost(name).reason, blocking: false });
      }
      for (const [name, entry] of Object.entries(doc?.agents ?? {})) {
        if (!wellFormedAgent(name, entry)) reports.push({ file, reason: malformedAgent(name).reason, blocking: false });
      }
      return reports;
    },
  };
}
