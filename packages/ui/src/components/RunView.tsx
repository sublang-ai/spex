// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The project session run view (RUN-1..12): Captain column with the
// Boss composer docked below, player panes for the visible roster.

import type { SessionInfo } from "@sublang/spex-core/protocol";

import type { SessionView } from "../state/reducer.js";
import type { ComposerState } from "../state/store.js";
import { CaptainPane } from "./CaptainPane.js";
import { Composer } from "./Composer.js";
import { PlayerPane } from "./PlayerPane.js";

export function RunView({
  session,
  view,
  composer,
  connected,
  error,
  onSubmit,
  onAbort,
  onRemoveQueued,
  onDismissError,
}: {
  session: SessionInfo;
  view: SessionView;
  composer: ComposerState;
  connected: boolean;
  error?: string;
  onSubmit: (text: string) => Promise<void>;
  onAbort: () => void;
  onRemoveQueued: (index: number) => void;
  onDismissError: () => void;
}) {
  const visible = view.visible.length
    ? view.visible
    : session.players.map((player) => player.id);
  const metaById = new Map(session.players.map((player) => [player.id, player]));

  return (
    <div className="flex min-h-0 flex-1 gap-3 p-3">
      <div className="flex w-[34%] min-w-[320px] flex-col gap-2">
        <CaptainPane view={view} />
        <Composer
          view={view}
          composer={composer}
          connected={connected}
          error={error}
          onSubmit={onSubmit}
          onAbort={onAbort}
          onRemoveQueued={onRemoveQueued}
          onDismissError={onDismissError}
        />
      </div>
      <div
        data-testid="player-grid"
        className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto"
      >
        {visible.map((playerId) => (
          <PlayerPane
            key={playerId}
            view={
              view.players[playerId] ?? {
                id: playerId,
                running: false,
                segments: [],
              }
            }
            meta={metaById.get(playerId)}
          />
        ))}
      </div>
    </div>
  );
}
