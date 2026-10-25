// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instance's two routes for a server (Spex Space servers-7, -8),
// called with the server token as the bearer: redeeming a ticket and
// renewing a lease.

import { PERSON_ID } from "./state.js";

export type InstanceAnswer =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "refused"; status: number; code: string; message?: string }
  | { kind: "unreachable"; reason: string };

export interface Admission {
  person: { id: string; login: string; display_name: string | null };
  server: { id: string; name: string };
  lease_expires_at: string;
}

async function post(
  instance: string,
  path: string,
  token: string,
  body: unknown,
  timeoutMs: number,
): Promise<InstanceAnswer> {
  let response: Response;
  try {
    response = await fetch(`${instance}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { kind: "unreachable", reason: (error as Error).name || "network error" };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  const record =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  if (response.status === 200) {
    return record
      ? { kind: "ok", body: record }
      : { kind: "refused", status: 502, code: "bad_instance_answer" };
  }
  const error =
    record && typeof record.error === "object" && record.error !== null
      ? (record.error as Record<string, unknown>)
      : undefined;
  return {
    kind: "refused",
    status: response.status,
    code: typeof error?.code === "string" ? error.code : "instance_refused",
    ...(typeof error?.message === "string" ? { message: error.message } : {}),
  };
}

function personId(value: unknown): string | undefined {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof id === "string" && PERSON_ID.test(id) ? id : undefined;
}

function expiry(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Read the admission the instance answered, or undefined where it is
 * not one. */
export function readAdmission(body: Record<string, unknown>): Admission | undefined {
  const person = body.person as Record<string, unknown> | undefined;
  const server = body.server as Record<string, unknown> | undefined;
  if (typeof person !== "object" || person === null || typeof server !== "object" || server === null) {
    return undefined;
  }
  const id = personId(person.id);
  const leaseExpiresAt = expiry(body.lease_expires_at);
  if (
    !id ||
    typeof person.login !== "string" ||
    !person.login ||
    !(person.display_name === undefined || person.display_name === null || typeof person.display_name === "string") ||
    typeof server.id !== "string" ||
    typeof server.name !== "string" ||
    !leaseExpiresAt
  ) {
    return undefined;
  }
  return {
    person: { id, login: person.login, display_name: (person.display_name as string | null | undefined) ?? null },
    server: { id: server.id, name: server.name },
    lease_expires_at: leaseExpiresAt,
  };
}

export function redeemTicket(
  instance: string,
  token: string,
  ticket: string,
  timeoutMs = 15_000,
): Promise<InstanceAnswer> {
  return post(instance, "/api/v1/servers/admit", token, { ticket }, timeoutMs);
}

export type Renewal =
  | { kind: "renewed"; expiresAt: string }
  | Exclude<InstanceAnswer, { kind: "ok" }>;

export async function renewLease(
  instance: string,
  token: string,
  personId: string,
  timeoutMs = 15_000,
): Promise<Renewal> {
  const answer = await post(instance, "/api/v1/servers/lease", token, { person_id: personId }, timeoutMs);
  if (answer.kind !== "ok") return answer;
  const expiresAt = expiry(answer.body.lease_expires_at);
  return expiresAt
    ? { kind: "renewed", expiresAt }
    : { kind: "refused", status: 502, code: "bad_instance_answer" };
}
