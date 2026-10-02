<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Changelog

All notable changes to the Spex app — the desktop and server shells over
one core and one interface — are documented in this file. The scaffold
CLI keeps its own changelog under `packages/cli`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
App releases ship as source under `app-v*` tags; run them with `npm ci`
and `npm start` (desktop) or `npm run start:server` (server).

## [Unreleased]

### Added

- Live tool approval controls for supported agents show the conversation or
  authoring draft, actor, operation, and complete requested action. Approve once
  or Deny works while a turn is running; pending requests survive client
  reconnects but expire on cancellation, completion, or core restart. Historical
  permission records never become actionable, and native policy and external
  app-access grants remain separate
  ([DR-098](specs/decisions/098-live-tool-approvals.md)).
- Attach files by picking, pasting, or dropping them into a new conversation,
  follow-up, queued intent, or playbook authoring draft. File-only messages,
  interrupted-upload retry, intent editing and Undo preserve exact content.
  Accepted sessions own verified copies, and figures and deferred tool details
  remain readable after reopening and whole-bundle Space selection
  ([DR-097](specs/decisions/097-media-and-browser-tools-across-hosts.md)).
- Browser setup and explicit agent controls prepare an isolated headless browser
  on the execution host, with progress, cancellation and actionable failures.
  Setup proves launch and screenshot without enabling access or invoking a
  provider. Conversation overrides apply to the next turn and can return to
  Settings; authoring follows its selected agent's saved choice.
- `/inspect` provides a tool-using inspection workflow that leaves the repository
  unchanged. Native working-agent figures appear with their originating actor,
  turn and call beside the conversation; control calls remain tool-free.
  Desktop and remote server clients share the same upload and rendering path.
- The interface speaks your language ([DR-078](specs/decisions/078-the-interface-speaks-the-readers-language.md)).
  Settings offers System, English and 简体中文, one choice per Spex home
  that reaches every page of it on both shells and the desktop's own
  notifications; with no choice stored, each client follows its own
  system, reading Simplified Chinese as Chinese and everything else as
  English. Moments, clock times, numbers, sorted names, ages and
  durations all follow the chosen language. Each language is one
  gettext catalog beside the source that a human reads and edits in
  place, and a build refuses a language whose translation is
  incomplete, so no page mixes two.
- The core's own messages speak the chosen language too ([DR-079](specs/decisions/079-the-core-speaks-the-homes-language.md)):
  refusals, configuration errors, readiness requirements, storage
  diagnostics, Space guidance and unit labels, compile lines and draft
  diagnostics. Changing the language re-reads them in place, keeping an
  unsaved draft, a form under edit and the composer's text. A record
  already written keeps its language, and what a finished operation
  composed — a Space stop, a diagnostic raised at load — keeps its
  language until that operation runs again ([DR-083](specs/decisions/083-a-finished-operations-words-keep-their-language.md)).
  Text relayed from an agent, a tool or Git stays as it came. A served
  page whose browser prefers Chinese, on a host whose system does not,
  reads the core's messages in English until you choose 简体中文.
- A failure says what, why, and what now. The failed status line becomes
  a three-line card — the workflow and step that failed, the cause in a
  plain phrase with its evidence, and what to do next — from the
  structured cause Playbook attaches to a parked failure ([DR-075](specs/decisions/075-a-failure-says-what-and-what-now.md)).
  One catalogue phrases every Playbook failure code, with a Boss step
  where one exists, and a test fails when a code has no phrase. The
  Dashboard's interrupted rows and the tab tooltip use the same phrase.
- The parked-run notice draws one control per action the run advertises,
  labelled with the action's own words, and disables one the runtime says
  would do nothing, with its reason; the single Retry that sent the first
  advertised action is gone. Drop stands as before. A session whose
  controls were never captured offers Drop alone.
- Beta app releases ([DR-087](specs/decisions/087-beta-app-releases.md)).
  An `app-vX.Y.Z-beta.N` tag, with both shells' manifests at
  `X.Y.Z-beta.N`, ships the app as a GitHub pre-release once CI, the
  smoke and the live smoke pass — without the hours-long regression.
  Its notes are this file's `[Unreleased]` section as it stands at the
  tag; the changelog gains no section for a beta, so its notes fold
  into the regular release that follows.
- Tests in tiers ([DR-086](specs/decisions/086-tests-in-tiers.md)). The
  smoke installs the release from a fresh clone with `npm ci` on an
  empty npm cache and launches both shells as a user does: the server
  shell walked over its printed token URL and stopped with SIGTERM, the
  desktop rendered by `npm start`. Every app tag runs
  `npm run smoke -- --live`, whose last stage runs the live desktop
  smoke inside that fresh install on the machine's signed-in agents
  ([DR-089](specs/decisions/089-every-fresh-user-scenario-walked-for-real.md)).
  Before a regular release, a regression walks the fresh-user
  scenarios with real agents: the app's own example pasted, compiled,
  registered and run; a playbook authored in chat compiled, registered
  and run; and a project created from the palette with its specs
  scaffolded, developed through a `/decide` and a `/code` queued behind
  it, the queue handing off; in every run, a player's question is
  answered through the Captain. A compiler refusing the app's own
  example on its first compile blocks the tag. CI runs the browser
  journeys on macOS as well as Linux, the queue's handoff among them,
  and runs the example as the real `slc` compiled it once that fixture
  is captured.
- An agent's settings for one conversation ([DR-067](specs/decisions/067-tuning-for-one-conversation.md),
  [DR-068](specs/decisions/068-an-agents-settings-where-the-agent-is.md)).
  The chip in the Captain pane's header, and in each player pane's
  header, opens that agent's own model, effort and fast mode for this
  conversation only; Settings and `playbook.config.yaml` never change.
  Each field offers the configured value by name — "Provider default"
  where Settings sets none — the provider's default, or a pinned value,
  and one control returns the agent to its configured values. A choice applies from your next message — a running turn keeps
  what it started with — and outranks a role binding's pin, the editor
  naming the roles it also sets. The chip reads the new setting at once.
  The choice stays on this device and is removed with the session; the
  `playbook` CLI and other devices run the configured values.
- A player's subagent model ([DR-093](specs/decisions/093-a-players-subagent-model.md)).
  On Claude, an agent's subagents run on a model you choose, and the
  agent is told to hand them well-defined, fine-grained work while it
  keeps the deep thinking, reasoning and design itself. The field sits
  wherever the model does — the Captain's and each player's editor in
  Settings, a role's binding editor in Playbooks, and an agent's
  settings for one conversation — with the same choices: the inherited
  value, the provider's default, or a model from the runtime's list.
  It is offered where the adapter takes one, or where a choice already
  stands so it can be cleared, and applies from your next message. The
  chip still reads adapter, model and effort: its editor shows the
  subagent model, and a conversation's own choice marks the chip
  changed. The compile does not carry it.
