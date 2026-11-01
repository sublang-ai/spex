// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One explicit preview and confirmation for a local spec package, shared
// by a folder package's row on the Packages tab and playbook authoring
// (playbook-library-93, -113, DR-172): "Publish <org>/<pkg> <version> to
// <registry>", the registry by its display name with its origin in the
// tooltip, over "<count> files" and "as @<login> in <org>", with Publish
// and Cancel; signed out, one button "Sign in to publish", neither
// judged before the account there is read; success "Published <version>"
// linking its page at the registry.
import { useEffect, useState } from "react";
import type { EnvironmentState, PublishPreview } from "@sublang/spex-core/protocol";
import { publishTargetAt, type PublishTarget } from "../lib/environments.js";
import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { RegistryFlowLine, registrySignInTitle, useRegistrySignIn } from "./RegistryAccount.js";
import { signingInLabel } from "./SpaceSignIn.js";

type Receipt = EnvironmentState["published"];

const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";
const OUTLINE =
  "rounded-md border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950";

function receiptOrigin(receipt: Receipt): string | undefined {
  try { return receipt ? new URL(receipt.url).origin : undefined; } catch { return undefined; }
}

/** An immutable origin/name/version receipt describes one release, not
 * success of a later attempt to publish that same release (DR-151). */
function sameReceipt(before: Receipt, after: NonNullable<Receipt>): boolean {
  return !!before && before.name === after.name && before.version === after.version &&
    receiptOrigin(before) === receiptOrigin(after);
}

interface PublishProps {
  repository: string;
  /** The spec package published, `<org>/<pkg>`, by which the core finds
   * its folder (environments-10). */
  name: string;
  /** Its folder as the reader sees it: a change discards an open
   * preview (playbook-library-113). */
  path: string;
  target: PublishTarget | undefined;
  /** Opened from a row's overflow (playbook-library-113): Cancel closes
   * the control through `onClose`, and while `autoAsk` holds, once the
   * account at the registry is read, the preview is asked for at once —
   * or, signed out, the registry sign-in started where the entry chosen
   * read "Sign in to publish" — `onAutoAsked` saying it was, once per
   * choice from the overflow, so a preview a change of folder, registry
   * or account discarded is asked for again only by Publish. Absent, a
   * Publish button asks for it (playbook-library-93). */
  opened?: boolean;
  autoAsk?: boolean;
  onAutoAsked?: () => void;
  onClose?: () => void;
  onNavigate?: (surface: "Settings" | "Space") => void;
}

export function PublishControl(props: PublishProps) {
  // The overflow's entry as it read when chosen: its own "Sign in to
  // publish" starts the sign-in at once, Publish never does.
  const [choseSignIn] = useState(() => props.target?.signedIn === false);
  // Each registry's account is read for itself: a failed read at one
  // registry judges no other.
  return <PublishRead key={props.target?.origin ?? ""} {...props} choseSignIn={choseSignIn} />;
}

function PublishRead({ choseSignIn, ...props }: PublishProps & { choseSignIn: boolean }) {
  // Nothing judges signed in or out before the account at the registry
  // is read (playbook-library-113): where no state of it stands, it is
  // read here, its answer judging and a failed read standing as signed
  // out with its cause.
  const unread = props.target !== undefined && props.target.signedIn === undefined;
  const read = useRegistrySignIn(props.target?.origin, { read: unread });
  const target =
    props.target && unread
      ? read.state
        ? publishTargetAt(props.target.origin, read.state)
        : read.error
          ? { ...props.target, signedIn: false }
          : props.target
      : props.target;
  // Remount synchronously when the upload destination changes, so an old
  // preview can never confirm against the new folder or account target.
  const key = JSON.stringify([props.repository, props.name, props.path, target?.origin,
    target?.signedIn, target?.name, target?.login]);
  return (
    <PublishAttempt
      key={key}
      {...props}
      target={target}
      choseSignIn={choseSignIn}
      readError={unread ? read.error : undefined}
    />
  );
}

/** Publish waits for the registry's state to be read. */
function LoadingRegistry() {
  return (
    <div data-testid="publish" role="status" className="text-xs text-neutral-500">
      {i18n._({ id: "Loading registry…", comment: "Publish waits for the registry's state to be read" })}
    </div>
  );
}

