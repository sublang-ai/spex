// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One explicit preview and confirmation for a local spec package, shared
// by environment rows and playbook authoring (playbook-library-93, -113).
import { useState } from "react";
import type { EnvironmentState, PublishPreview } from "@sublang/spex-core/protocol";
import type { PublishTarget } from "../lib/environments.js";
import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";

type Receipt = EnvironmentState["published"];

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
  path: string;
  target: PublishTarget | undefined;
  onNavigate?: (surface: "Settings" | "Space") => void;
}

export function PublishControl(props: PublishProps) {
  // Remount synchronously when the upload destination changes, so an old
  // preview can never confirm against the new folder or account target.
  const key = JSON.stringify([props.repository, props.path, props.target?.origin,
    props.target?.signedIn, props.target?.name]);
  return <PublishAttempt key={key} {...props} />;
}

/** Publish beneath the form (playbook-library-93): an inline summary
 * of the destination and what would upload — name, version, files —
 * confirmed with Publish or left with Cancel; the outcome reads from
 * the environment's state, the published version with its page at the
 * registry or the issues in place. A home not signed in to the instance
 * the publish goes to reads "Sign in to publish at <name>" instead;
 * nothing stands until the Groups state says which instance that is. */
function PublishAttempt({
  repository,
  path,
  target,
  onNavigate,
}: PublishProps) {
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

  if (!target) return null;
  if (!target.signedIn) {
    const label = i18n._({
      id: "Sign in to publish at {name}",
      comment: "in Publish's place: the home is not signed in to the instance a publish from this project goes to; {name} is that instance's display name as last read, else its host name",
      values: { name: target.name },
    });
    return (
      <div data-testid="publish" className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        {onNavigate ? (
          <button
            type="button"
            data-testid="publish-signin"
            onClick={() => onNavigate("Space")}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {label}
          </button>
        ) : (
          <span data-testid="publish-signin" className="text-xs text-neutral-500">
            {label}
          </span>
        )}
      </div>
    );
  }

  const publishing = environment?.busy === "publishing";
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
      setPreview(await previewPublish(repository, path));
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
      await publish(repository, path);
      setPreview(undefined);
    } catch (cause) {
      setSent(undefined);
      setError((cause as Error).message);
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div data-testid="publish" className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      {preview ? (
        <div data-testid="publish-summary" className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-950">
          <span data-testid="publish-target" className="[overflow-wrap:anywhere]">
            {i18n._("Publish to {origin}", { origin: target.origin })}
          </span>
          <span className="font-mono">
            {preview.name} {preview.version}
          </span>
          <span className="text-neutral-500">
            {i18n._("{count, plural, one {# file uploads:} other {# files upload:}}", { count: preview.files.length })}
          </span>
          <ul data-testid="publish-files" className="max-h-40 overflow-y-auto font-mono text-neutral-600 dark:text-neutral-300">
            {preview.files.map((file) => (
              <li key={file} className="[overflow-wrap:anywhere]">
                {file}
              </li>
            ))}
          </ul>
          <span className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              data-testid="publish-cancel"
              onClick={() => setPreview(undefined)}
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
                ? i18n._({ id: "Publishing…", comment: "a spec package is being uploaded to the registry" })
                : i18n._({ id: "Publish", comment: "upload the spec package to the registry" })}
            </button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="publish-button"
            disabled={pending !== undefined || publishing}
            title={i18n._("Upload {path} to the registry", { path })}
            onClick={() => void ask()}
            className="rounded-md border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
          >
            {pending === "preview"
              ? i18n._({ id: "Checking…", comment: "the checks a publish makes are running, nothing uploads yet" })
              : publishing
                ? i18n._({ id: "Publishing…", comment: "a spec package is being uploaded to the registry" })
                : i18n._({ id: "Publish", comment: "upload the spec package to the registry" })}
          </button>
          {published ? (
            <span data-testid="publish-done" className="text-xs text-emerald-700 dark:text-emerald-300">
              {i18n._("Published {name} {version}", { name: published.name, version: published.version })}{" "}
              <a
                href={published.url}
                target="_blank"
                rel="noreferrer"
                data-testid="publish-link"
                className="text-brand-600 underline dark:text-brand-300"
              >
                {i18n._("Open its page")}
              </a>
            </span>
          ) : null}
        </div>
      )}
      {refusal ? (
        <p role="alert" data-testid="publish-error" className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