- A subagent's effort, and the agent's own model by default ([DR-095](specs/decisions/095-a-subagents-effort-and-the-agents-own-model.md)).
  The subagent-model field now offers "Same as agent" first — the
  configured omission, every subagent on the agent's own model — then
  the runtime's models, in place of the provider's default; a configured
  `false` reads "Off" while it stands, so it can always be cleared.
  Beside it, a fifth tuning field, the subagent effort, offers "Agent
  chooses" first — each delegated task's effort left to the agent —
  then the adapter's efforts without `ultracode`. Pinned or chosen, it
  governs the delegate subagents Cligent registers and the
  `general-purpose` subagent it replaces — at the pinned effort, or at
  `medium` where the agent chooses and names no subagent type — so
  those no longer inherit an agent's `ultracode`; Claude's built-in
  `Explore` and `Plan` subagents keep the agent's own effort. It has
  the same three homes and tiers as the subagent model. In the
  Captain's and each player's editor, a role's binding editor and an
  agent's settings for one conversation, the model and its effort now
  share a row, and the subagent model and its effort the next; the
  pairs stack at the 320-pixel floor. The chip is unchanged.
  Delegation is now the default, in Spex's sessions and draft
  conversations as in the `playbook` CLI: every Claude agent whose
  subagent model is unset runs its subagents on its own model and is
  told to delegate, so existing configurations change behavior. "Off"
  (`subagentModel: false`) is the way back, and a subagent effort set
  beside an Off — in the agent's block, a role's binding or one
  conversation's settings — is refused rather than switching delegation
  back on.
- Each agent's pane header reads its completed active time this session,
  as `active · 3m 12s` ([DR-070](specs/decisions/070-agent-active-time.md),
  [DR-071](specs/decisions/071-active-time-follows-held-calls.md)): the
  sum of that agent's finished calls from prompt to finish, whatever
  their outcome, a call whose clock stepped backward counting zero
  ([DR-072](specs/decisions/072-backward-call-time-is-zero.md)).
  Parallel calls each count in full, so the figures can add up to more
  than the session's wall-clock time, and no total is shown. A figure
  appears once a call finishes, reads the same after a restart, and is
  the first header detail to yield in a narrow pane. The player header's
  token count is gone; each call's usage stays on its result line.
- Space repairs a project in place ([DR-063](specs/decisions/063-space-setup-and-repair.md),
  [DR-065](specs/decisions/065-repairs-the-reader-answers.md)). Where
  synced sessions ran in a folder that is not a project on this device,
  the issues list holds one repair per project, named by the project and
  resolving all its sessions, rather than a row per diagnostic. The app
  checks the folders the repair names, and the same name in the folder
  holding most of your projects, and proposes one only when exactly one
  is an unclaimed Git repository; it never searches the disk. **Add
  project** takes it and keeps the synced project's identity, so its
  sessions, queue and history attach; **Choose folder…** names another;
  **Don't add** records, on this device alone, that the project does not
  belong here — the row stays, with its controls, and stops counting.
  Adding keeps you on Space. Before, the only remedy was the project
  palette, which registered a duplicate project and synced it to every
  other device.
- Each project's group on the Dashboard folds to its header from its
  Collapse control and stays folded across launches. A folded group
  keeps its most severe attention mark; the project's Overview always
  shows every band.

### Changed

- The app requires Playbook 17.4, slc 0.15.1 and Cligent 0.33.1 ([DR-088](specs/decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md),
  [DR-092](specs/decisions/092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md),
  [DR-093](specs/decisions/093-a-players-subagent-model.md),
  [DR-094](specs/decisions/094-the-compiler-adopts-the-apps-cligent.md),
  [DR-095](specs/decisions/095-a-subagents-effort-and-the-agents-own-model.md),
  [DR-097](specs/decisions/097-media-and-browser-tools-across-hosts.md),
  [DR-098](specs/decisions/098-live-tool-approvals.md)),
  and locks the agent SDKs at the releases Cligent 0.33.1 tests: Claude
  Agent SDK 0.3.284, Codex SDK 0.159.0 and OpenCode SDK 1.18.33. The
  compiler runs on the app's own Playbook and Cligent, which slc 0.15.1
  declares. Cligent refuses an agent runtime older than the
  oldest release that serves its provider's latest models, so an older
  runtime on your `PATH`, such as an OpenCode CLI before 1.18.29, reads
  not ready with the command that upgrades it.
  **Upgrade every host that shares your Spex home together, and snapshot
  the home first** ([DR-050](specs/decisions/050-shared-storage-cutover.md)):
  once this build saves a session, an older host — a `playbook` CLI
  sharing the home, or another device syncing it through Space — may
  not open it. Playbook 16 or older opens none of this build's
  sessions. Playbook 17.1 or earlier cannot open a session whose record
  carries a subagent model, as every Claude agent's now does by
  default, and Playbook 17.2 or earlier cannot open one whose record
  carries a subagent effort. Stop older writers and update every host to
  compatible Playbook 17.4-based releases before saving attachment-bearing
  history; older writers do not preserve the new asset-bearing records.
- A session parked on a question inside a built-in state that Playbook 16
  renamed — `/code` waiting in its former `runFirstPhase`, for example —
  no longer resumes from your answer. Drop it, or send a new request.
- Interrupted work offers **Restore** where it offered Retry. Restore
  brings back the saved position and reports what was recorded; nothing
  is repeated and the saved message is not run again. You then continue
  with the run's own controls or a new message. Your message reads once,
  and the call that was interrupted no longer shows as working. A turn
  stopped after its work was saved — an abort included — now settles
  there and simply continues, the run it left waiting showing its
  controls; an abort during the Captain's own call leaves Up next
  stopped, with Start.
- A Restore's report finishes nothing: it raises no Finished entry and
  starts no queued work, and an interrupted intent returns to Up next,
  stopped, with its history kept. A run it brings back failed asks for
  you on the Dashboard and says why on its card and notice; a run you had
  stopped yourself stays your stop. A Restore the app was closed in the
  middle of is completed the next time the app reads the session.
- **Discard** appears only when nothing was recorded: no step, no
  abandonment, and unchanged repository evidence. Otherwise Restore
  stands alone.
- The compile row shows slc's new **Prefix** phase between Optimize and
  Machine.
- The app's example settles the two limits slc 0.12 asked about.
  Adapted from slc's demo, it counts the first agent's judgments per
  loop, its last one in a loop being the conclusion, and ends after the
  2nd loop's commit without another review.
