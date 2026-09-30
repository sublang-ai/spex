// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The model field (settings-39, settings-40, DR-091): a trigger that
// opens a single-select listbox, because a model needs two lines — its
// name with the specific model the runtime reports behind it, then the
// runtime's own description — and a native option holds one. A real
// list prevents misspellings; explicit custom input retains provider
// aliases and configurations missing from today's catalog (DR-052).

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { AgentModelOption } from "@sublang/spex-core/protocol";

import {
  findModel,
  modelDisplay,
  providerDefaultDisplay,
  providerDefaultLabel,
} from "../lib/agent-options.js";
import { useFitInBox } from "../lib/popover-fit.js";
import { i18n } from "../i18n.js";
import { Icon } from "./Icon.js";

const CUSTOM = "__spex_custom__";
const fieldClass = "w-full min-w-0 rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900";
const mutedClass = "text-neutral-500 dark:text-neutral-400";

/** One line as the field draws it: words, and muted words beside them. */
interface Line {
  text: string;
  muted?: string;
}

/** One row of the listbox. */
interface Choice {
  key: string;
  /** "" takes the provider's default; CUSTOM asks for a typed id. */
  value: string;
  line: Line;
  /** The row's second line: the runtime's description, or the model
   * it runs by default — its words, never ours. */
  detail?: string;
}

/** A text read on each render, never at module load, so the words
 * follow the reader's language (localization-4). */
function customLabel(): string {
  return i18n._({ id: "Custom model…", comment: "model choice: type a model id by hand" });
}

function lineText(line: Line): string {
  return line.muted === undefined ? line.text : `${line.text} · ${line.muted}`;
}

function LineView({ line, id }: { line: Line; id?: string }) {
  // One child owns the slack (DR-041): the line truncates as a whole,
  // its muted part included, and a title carries all of it.
  return (
    <span id={id} className="block min-w-0 truncate">
      {/* The space stands between the two, outside the muted part: an
          element's own leading space is trimmed from the name the line
          lends the trigger and its row. */}
      {line.muted !== undefined ? `${line.text} ` : line.text}
      {line.muted !== undefined ? (
        <span className={mutedClass}>{line.muted}</span>
      ) : null}
    </span>
  );
}

export function ModelField({
  value,
  models,
  defaultModel,
  onChange,
  testId,
  labelId,
  allowDefault = true,
}: {
  value: string;
  models: readonly AgentModelOption[];
  /** The model the runtime runs when none is configured, where it
   * reported one (settings-35). */
  defaultModel?: string;
  onChange(value: string): void;
  testId: string;
  /** The id of the field's visible label, which names the trigger and
   * the listbox alike. */
  labelId: string;
  allowDefault?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const selected = findModel(models, value);
  const unlisted = Boolean(value) && !selected;
  const manual = custom || unlisted || models.length === 0 || (!allowDefault && !value);
  // A catalog that leaves while the list is open — a refresh reloading
  // it — takes the list with it rather than reopening it later.
  useEffect(() => {
    if (models.length === 0) setOpen(false);
  }, [models.length]);

  const providerDefault = providerDefaultDisplay(models, defaultModel);
  const choices: Choice[] = [];
  if (allowDefault) {
    choices.push({
      key: "provider-default",
      value: "",
      line: { text: providerDefault.name },
      ...(providerDefault.specific !== undefined ? { detail: providerDefault.specific } : {}),
    });
  }
  // A canonical pin recognized through an alias's resolution is its own
  // row, reading as itself: never rewritten to the alias (DR-052).
  if (value && selected && selected.id !== value) {
    choices.push({ key: `resolved:${value}`, value, line: { text: value } });
  }
  for (const entry of models) {
    const display = modelDisplay(models, entry.id);
    choices.push({
      key: `model:${entry.id}`,
      value: entry.id,
      line: { text: display.name, ...(display.specific !== undefined ? { muted: display.specific } : {}) },
      ...(entry.description ? { detail: entry.description } : {}),
    });
  }
  choices.push({ key: "custom", value: CUSTOM, line: { text: customLabel() } });

  const chosenKey = manual
    ? "custom"
    : !value
      ? "provider-default"
      : selected?.id === value
        ? `model:${value}`
        : `resolved:${value}`;
  const chosenIndex = Math.max(0, choices.findIndex((choice) => choice.key === chosenKey));
  const shown: Line = chosenKey === "provider-default"
    ? { text: providerDefault.name, ...(providerDefault.specific !== undefined ? { muted: providerDefault.specific } : {}) }
    : choices[chosenIndex]?.line ?? { text: value };

  function openList(): void {
    setActive(chosenIndex);
    setOpen(true);
  }

  function close(refocus: boolean): void {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(index: number): void {
    const choice = choices[index];
    if (!choice) return;
    if (choice.value === CUSTOM) setCustom(true);
    else {
      setCustom(false);
      onChange(choice.value);
    }
    close(true);
  }

  const valueId = `${baseId}-value`;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {models.length > 0 && (
        // The list hangs from the trigger's own box, so it opens under
        // the trigger even while the typed field stands beneath it.
        <div className="relative min-w-0">
          <button
            type="button"
            ref={triggerRef}
            data-testid={`${testId}-trigger`}
            aria-haspopup="listbox"
            aria-expanded={open}
            {...(open ? { "aria-controls": `${baseId}-list` } : {})}
            aria-labelledby={`${labelId} ${valueId}`}
            title={lineText(shown)}
            onClick={() => (open ? close(true) : openList())}
            onKeyDown={(event) => {
              // Enter and Space open it through the click they fire.
              if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                openList();
              }
            }}
            className={`${fieldClass} flex items-center gap-1 text-left`}
          >
            {/* A model's name, id and description are the runtime's
                words, not ours; only the stand-ins around them are. */}
            <span className="flex min-w-0 flex-1">
              <LineView line={shown} id={valueId} />
            </span>
            <Icon name="caretDown" className={`h-3.5 w-3.5 shrink-0 ${mutedClass}`} />
          </button>
          {open ? (
            <ModelListbox
              choices={choices}
              chosenIndex={chosenIndex}
              active={active}
              onActive={setActive}
              onChoose={choose}
              onClose={close}
              triggerRef={triggerRef}
              baseId={baseId}
              labelId={labelId}
              testId={testId}
            />
          ) : null}
        </div>
      )}
      {manual && <input
        aria-label={i18n._({ id: "Custom model", comment: "the hand-typed model id field" })}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={allowDefault ? providerDefaultLabel() : i18n._({ id: "Model ID", comment: "placeholder of the hand-typed model id field" })}
        className={fieldClass}
      />}
      {unlisted && models.length > 0 && <span className="text-xs text-neutral-500">{i18n._("Not in this runtime's list. Check the model ID.")}</span>}
    </div>
  );
}