/** "Sign in to publish" in place of Publish (playbook-library-93), once
 * the account there reads signed out: it starts the registry sign-in in
 * place, its flow reading beneath it. Chosen as a row's own "Sign in to
 * publish" (playbook-library-113), the sign-in starts at once, once per
 * choice. */
function PublishSignIn({ target, autoStart, readError }: { target: PublishTarget; autoStart: boolean; readError?: string }) {
  const account = useRegistrySignIn(target.origin);
  useEffect(() => {
    if (!autoStart) return;
    void account.start();
    // Started once per mount; a change of target remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A failed read of the account stands until a sign-in runs.
  const failure = account.error ?? (account.running || account.busy ? undefined : readError);
  return (
    <div data-testid="publish" className="flex flex-col gap-1.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <div>
        <button
          type="button"
          data-testid="publish-signin"
          disabled={account.busy || account.running !== undefined}
          title={registrySignInTitle()}
          onClick={() => void account.start()}
          className={OUTLINE}
        >
          {account.running || account.busy
            ? signingInLabel()
            : i18n._({ id: "Sign in to publish", comment: "in place of Publish while the person is not signed in to the registry: starts the registry sign-in" })}
        </button>
      </div>
      {account.running ? <RegistryFlowLine running={account.running} name={target.name} testId="publish-signin" /> : null}
      {failure ? (
        <p role="alert" data-testid="publish-signin-error" className={ERROR}>
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/** Publish (playbook-library-93): an inline summary of the destination
 * and what would upload — name, version, files, the account and org —
 * confirmed with Publish or left with Cancel; the outcome reads from the
 * environment's state, the published version linking its page at the
 * registry or the issues in place. A missing registry grant offers its
 * own sign-in in place; no Space state establishes publication
 * authority. */
function PublishAttempt({
  repository,
  name,
  path,
  target,
  opened = false,
  autoAsk = false,
  onAutoAsked,
  onClose,
  choseSignIn = false,
  readError,
}: PublishProps & { choseSignIn?: boolean; readError?: string }) {
  const store = usePlaceStore();
  const environment = store((state) => state.environments[repository]);
  const previewPublish = store((state) => state.previewPublish);
  const publish = store((state) => state.publishSpecPackage);
  const [preview, setPreview] = useState<PublishPreview>();
  const [pending, setPending] = useState<"preview" | "publish">();
  const [error, setError] = useState<string>();
  // What the environment said before this publish, so its outcome is
  // read from what changed rather than from what stood.
  const [sent, setSent] = useState<{ name: string; version: string; previous: EnvironmentState["published"] }>();

  const signedIn = target?.signedIn === true;
  const judged = target?.signedIn !== undefined;
  // Opened from a row's overflow, the choice is spent once the account
  // is read: signed in, the preview is asked for at once.
  useEffect(() => {
    if (!opened || !autoAsk || !judged) return;
    onAutoAsked?.();
    if (signedIn) void ask();
    // Judged once per mount; a change of target, its read included,
    // remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!target) return <LoadingRegistry />;
  // Publish chosen from the overflow waits for the account's read as for
  // its checks; elsewhere the registry reads as loading.
  const reading = !judged;
  if (reading && !(opened && autoAsk)) return <LoadingRegistry />;
  if (target.signedIn === false) {
    return <PublishSignIn target={target} autoStart={opened && autoAsk && choseSignIn} readError={readError} />;
  }

  const publishing = environment?.busy === "publishing";
  const checking = pending === "preview" || reading;
  const settled = sent && pending === undefined && !publishing;
  const receipt = environment?.published;
  const published =
    settled && receipt && receipt.name === sent.name && receipt.version === sent.version &&
    receiptOrigin(receipt) === target.origin && !sameReceipt(sent.previous, receipt)
      ? receipt
      : undefined;
  const refusal =
    error ??
    (settled && environment?.error
      ? environment.error
      : undefined);

  async function ask(): Promise<void> {
    setPending("preview");
    setError(undefined);
    setSent(undefined);
    try {
      setPreview(await previewPublish(repository, name));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(undefined);
    }
  }

  async function confirm(): Promise<void> {
    if (!preview) return;
    setPending("publish");
    setError(undefined);
    try {
      setSent({ name: preview.name, version: preview.version, previous: environment?.published });
      await publish(repository, name);
      setPreview(undefined);
    } catch (cause) {
      setSent(undefined);
      setError((cause as Error).message);
    } finally {
      setPending(undefined);
    }
  }

  const org = (preview?.name ?? name).split("/")[0] ?? "";
  // The registry the core reports it publishes to, by its display name.
  const destination = preview?.instance ?? { origin: target.origin, name: target.name };
  const publishingWord = i18n._({ id: "Publishing…", comment: "a spec package is being uploaded to the registry" });
  return (
    <div data-testid="publish" className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      {preview ? (
        <div data-testid="publish-summary" className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-950">
          <span data-testid="publish-target" title={destination.origin} className="font-medium [overflow-wrap:anywhere]">
            {i18n._({
              id: "Publish {name} {version} to {registry}",
              comment: "Publish's preview: the spec package, its version and the registry it goes to by its display name, such as Publish acme/triage 0.1.0 to Spex Space",
              values: { name: preview.name, version: preview.version, registry: destination.name || target.name },
            })}
          </span>
          <span data-testid="publish-count" className="text-neutral-500">
            {i18n._({
              id: "{count, plural, one {# file} other {# files}}",
              comment: "Publish's preview: how many files the publish uploads, listed beneath",
              values: { count: preview.files.length },
            })}
          </span>
          <ul data-testid="publish-files" className="max-h-40 overflow-y-auto font-mono text-neutral-600 dark:text-neutral-300">
            {preview.files.map((file) => (
              <li key={file} className="[overflow-wrap:anywhere]">
                {file}
              </li>
            ))}
          </ul>
          {target.login ? (
            <span data-testid="publish-account" className="text-neutral-500 [overflow-wrap:anywhere]">
              {i18n._({
                id: "as @{login} in {org}",
                comment: "Publish's preview: the registry account it publishes as and the org it publishes into; {login} is the account's login, {org} the package name's first half",
                values: { login: target.login, org },
              })}
            </span>
          ) : null}
          <span className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              data-testid="publish-cancel"
              onClick={() => {
                setPreview(undefined);
                onClose?.();
              }}
              className="min-h-6 rounded px-2 py-0.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {i18n._({ id: "Cancel", comment: "leave an editor without saving" })}
            </button>
            <button
              type="button"
              data-testid="publish-confirm"
              disabled={pending !== undefined}
              onClick={() => void confirm()}
              className="min-h-6 rounded bg-brand-600 px-2 py-0.5 font-medium text-white hover:bg-brand-500 disabled:opacity-40"
            >
              {pending === "publish"
                ? publishingWord
                : i18n._({ id: "Publish", comment: "upload the spec package to the registry" })}
            </button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="publish-button"
            disabled={checking || pending !== undefined || publishing}
            title={i18n._({
              id: "Publishes {path} to {registry}",
              comment: "the title of Publish: what it publishes and where; {path} is the package's folder, {registry} the registry's display name",
              values: { path, registry: target.name },
            })}
            onClick={() => void ask()}
            className={OUTLINE}
          >
            {checking
              ? i18n._({ id: "Checking…", comment: "the checks a publish makes are running, nothing uploads yet" })
              : publishing
                ? publishingWord
                : i18n._({ id: "Publish", comment: "upload the spec package to the registry" })}
          </button>
          {published ? (
            <span data-testid="publish-done" className="text-xs text-emerald-700 dark:text-emerald-300">
              <a
                href={published.url}
                target="_blank"
                rel="noreferrer"
                data-testid="publish-link"
                className="text-brand-600 underline dark:text-brand-300"
              >
                {i18n._({
                  id: "Published {version}",
                  comment: "a publish succeeded: the version the registry now holds, linking its page there",
                  values: { version: published.version },
                })}
              </a>
            </span>
          ) : null}
        </div>
      )}
      {refusal ? (
        <p role="alert" data-testid="publish-error" className={ERROR}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