- A player's question reaches you only as the Captain's explanation of
  it, which completes [DR-085](specs/decisions/085-boss-talks-through-captain.md).
- While a turn runs, the composer's field and Send are disabled, your
  draft kept and Abort beside them, the placeholder reading "Captain is
  working…"; a message no longer queues behind the turn as **Send
  next** ([DR-085](specs/decisions/085-boss-talks-through-captain.md)).
  Between turns you may answer a waiting question or ask the Captain
  about it: a message no longer counts as the answer, and the question
  stands until the run reports it gone. Messages an earlier build
  queued still show and send when a turn settles, but never answer a
  waiting question.
- The playbook-authoring agent is taught that each outcome has one
  repository effect: an outcome that may commit or leave the repository
  unchanged is two outcomes, as slc's link requires.
- The shared launcher configuration now lives at
  `config/playbook.config.yaml` under your Spex home, the home's
  directory of hand-written configuration ([DR-080](specs/decisions/080-the-config-directory-is-named-config.md)).
  A config still at the former `playbook/` location, or at the older
  XDG path, moves there once when the core starts: the file keeps its
  name, its permissions and the target of every relative locator
  reaching outside its directory, and the emptied `playbook/` directory
  inside the home goes with it. The Playbook CLI shares the same file
  again from Playbook 15; an older CLI seeds a file of its own at the
  former location.
- The app requires Node.js 22.19 or later, the floor of the catalog
  tooling ([DR-078](specs/decisions/078-the-interface-speaks-the-readers-language.md));
  CI drops Node 20, which reached end of life in April 2026.
- With Playbook 14.1 ([DR-076](specs/decisions/076-playbook-14-1-adoption.md)),
  uncommitted work already in your tree is now the Coder's context rather
  than an ambiguity: a governed call may carry it in its one commit, the
  Coder is told which changes predate its task and to leave them alone
  otherwise, and a settled commit that absorbed or altered any of them
  says so in the Boss's reply. Every parked failure carries a structured
  cause and every advertised action its standing, so the failure card and
  the per-action controls now read the runtime's own words rather than a
  list mirrored by hand. Dropping a run over unresolved repository
  effects records a durable abandonment and reports a failed stop
  truthfully.
- A parked run survives ([DR-074](specs/decisions/074-a-parked-run-survives.md)):
  a settled session releases its runtime even when unresolved repository
  effects stand, so its project is no longer refused as still working; its
  controls are captured at settlement and kept locally, so they stand after
  a restart; and a session whose run was ended over unresolved effects is
  continuable, as Playbook's own validation says. The core's own refusal
  "reconcile unresolved effects before continuation" is gone.
- Playbook compilation runs the compiler Spex ships ([DR-081](specs/decisions/081-the-app-supplies-the-compiler.md)):
  both shells declare `@sublang/slc`, so its agent SDKs are the app's
  own, and the desktop compiles on its bundled Electron Node — no
  global `slc`, no `npx`, no system Node; the server shell still needs
  Node 23.6 or later to compile. A compiler whose playbook engine the
  app cannot run is refused with both engines named. The compile's
  agent follows the draft's, or the Captain's, block — adapter, model,
  effort and fast mode, what the block leaves unset running at the
  adapter's default rather than an slc configuration file's ([DR-084](specs/decisions/084-the-block-is-the-whole-compiler-agent.md))
  — unless the environment sets any `SLC_*` variable, in which case it
  configures slc itself; an agent on an adapter the compiler cannot
  drive is refused before it runs, and the compile log names the agent
  and where it came from.
- `npm run smoke` no longer re-runs the unit, integration and journey
  suites — CI's run on the tagged commit is that evidence — and never
  flips the developer tree's native module: its stages are the build,
  the spec lint, the fresh install and the CLI user pass, and the
  desktop renders inside the fresh clone, so `--desktop` is gone
  ([DR-086](specs/decisions/086-tests-in-tiers.md)).
- `npm run e2e:live` is now `npm run regression`.
- `npm run smoke` refuses a working tree with uncommitted changes —
  the release records under `docs/releases/` aside — unless
  `--allow-dirty` is given, since its build, lint and CLI pass read the
  working tree while the fresh install clones the last commit; the
  fresh install launches the server shell as the README does, with only
  `SPEX_HOME` set and an ephemeral port.
- The project palette's Add and Create say what each does in their
  tooltips: "Register this existing repository" and "Create a new
  repository at this path".
- The Up next row's Start collapses to an icon in a narrow pane, so the
  row keeps its words on one line.
- The project Overview names the GitHub state in its header only while
  the Sources band is folded; an open band says it itself.
- With no prose paragraph in a draft's source, the Register tab's
  intent defaults to the source's title, so the app's own example
  registers on its defaults.
- Long inline explanations read as key phrases, the detail moving into
  the control's tooltip ([DR-069](specs/decisions/069-key-phrases-not-sentences.md)):
  the Specs tab's legacy-layout notice, the Space's setup,
  unrelated-history and first-meeting cards, the terminal pane theme
  and the config path in Settings, the agent editors' scope ("This
  conversation only"), and the session start, which drops its tip.
- Space sets up by naming its remote ([DR-063](specs/decisions/063-space-setup-and-repair.md)).
  **Set up space** takes a required remote URL, makes the home a
  repository, sets the remote and runs the first sync: an empty remote
  is filled from this device, and a space already there is joined, any
  differences asked. Initialize and the separate Join a space are gone,
  and the app no longer makes a repository without a remote, which could
  commit only once. Until a newly set remote has been checked, the Sync
  tab offers Join by name, so joining another machine's space no longer
  waits for an "Unrelated history" failure. A home that is already a
  repository gets a remote added, never a second setup.
- A Space sync that the host answers with "not found" no longer claims
  the repository is absent ([DR-064](specs/decisions/064-honest-remote-failure.md)):
  GitHub answers the same for a private repository this machine cannot
  see. The stop reads "No repository this machine can see at ⟨URL⟩",
  offers Retry, and names the remedies — check the URL, create the
  repository, or give this machine access, in the remote's own terms:
  `gh auth status` and `gh auth login` in a terminal for GitHub over
  HTTPS, the SSH key an account must carry, a local folder you can read.
  A host refusing with 401 or 403 reads as refused access rather than
  as Git's own words.
- Every Dashboard summons names what ends it and offers a way to end it
  that works whatever the session's runtime is doing ([DR-066](specs/decisions/066-every-summons-has-a-door.md)).
  An unread turn's row carries **Reviewed**, and an interrupted intent's
  row **Drop**, behind a "Drop this work?" confirm; a question or
  failure row names the reply, retry or drop that ends it, and opening
  it lands on that control or the composer. A failure that parked no
  run says "The last turn failed. Send a message to pick it up." above
  the composer. The tab, the sidebar row, the project's mark, the
  palette and the badge name each kind in the same words, the most
  severe first.