/** The open list: it takes focus, walks with the keys the listbox idiom
 * uses, and lies inside the box that must show it (settings-40). */
function ModelListbox({
  choices,
  chosenIndex,
  active,
  onActive,
  onChoose,
  onClose,
  triggerRef,
  baseId,
  labelId,
  testId,
}: {
  choices: Choice[];
  chosenIndex: number;
  active: number;
  onActive(index: number): void;
  onChoose(index: number): void;
  onClose(refocus: boolean): void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  baseId: string;
  labelId: string;
  testId: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useFitInBox(boxRef);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  useEffect(() => {
    // The active row stays in sight as the keys walk a long list.
    document.getElementById(`${baseId}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, baseId]);

  useEffect(() => {
    const press = (event: MouseEvent) => {
      const target = event.target as Node;
      if (boxRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeRef.current(false);
    };
    window.addEventListener("mousedown", press);
    return () => window.removeEventListener("mousedown", press);
  }, [triggerRef]);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    const last = choices.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        onActive(Math.min(last, active + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        onActive(Math.max(0, active - 1));
        return;
      case "Home":
        event.preventDefault();
        onActive(0);
        return;
      case "End":
        event.preventDefault();
        onActive(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        onChoose(active);
        return;
      case "Escape":
        // The list is what Escape dismisses here, not the editor around
        // it: the key goes no further.
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
        return;
      case "Tab":
        // Tab leaves from the trigger, so focus moves on from the field
        // rather than from a list that is gone.
        triggerRef.current?.focus();
        onClose(false);
        return;
      default:
        return;
    }
  }

  return (
    <div
      ref={boxRef}
      className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      <ul
        ref={listRef}
        id={`${baseId}-list`}
        role="listbox"
        tabIndex={-1}
        data-testid={`${testId}-listbox`}
        aria-labelledby={labelId}
        aria-activedescendant={optionId(active)}
        onKeyDown={onKeyDown}
        className="max-h-72 min-h-0 overflow-y-auto py-1 outline-none"
      >
        {choices.map((choice, index) => {
          const selected = index === chosenIndex;
          const nameId = `${optionId(index)}-name`;
          const detailId = `${optionId(index)}-detail`;
          return (
            <li
              key={choice.key}
              id={optionId(index)}
              role="option"
              aria-selected={selected}
              aria-labelledby={nameId}
              {...(choice.detail !== undefined ? { "aria-describedby": detailId } : {})}
              data-testid={`${testId}-option`}
              data-value={choice.value}
              title={choice.detail !== undefined ? `${lineText(choice.line)}\n${choice.detail}` : lineText(choice.line)}
              // The list keeps focus: a press chooses on its click.
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => {
                if (index !== active) onActive(index);
              }}
              onClick={() => onChoose(index)}
              className={`flex cursor-default items-start gap-1.5 px-2 py-1 ${
                index === active ? "bg-brand-50 dark:bg-brand-950" : ""
              } ${choice.value === CUSTOM ? "border-t border-neutral-100 dark:border-neutral-800" : ""}`}
            >
              <span aria-hidden className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-brand-600 dark:text-brand-300">
                {selected ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <LineView line={choice.line} id={nameId} />
                {choice.detail !== undefined ? (
                  <span id={detailId} className={`block min-w-0 truncate text-xs ${mutedClass}`}>
                    {choice.detail}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
