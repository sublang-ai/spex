// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a test client holds of each authoring session's address, as the
// interface holds it (core-service-96): the instance the bootstrap
// handed it — a creation, an open, a listing — or the newest draft.state
// it received. A session command or a draft channel the test sends
// without an instance takes the held one; a test of a mismatch names one
// itself.

import type { Channel, Command, DraftInfo, ServerMessage } from "../protocol.js";

/** A command's fields as a test writes them: the instance, and a draft
 * channel's, filled from what the client holds when left out. */
export type DraftFields<T extends Command["type"]> =
  Omit<Extract<Command, { type: T }>, "type" | "id" | "instance" | "channel"> & {
    instance?: string;
    channel?: Channel | { kind: "draft"; draftId: string; instance?: string };
  };

const SESSION_COMMANDS = new Set<string>([
  "draft.send", "draft.abort", "draft.source.write", "draft.compile", "draft.register",
  "draft.player.set", "draft.delete", "draft.artifacts",
]);

export class DraftAddresses {
  private readonly held = new Map<string, string>();

  /** Learn from a message the core sent. */
  observe(message: ServerMessage): void {
    if (message.type === "draft.state") this.held.set(message.draft.id, message.draft.instance);
  }

  /** Learn from a reply to a bootstrap command. */
  learn(type: string, result: unknown): void {
    if (type === "draft.create" || type === "draft.player.set") {
      const draft = result as DraftInfo;
      this.held.set(draft.id, draft.instance);
    } else if (type === "draft.open") {
      const { draft } = result as { draft: DraftInfo };
      this.held.set(draft.id, draft.instance);
    } else if (type === "draft.list") {
      for (const draft of result as DraftInfo[]) this.held.set(draft.id, draft.instance);
    }
  }

  /** The instance held under an id, if any. */
  of(id: string): string | undefined {
    return this.held.get(id);
  }

  /** The fields with the held instance filled where the test left it out. */
  address(type: string, fields: Record<string, unknown>): Record<string, unknown> {
    if (SESSION_COMMANDS.has(type) && fields.instance === undefined && typeof fields.draftId === "string") {
      const instance = this.held.get(fields.draftId);
      return instance === undefined ? fields : { ...fields, instance };
    }
    if (type === "subscribe" || type === "unsubscribe") {
      const channel = fields.channel as { kind: string; draftId?: string; instance?: string } | undefined;
      if (channel?.kind === "draft" && channel.instance === undefined && channel.draftId !== undefined) {
        const instance = this.held.get(channel.draftId);
        if (instance !== undefined) return { ...fields, channel: { ...channel, instance } };
      }
    }
    return fields;
  }
}