- Historical player permission records remain non-actionable and raise no
  Dashboard summons ([DR-066](specs/decisions/066-every-summons-has-a-door.md)).
  Actual pending native tool requests have their own live approval inbox
  ([DR-098](specs/decisions/098-live-tool-approvals.md)).
- Dropping interrupted work ends the run it left waiting ([DR-073](specs/decisions/073-letting-go-ends-the-parked-run.md)).
  Drop on an intent whose run stands parked — on a failure or on a
  question — ends that run first, spending no model call, and records
  the verdict once it has; before, the verdict stood alone and your next
  message reached the waiting player as its answer. A Drop that cannot
  end the run — another device holds the session, a turn is running —
  says why where you took it, and the intent stays open. The parked-run
  notice now also stands for a run waiting on your reply, with Drop
  beside the composer.
- Up next is one committed queue ([DR-077](specs/decisions/077-up-next-is-a-committed-queue.md)).
  Every row reads **Queued**; the first row not waiting on another
  intent is next and says what it waits for — `after current work`,
  `waiting — your reply`, `waiting — current work failed`,
  `waiting — previous work failed` with its cause, or
  `waiting — previous work stopped` — and carries Start only where going
  on is yours to decide. A turn that settles cleanly hands the next
  intent to the same conversation: an ordinary Captain reply and your
  answer to a question now qualify, where before only a playbook's
  typed success did. A failure, an abort, a run's ending, or a run still
  waiting on you holds the queue. Delivery cards, the Captain home and
  the all-clear name the same next with the same Start.
- An empty playbook draft offers two acts where it offered three phrase
  chips ([DR-082](specs/decisions/082-the-first-move-in-a-draft-is-an-act.md)).
  **Use a SKILL.md…** picks a file where the app offers a file picker
  and makes it the draft's source — or, when the draft already has one,
  places it in the Source tab's paste mode for **Use as source** to
  confirm — and otherwise opens that paste mode; the composer then holds
  the ask to adapt it, one Enter from sending. **Try the example**
  places the app's six-line example in the composer. Neither sends
  anything, and the authoring agent now knows that a placed source may
  be a SKILL.md to rewrite into a playbook.
- The app reopens on the surface you left — after a restart, or a
  reload of the page — rather than on Projects.
- When a surface fails to render, the error screen offers **Try
  again**, which keeps you where you were, beside **Reload the page**;
  a reload was the only way on before.
- The player grid fades at an edge while a pane lies beyond it, so a
  lane scrolled out of view reads as more to scroll to rather than as a
  pane cut off mid-glyph.
- The Up next add field wraps and grows with its text, up to eight lines
  before it scrolls; Shift+Enter adds a line and Enter queues the whole.
- Sign-in guidance names the act: an agent not yet signed in reads "sign
  in by running claude in a terminal, or set ANTHROPIC_API_KEY" (`codex`
  alike), and an expired sign-in says to sign in again with that agent's
  CLI, in a terminal.
- Models are named as the runtime names them ([DR-091](specs/decisions/091-models-named-by-the-runtime.md)).
  The model field is a list whose rows read each model's name with the
  specific model behind it — Claude's `opus` reads "Opus ·
  claude-opus-5-5" rather than "Opus · opus" — and, where the runtime
  gives them, its own description and the model it runs when none is
  set. The editor gives the field its full width, and an inherited
  model — the provider's default included — is named the same way. In
  a conversation, an agent's chip reads the model its runtime reported
  for its latest call while the adapter and model setting that call
  began under still stand, what is set kept in its tooltip; a change of
  either shows at once, as before.
  Cligent 0.28 supplies the descriptions, the default model and the
  reported models, wherever the runtime reports them.
- A new Spex home's starter configuration, a new player lane and a new
  role assignment start on `claude-opus-5-5`, the latest Claude model,
  where they started on `claude-opus-5`.
- Protocol version 21 (from 11), in full in `packages/core/src/protocol.ts`:
  `session.restore` replaces `session.retry`; `session.agent.set`,
  `language.get`, `language.set` and `space.repair.decline` join, with
  the `language.state` message; `session.control` may name the action
  it runs by `actionId`; a session gains `parked`, `agentActiveMs`,
  `agentReportedModels` and `agentSettings`, and its `recovery` gains
  `discardable`; an agent block, a role binding and a session's agent
  settings take a `subagentModel` and a `subagentEffort`, an agent
  block's `subagentModel` admitting `false`, and `agent.options` and
  readiness report `subagentModelSupported`, `agent.options` its
  `subagentEffortValues` too; each model `agent.options` lists may
  carry its `description`, and an available catalog its `defaultModel`; an open
  intent gains its queue standing, `next`, and loses the `permission`
  reason; durable ledger attention entries are questions, failures, finishes and
  reviews only, a failure carrying `parked` and its `cause`; a draft's
  failed compile names its `relay`; a storage diagnostic may carry a
  structured repair, and the Space state its `issues` count, its
  Settings unit named `config/playbook.config.yaml`; and an error reply
  may carry `details`. Structured attachments accompany conversation,
  intent and authoring submissions; `media.begin`, `media.chunk`,
  `media.finish`, `media.cancel` and `media.read` transfer their bytes.
  Agent settings admit `browser`; `agent.capabilities`, `browser.prepare`
  and `browser.cancel` expose host readiness with `browser.progress`.
  `approval.list` and `approval.respond` operate on live requests from
  `approval.state`, independently of durable ledger attention.

### Fixed

- Creating a project now scaffolds specs in the creating page's language,
  including a Chinese browser connected to an English host ([DR-097](specs/decisions/097-new-project-specs-follow-the-readers-language.md)).
- Project creation requires a successful initial Git commit, including an
  empty baseline without scaffolding. Staging or commit failures retain
  files and report the refusal. Existing repositories are preserved and
  directed to Add ([DR-099](specs/decisions/099-project-creation-preserves-existing-repositories.md)).
- The Chinese catalogs' terms, after a native-speaker audit: setting a
  space up reads 初始化 on every surface and in the core's refusals,
  keeping 设置 for Settings; a model's provider reads 服务商 everywhere;
  the library reads 规程库; a playbook's source reads 源文; the roles
  a player answers read Player; and some thirty other phrases in the
  interface, the core and the desktop notifications read as a native
  speaker would say them.
- `npm start` on a Mac whose PATH leads with a GNU `libtool` (Homebrew's
  `libtool` formula): the native rebuild of `better-sqlite3` now links
  with the Apple `libtool` that `xcrun` names instead of failing on
  `-static`.
- Compiling on a machine without the agent SDKs beside a global or `npx`
  `slc` failed at the first agent call with a missing-package error;
  the shipped compiler resolves the app's SDKs.
- A running core no longer leaves a temporary directory behind, or grows
  its memory, each time it shows a playbook's machine or opens a session.
- An authored playbook's compile failed at the machine phase: no
  `xstate` resolved from the library directory, so the compiler's type
  check refused the generated machine. The playbook engine is now
  linked into that directory before the compiler runs.
- The Register tab could offer a new player whose id the roster already
  held, and registering overwrote that player; it now selects the
  existing lane as it stands and mints only a free id.
- An agent's registration proposal spelled a role in another case than
  the compiled one ("Coder" for `coder`) and never applied; proposals
  now match roles case-insensitively.
- A roster player bound to no role was missing from Settings and from a
  draft's agent picker.
- The Specs tab's empty state told you to run `npx @sublang/spex`, which
  only prints usage; it now offers `npx @sublang/spex scaffold`.
- A turn that finished where this app was not watching — on another
  device, synced through Space, or in the `playbook` CLI — asked for
  review on the Dashboard forever, since opening the session never
  marked it viewed. A conversation on screen now marks its finished
  turns viewed, on every device sharing the home ([DR-066](specs/decisions/066-every-summons-has-a-door.md)).
- A failed session serving no intent stopped asking for you at your next
  message even while its run stayed parked in its failure state; like an
  intent's failure, it now asks until the run leaves that state.
- A delivery card in a conversation this device cannot continue disabled
  Confirm and Drop although the Dashboard took the same verdict; the
  card now takes it.
- A mouse wheel over the Dashboard's side margins now scrolls it; only
  the centered column did.
- Filtering the Dashboard to a project with nothing waiting showed the
  all-clear while another project still needed you; it now reads
  "Nothing in ⟨project⟩ needs attention."
- Removing the project the Dashboard was filtered to left the Dashboard
  blank; the filter falls back to All projects.
- An agent whose SDK's native binary npm dropped — an optional platform
  package such as `@anthropic-ai/claude-agent-sdk-darwin-arm64` — read
  ready and failed at its first run. Readiness now reads it not ready,
  naming the package and the repair: `npm ci` in the checkout, or
  reinstall the app. Requires Cligent 0.27.1 or later.
- A player's fast mode never reached the roles bound to it: a role that
  set none of its own ran at the provider's default, while the
  `playbook` CLI ran it at the player's. Such a role now takes its
  player's fast mode, as the CLI does ([DR-032](specs/decisions/032-session-players.md),
  core-service-16).
- An item's Edit put the caret on the item's heading but scrolled the
  editor by logical lines, so in a file whose long lines wrap the
  heading landed below the visible box — `run-view.md` opened on
  run-view-147 for run-view-4. The landing now measures the heading's
  rendered position, wraps counted (spec-view-48).
- A project's Sources summary read "just now" whenever a client first
  saw the lists, however old the core's cache was, and a group kept on
  screen never asked again — a freshly connected page showed a
  35-minute-old issue list as current. The lists now carry their fetch
  moment, the summary shows that age, and a group on screen asks again
  once the lists pass the ten-minute window (dashboard-14,
  dashboard-20).
- A surface shortcut — ⌘1, ⌘3, ⌘4, ⌘5 or ⌘, (Ctrl on other hosts) —
  left keyboard focus on the page body, and so did ⌘B. Focus now lands
  inside the surface the shortcut opened, on its composer where it has
  one, and ⌘B lands on the sidebar's own collapse control, so the next
  Tab continues from where the reader went. An open project palette keeps
  focus until it closes, then lands it in the chosen surface
  (run-view-42, run-view-50, run-view-71).
- At a phone's width the Settings keyboard-shortcut sheet scrolled
  sideways with no keyboard stop, which axe reports as serious. The
  sheet is now a named stop, "Keyboard shortcuts", so the keyboard
  reaches what a pointer scrolls (run-view-50).
- A project created from the palette told its coding agents to run
  `spex lint`, a command the desktop install puts on no PATH, so a
  coder's lint check failed with "command not found". The scaffolded
  instruction now runs the linter through `npx @sublang/spex lint`.
- A project created from the palette pinned no copyright holder of its
  own: every scaffolded file carried SubLang's upstream SPDX line, so
  an agent adding the project's first spec copied it. The scaffold now
  writes `licensing-9` into the project's `specs/packages/licensing.md`
  with the project's own header — the creator's `git config user.name`
  and email as the holder, the current year, and `Apache-2.0` for the
  LICENSE it emits — while the template files keep their upstream
  lines. With no git identity it leaves a `<holder>` placeholder and
  says so, never SubLang's name (projects-3, scaffold-58). The palette
  runs the app's own CLI, so a project created from it carries the
  holder at once.
- A machine that once ran the SQLite-era app imported its former store
  into every new Spex home — a second home, the smoke's scratch home, a
  reinstall into a fresh one — since the import's only record was the
  home's own. A store a home has imported is now marked beside itself
  (`spex.db.imported`, `server.db.imported`), no later home reads a
  marked store, and a home that took the store before this fix marks it
  at its next start (core-service-64).
- A project registered from a fresh clone listed every finished intent
  record in History as "just now", in no order: the records' status
  lines carry no date, and a clone sets every file's last change to one
  moment. An undated record now dates by the last commit touching its
  file, and by the file's last change only where Git tracks none
  (dashboard-27, spec-view-14).
- Space's Join card never came back on a home that had synced once:
  changing the remote cleared the last check, but the card was gated on
  the last sync, so joining another occupied space meant syncing into
  "Unrelated history" first. The card now stands when the home has neither
  checked nor synced with that remote; changing the remote clears both,
  while restarting after a successful sync does not show it again
  (space-45).
- Space's Explore tab read an empty `sessions/` or `intents/` as "Stays
  here", the mark reserved for the families that never sync; a tracked
  kind with nothing committed yet now reads "Not yet shared" (space-23).
- Creating a project from the palette scaffolds with the app's own
  CLI — the checkout's `packages/cli` on the app's own Node — instead
  of fetching `@sublang/spex` from the npm registry through `npx`, so
  Create works offline, pays no download and generates exactly what the
  app ships ([DR-096](specs/decisions/096-the-app-supplies-the-scaffold.md)).
  Only a checkout without a built CLI still runs the registry's, and a
  failed scaffold names the command that ran.

### Security

- A remote URL carrying a bare token before the host, such as
  `https://<token>@github.com/…`, was accepted, written to the home's
  Git configuration and printed in Space's failure reports. Anything
  before the host of an `http(s)` remote is now refused, and a printed
  remote drops an `http(s)` user ([DR-064](specs/decisions/064-honest-remote-failure.md)).

## [0.8.0] - 2026-09-14

### Added

- A control for a failed workflow: while a playbook run stands parked in
  its recoverable failure state, the session shows a notice between the
  Captain pane and the composer naming the workflow by its command, with
  two controls that say in words what each does. Retry runs the recovery
  the run itself advertises. Drop ends the run — it asks to confirm in
  place, and it spends no model call, so the way out still works when a
  failing provider is what broke the run. A dropped run is not
  resumable; run the command again to take the work back.
- Where the dropped session serves an open intent, Drop takes the
  ledger's Drop verdict in the same gesture — one ruling, not two.

### Changed

- Retry selects the run's own advertised recovery through the runtime
  instead of sending fixed prose as a Boss turn, and where a run
  advertises no recovery Retry is absent rather than offered and
  refused.
- A failure that parked a run keeps asking for attention — on the
  Dashboard, in the sidebar and on the tab — until that run leaves its
  failure state. A later unrelated message no longer stands the summons
  down while the run is still stuck. A failure that parked no run keeps
  the rule it had: moving on acknowledges it.
- The app requires Playbook 13.3 or later.

### Fixed

- A machine drawing wide enough to scroll sideways can be scrolled from
  the keyboard.

## [0.7.0] - 2026-09-12

### Added

- Issue delivery through `/dev`: the Dashboard's issue seed is
  `/dev Address #N: <title>` with the issue's URL and no delivery prose,
  and Playbook 13.2's `dev` composes the `branch` and `pr` built-ins to
  carry the work to a merged pull request with the default branch checked
  out again — nothing is merged by hand.
- The `branch` and `pr` built-ins join the playbook catalog, seeded with
  their `coder` role bound to `dev.coder`.
- While `dev` is configured without `branch` or `pr`, its Library card
  names the built-ins to enable for pull-request delivery; a plain `/dev`
  keeps working.
- The Space surface: the Spex home at a glance, Initialize and Join a
  space, the remote, local and incoming changes by unit in human words,
  a core-driven sync on one shared branch with a per-unit conflict
  picker, a "Stays on this device" panel, and a read-only annotated
  explorer with previews.
- The desktop bridge reveals a state-root path in the OS file manager;
  the served page offers Copy path instead.
- Chat-assisted playbook authoring: "New playbook" takes an id and opens a
  two-pane draft workspace on the Playbooks surface — a conversation with
  an authoring agent on the left, and Source, Gears, Machine, and Register
  tabs with the compile watched in a band on the right. The agent writes
  `<id>.md` in the draft directory on the Captain's block or a chosen
  roster player, asks for compiles and proposes the registration through
  fenced `spex` blocks, and receives a failed phase's output
  automatically, bounded to three failures in a row. Registration writes
  nothing until Register is pressed; drafts persist under `local/drafts/`
  and list between the configured playbooks and the built-ins.
- Protocol version 11: the `space.*` and `draft.*` command families, the
  `draft` channel, and the `space.state`, `draft.record`, `draft.state`,
  `draft.source`, and `draft.removed` messages.

### Changed

- Spex requires `@sublang/playbook` 13.2 or later.
- The sidebar's "Workspace" entry and section read "Projects".
- Cmd/Ctrl+1 through 5 switch surfaces: Dashboard, Projects, Playbooks,
  Space, Settings.
- The compile form is retired: pasting or picking a source is the Source
  tab's paste mode, the registry form is the Register tab with a player per
  derived role, and the slc example's prefill opens a draft in paste mode.

## [0.6.1] - 2026-09-09

### Fixed

- Require supported Playbook trace evidence before advancing the intent queue.
- Keep Running and interrupted attention consistent for sessions whose
  transcripts have not loaded or are stale. A new Boss turn clears the
  previous question even when it starts another intent.
- Keep the Now band's state label and activity mark current before its
  session transcript loads or catches up.

## [0.6.0] - 2026-09-09

### Added

- Runtime model selection in Settings and role bindings, with model-specific
  effort and fast-mode options, canonical IDs recognized through aliases,
  explicit custom pins, and refresh. Adapter efforts supplement model lists
  only where Cligent's discovery interface cannot report them.
- Every message in the Captain thread — yours, the Captain's, and a
  player's question — carries its clock time at the bubble's outer
  foot, quiet and tabular, with the exact date and time on hover; the
  thread's time separators speak the same clock.

### Changed

- Successful playbook completion starts the next unblocked intent in the
  project's queue while keeping the finished intent's Confirm reminder.
  Questions, failures, and replies without explicit completion pause the
  queue; explicit after-links still wait for a human verdict.
- New issue intents request work on a new branch, relevant checks, and a PR
  whose description closes the issue when the Boss merges it.
- Require Cligent 0.26 and Playbook 13.1 from the public registry.
  Clarification replies identify the player as the questioner, avoid
  repeating its question on resume, and retain task context for a fresh
  provider session.
- Refresh the app's SDK runtimes to Claude Code 2.1.263 and Codex 0.153.4.
- **Nothing ends.** The runtime is held only for a turn: a session's
  agents and its Playbook lease are released when a turn settles and
  taken up again by the next message, so there is no End control, no
  "ended" state, and the terminal can continue any Spex conversation
  between turns. A session reads working, waiting on you, idle, or
  history the core cannot continue; the sidebar orders sessions by
  last activity; the Now band and Start on an intent follow the
  project's current conversation.
- **Settings apply on the next message.** Every message opens the
  runtime on the settings the file holds, projected onto the session's
  own playbooks and players — enabling another playbook no longer
  invalidates a conversation. Model, effort, and fast-mode changes apply
  on the next call; a structural change (adapter, permissions, roster,
  bindings) is refused naming the fields that changed and offering a new
  session.
- A message to a project whose other session is mid-turn is refused
  naming that session; delete, rebind, and remove wait only on a turn in
  flight.
- Settings presents the Captain as a row of the players' shape: its
  chip opens the shared agent editor with Save and Cancel, one row's
  editor open at a time.

### Fixed

- Prevent a checkpoint error when a message arrives during turn cleanup.
- Keep agent and binding popovers inside the window as their options load
  or change.
- Preserve role tuning and comments when editing bindings, including an
  explicit fast-mode Off override.
- A player's failure shows once per call: an adapter that says the
  same failure as prose, as repeated error events, and again in its
  result now yields one failure line with a count, and a result line
  that reads "failed" with the words in its tooltip.
- Removing an Up next intent with the pointer no longer leaves the Undo
  line standing until the next click: only a keyboard removal hands
  focus to Undo, so the line lapses on schedule.

## [0.5.0] - 2026-09-06

### Added

- Desktop and Playbook 13 CLI share session history, continuation,
  recovery and deletion through one storage format. History preserves
  Captain and player records, saved settings and recorded graphs.
- Interrupted sessions offer **Retry** for the saved input and **Discard**
  to restore the preceding checkpoint when effect evidence allows it.
  Drafts and queued messages remain available while recovery is pending.
- A Git workflow selects complete sessions or individual app files from
  either branch, validates the result, and restores existing project IDs
  with local path bindings. See the [storage catalog](https://github.com/sublang-ai/spex/blob/app-v0.5.0/docs/storage.md)
  and [Git commands](https://github.com/sublang-ai/spex/blob/app-v0.5.0/docs/storage-git.md).

### Changed

- Desktop, server and CLI default to `~/.spex`; `SPEX_HOME` and explicit
  config/session paths remain supported. Migration replaces desktop
  sidecars and imports the former default CLI store, removing validated
  source files after retaining their originals in local migration receipts.
  Stop old writers and snapshot both `~/.spex` and the former
  `$XDG_STATE_HOME/playbook` or `~/.local/state/playbook` before upgrading.
  Do not reopen converted data with older versions; unsupported legacy
  checkpoints remain readable history.
- Provider hints stay local; managed Library paths use relative locations
  and retain sources for rebuilding on another device.
- The core requires Playbook 13 and Cligent 0.25. Definite provider session
  rejection permits one fresh attempt; ambiguous failures retain recovery
  evidence instead of retrying automatically.
- Git synchronization requires an explicit whole-session choice when both
  branches changed it. Run a session on one device at a time. Schema 7 does not
  relocate repository or module paths: different paths permit history only.
- Failed runtime cleanup keeps the session's lease and project reservation
  until cleanup or owner shutdown is proven.
- Desktop and server hosts require macOS or Linux with private POSIX
  storage. Windows supports the scaffold CLI and browser client.
- Player usage displays tokens only. Provider-reported costs remain in
  stored records, without monetary figures in the interface.

### Fixed

- CLI history refresh stays responsive during continuous writes. Replaced
  history reloads without duplicate folds or stale viewed markers; queued
  sends wait for durable settlement and survive refused submissions.
- Desktop waits for active CLI writers before offering session recovery
  or management, and refreshes when their leases are released.
- The spec graph fills its pane and remains readable at short heights
  instead of collapsing packages onto one point.

## [0.4.0] - 2026-09-02

### Added

- **Player lanes fold.** Each pane's header carries a collapse control;
  a folded lane stands as a narrow rail with its name, running mark,
  and an expand control, the remaining panes take the freed width,
  and a folded lane unfolds itself when its call opens.
- **History in a frame.** The Dashboard's History band lists every
  loaded row inside a frame eight rows tall that scrolls, with
  "Older…" at its end fetching the next page, so the groups below
  never move.
- **Frames the reader can resize.** The History frame and the
  Playbooks stage box take the house divider idiom turned horizontal:
  a bottom grip drags the height within bounds, arrow keys step it,
  double-click restores the default, and the height is remembered per
  frame; the grip hides while the content fits.
- **The pipeline as a row.** Every Playbooks card shows
  "Source → Gears → State machine" in place of the Pipeline button;
  each stage toggles its artifact beneath, one at a time, with absent
  stages struck through and the state list under the State machine.
- **Sources open by default**, their three tabs in view; the fold is
  remembered per project while the app runs.
- **A done intent can be removed from History.** The row's remove
  control opens the inline confirm; confirming appends a remove act
  to the intent log, and the intent leaves every band without a
  trace, on this and any synced copy.
- **Gears as spec items.** The Playbooks Gears stage renders the
  compiled GEARS file with the Specs outline's own item rows —
  chip, group, first line, expandable body, in-artifact citation
  jumps — and the State machine stage keeps its state list pinned
  above the scrolling code.
- **Citations preview at hand.** Every citation in the Specs view —
  an entry in an item's cites row, a backlink, and a citation inline
  in a body — shows the cited item's chip, first line, and opening
  in a card after a short hover intent and at once on keyboard focus,
  replacing the browser's slow tooltip; the Playbooks Gears rows
  preview the same way. An item's citations sit in one block and its
  Edit control moved to the header row.
- **Running sessions listed again.** A Running band below Needs
  attention lists every live session with a turn in flight that
  needs nothing from the Boss — project, title, what it is doing —
  and reads "Nothing running." while empty; the attention queue stays
  the summons.

### Changed

- **The page never scrolls.** Every surface scrolls inside its own
  box, vertically as well as sideways, every scroll box is a
  positioned box so screen-reader-only text and popovers stay inside
  it, and the fit journey measures both at 400 and 800 pixels tall on
  every surface with a resize pass.

### Fixed

- **Back returns to where a record was opened.** A record opened from
  the Dashboard or a project's Overview reads behind
  "← Back to Dashboard" / "← Back to Overview", and Back lands on the
  row that opened it; a record picked in the Specs tree keeps its
  plain Back.
- **The working lane comes into view** when its call opens beyond the
  grid's edge, side by side or stacked.
- **A parked question stands** until the parked run itself leaves its
  park or is dismissed; the controller Captain's own state reports no
  longer clear it from the composer or the Dashboard.
- **The Sources tab row wraps** before it widens the band on narrow
  panes.
- **The sidebar's selection follows the surface**: on the Dashboard,
  Playbooks, or Settings no project row reads as selected; the lit
  entry alone says where you are, and Workspace restores the
  remembered project.
- **Queued Boss messages stay in their box.** The queue is a bounded
  frame that scrolls, so the transcript and the composer's field and
  actions keep their place at any queue length, and an unbroken URL
  in a queued message wraps instead of widening it.
- **The Captain agent popover opens where it fits**, below its anchor
  when there is no room above, with its own scroll in a short window.
- **The composer and the transcript follow their own pane**: the field
  refits when the pane resizes without a window resize, a transcript
  following its end keeps following after a resize, a machine drawing
  scrolled to its end regains its fade when the pane narrows, and the
  split divider lands under the pointer.
- **Anchored editors stay inside their box.** The agent editor and the
  role-binding popover are placed by one measured rule that keeps
  them within the pane at every width from the 320px floor and lets
  them scroll their own content.
- **Rows and chips yield before they widen**: a labelled issue or
  pull-request row folds its tags on a narrow pane, a long spec item
  id truncates in the outline, the outline keeps a readable height
  beside the graph, the graph's hover card stays inside its pane, and
  the project palette fits a short window with its message reachable.

## [0.3.0] - 2026-09-02

### Added

- **Records legible from a projector.** The type scale bottoms out at
  12px: every chip, age, caption, and badge reads at the small step,
  and the Captain thread's narration lines are left-aligned system
  lines with their glyph in an icon slot.
- **Machine cards that fit.** State names read at 13px in boxes as
  wide as their column's longest label, a nested state goes by its
  own segment with its parent as caption, unwalked exits into rest
  states fold to a "+N" marker until walked or hovered, and a drawing
  scales into a column it barely exceeds and scrolls behind a fade
  past that; the Captain split defaults to 45% and holds still.
- **Player panes tell the call.** Headers read "coder · dev.coder",
  an untouched lane reads "Idle until the playbook calls ⟨lane⟩", a
  running call ticks "coder working · 2m 13s" in the pane and the
  thread, tool rows read as commands whichever runner made them, and
  a finished call shows its span, tokens, and cost.
- **Failures speak plain**, with the runtime's words in the tooltip;
  agent text, prompts, bubbles, and code blocks wrap unbroken tokens.
- **The Dashboard never reads empty while loading**: History says
  "Loading…" until its first page and lists its newest eight rows
  under "Older…", Sources says it is loading rather than not
  connected, and the Now band reads "deciding" or "working" mid-turn.
- **The served page carries the shell's version**, so Settings
  never prints a dev placeholder over a remote connection.

### Changed

- **Playbook 12.2 with slc 0.7.** The core runs on `@sublang/playbook`
  12.2, the release whose runtime the `slc` 0.7 compiler links every
  compiled playbook against; the Playbooks example card shows slc
  0.7's own two-agent change-and-review demo, and the `dev` built-in's
  machine drawing gives each transition its own port.

### Fixed

- **Compiled playbooks register.** Registering a compiled playbook
  matched its bound roles case-sensitively against slc's capitalized
  role ids, so every compile ended in "no player was bound"; the
  bindings now match however the submission cased them, and the
  registry's absolute path imports as a file URL on Windows.
- **The composer keeps one row.** A window laid out before it was
  shown pinned the Boss field to no height, clipping its placeholder
  until a reload; the field never drops under one row and refits
  when the viewport resizes.
- **A session with no player lanes** — one the playbook terminal
  wrote — shows the Captain column alone at the home's reading width
  instead of a divider beside an empty half.
- **Nested machine states read by name.** A region of `/decide`'s
  parallel proposals drew under its whole dotted id, trimmed past the
  box; it now goes by its own segment with its parent as caption and
  the whole path in tooltips and the status line.
- **A codex coder's tool rows read as commands**: the login-shell
  wrapper is unwrapped and its shell tool reads "shell", as a Claude
  coder's rows already did.

## [0.2.0] - 2026-09-02

### Added

- **Sessions continue.** An ended session is a paused conversation: a
  message continues it, after the app restarts too, from a token-free
  Captain snapshot kept beside the session; the End confirm says so.
- **Every session can be deleted**, sessions run from the playbook
  terminal included, behind a lease check that refuses while a
  terminal still writes them.
- **Spec editing.** Packages, decision records, and intent records
  open in a plain-text editor with a markdown preview from the Specs
  tab; saves are atomic and refuse to clobber a file an agent changed
  meanwhile.
- **Intent controls.** A working intent can be dropped from the
  session's working line and the Dashboard's Now band; the Captain
  home's next card can remove its intent.

### Changed

- **Chrome that fits.** The composer is rebuilt — field on top, actions
  beneath, "Send" and "Send next", no native grip — and every row,
  toolbar, and header yields at narrow widths instead of overlapping;
  a browser journey now measures overlap at widths from 320px.
- Record rows look and act alike everywhere — Specs decisions, History,
  Sources — and open the record in the records reader.

### Fixed

- History and Sources record rows opened nothing; they now land in the
  records reader.
- A stale ledger reply could outlive a fresh one, leaving a started
  intent shown as still queued.

## [0.1.0] - 2026-09-02

### Added

- **Workspace.** Local git repositories as projects; Boss sessions with
  a Captain pane, one pane per session player, live machine cards for
  the playbook run, and a composer that queues messages during a turn
  and answers a player's question in place; the project palette, the
  Specs tab with outline, search, citations, and graph, and the
  project Overview.
- **Dashboard as the intent ledger.** An attention queue of questions,
  failures, and finished work awaiting a verdict; per-project History,
  Now, Up next, and Sources; one-gesture capture from GitHub issues,
  pull requests, intent records, or a typed line; Start stages an
  intent into the composer; Confirm or Drop closes it; History shows
  done work with fixed bugs crossed out.
- **Playbooks.** The `@sublang/playbook` built-ins (`/code`, `/review`,
  `/decide`, `/dev`), per-role inline agents with fast mode, the
  pipeline view, and a compile flow through `slc`.
- **Settings.** The Captain agent, session players, adapter readiness
  with in-place re-check, notifications, and comment-preserving edits
  of the shared playbook config.
- **Shared file state.** App state under `~/.spex` and sessions in the
  playbook CLI's own store, so a session run from a terminal appears
  in the app; the shared config lives under `~/.spex/playbook`.
- **Server shell.** The interface and the core served from one port
  behind a token URL, with optional TLS, for browsing a machine you own
  from another.
- **Desktop shell.** Single instance, OS notifications and dock badge,
  and a guarded source launch that rebuilds and restores the native
  module.
- **Acceptance.** Browser journeys driving the served interface in
  Chromium against a real core with substitute agents, including an
  accessibility scan of every surface in both themes.

[Unreleased]: https://github.com/sublang-ai/spex/compare/app-v0.8.0...HEAD
[0.8.0]: https://github.com/sublang-ai/spex/compare/app-v0.7.0...app-v0.8.0
[0.7.0]: https://github.com/sublang-ai/spex/compare/app-v0.6.1...app-v0.7.0
[0.6.1]: https://github.com/sublang-ai/spex/compare/app-v0.6.0...app-v0.6.1
[0.6.0]: https://github.com/sublang-ai/spex/compare/app-v0.5.0...app-v0.6.0
[0.5.0]: https://github.com/sublang-ai/spex/compare/app-v0.4.0...app-v0.5.0
[0.4.0]: https://github.com/sublang-ai/spex/compare/app-v0.3.0...app-v0.4.0
[0.3.0]: https://github.com/sublang-ai/spex/compare/app-v0.2.0...app-v0.3.0
[0.2.0]: https://github.com/sublang-ai/spex/compare/app-v0.1.0...app-v0.2.0
[0.1.0]: https://github.com/sublang-ai/spex/releases/tag/app-v0.1.0
