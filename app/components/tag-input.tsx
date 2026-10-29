"use client";
import {
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { MAX_TAGS_PER_EXPENSE, validateTagName } from "@/lib/tags";
import { Icon } from "./ui-icon";

export type TagInputHandle = {
  /** Adds any half-typed tag and returns the final list, or null when that text is invalid. */
  commit(): string[] | null;
};

const sameName = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Loads the signed-in user's tag names; failures leave suggestions empty rather than blocking entry. */
export async function fetchTagNames(
  fetcher: typeof fetch = fetch,
): Promise<{ name: string; expenseCount: number; totalCents: number }[]> {
  const response = await fetcher("/api/v1/tags");
  const body: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    !("tags" in body) ||
    !Array.isArray(body.tags)
  )
    throw Error("We couldn't load your tags.");
  return (body.tags as unknown[]).flatMap((tag) =>
    tag &&
    typeof tag === "object" &&
    "name" in tag &&
    typeof tag.name === "string"
      ? [
          {
            name: tag.name,
            expenseCount:
              "expenseCount" in tag && typeof tag.expenseCount === "number"
                ? tag.expenseCount
                : 0,
            totalCents:
              "totalCents" in tag && typeof tag.totalCents === "number"
                ? tag.totalCents
                : 0,
          },
        ]
      : [],
  );
}

/**
 * Small read-only or clickable tag chips shared by every expense list. Spans with list roles
 * keep it valid inside inline rows and clear of the row-level `li` styles of host lists.
 */
export function TagList({
  tags,
  activeTag,
  onSelect,
}: {
  tags: readonly string[] | undefined;
  activeTag?: string;
  onSelect?: (tag: string) => void;
}) {
  if (!tags?.length) return null;
  return (
    <span className="tag-list" role="list" aria-label="Tags">
      {tags.map((tag) => (
        <span role="listitem" key={tag}>
          {onSelect ? (
            <button
              type="button"
              className="tag-chip is-action"
              aria-pressed={Boolean(activeTag && sameName(activeTag, tag))}
              aria-label={`Show expenses tagged ${tag}`}
              title={`Show expenses tagged ${tag}`}
              onClick={() => onSelect(tag)}
            >
              <span aria-hidden="true">#</span>
              <span className="tag-chip-name">{tag}</span>
            </button>
          ) : (
            <span className="tag-chip" title={tag}>
              <span aria-hidden="true">#</span>
              <span className="tag-chip-name">{tag}</span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * Chip editor for an expense's tags. Enter or comma adds, Backspace on an empty field
 * removes the last chip; rules match the API (no "#", 40 characters, no commas, 10 tags).
 */
export function TagInput({
  id,
  label = "Tags",
  value,
  onChange,
  suggestions = [],
  disabled = false,
  ref,
}: {
  id: string;
  label?: string;
  value: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
  disabled?: boolean;
  ref?: Ref<TagInputHandle>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const listId = `${useId()}-tag-suggestions`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const full = value.length >= MAX_TAGS_PER_EXPENSE;
  const available = suggestions.filter(
    (name) => !value.some((tag) => sameName(tag, name)),
  );

  /** Validates candidate names against the current list; returns the new list or an error. */
  function add(candidates: string[], current: readonly string[]) {
    const next = [...current];
    for (const candidate of candidates) {
      if (!candidate.trim()) continue;
      let name: string;
      try {
        name = validateTagName(candidate);
      } catch (cause) {
        return { error: (cause as Error).message, next, failed: candidate };
      }
      // Reuse the spelling the account already has, as the API does.
      name = suggestions.find((existing) => sameName(existing, name)) ?? name;
      if (next.some((tag) => sameName(tag, name))) {
        return { error: `#${name} is already on this expense.`, next, failed: candidate };
      }
      if (next.length >= MAX_TAGS_PER_EXPENSE) {
        return {
          error: `An expense can have at most ${MAX_TAGS_PER_EXPENSE} tags.`,
          next,
          failed: candidate,
        };
      }
      next.push(name);
    }
    return { error: "", next, failed: "" };
  }

  function apply(candidates: string[], remainder = "") {
    const result = add(candidates, value);
    const added = result.next.slice(value.length);
    if (added.length) {
      onChange(result.next);
      setAnnouncement(
        `Added ${added.map((tag) => `#${tag}`).join(", ")}. ${result.next.length} of ${MAX_TAGS_PER_EXPENSE} tags.`,
      );
    }
    setError(result.error);
    // Keep the text that failed so it can be corrected rather than retyped.
    setDraft(result.error ? result.failed.trim() : remainder);
    return result;
  }

  function remove(tag: string) {
    const next = value.filter((item) => item !== tag);
    onChange(next);
    setError("");
    setAnnouncement(`Removed #${tag}.`);
    input.current?.focus();
  }

  useImperativeHandle(ref, () => ({
    commit() {
      if (!draft.trim()) return [...value];
      const result = apply([draft]);
      if (result.error) {
        input.current?.focus();
        return null;
      }
      return result.next;
    },
  }));

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value;
    if (text.includes(",")) {
      // Covers typed commas on any keyboard and pasted "a, b, c" lists.
      const parts = text.split(",");
      const remainder = parts.pop() ?? "";
      apply(parts, remainder.trimStart());
      return;
    }
    const native = event.nativeEvent as InputEvent;
    const picked =
      !(native instanceof InputEvent) ||
      native.inputType === "insertReplacementText";
    if (picked && available.some((name) => name === text)) {
      apply([text]);
      return;
    }
    setDraft(text);
    if (error) setError("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && draft.trim()) {
      // Enter adds the tag; on an empty field it still submits the form.
      event.preventDefault();
      apply([draft]);
    } else if (event.key === "Backspace" && !draft && value.length) {
      event.preventDefault();
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="tag-input" data-invalid={error ? "" : undefined}>
      <label className="tag-input-label" htmlFor={id}>
        {label} <span>(optional)</span>
      </label>
      <div
        className={`tag-input-box${disabled ? " is-disabled" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) input.current?.focus();
        }}
      >
        {value.length > 0 && (
          <ul className="tag-input-chips" aria-label={`Selected ${label.toLowerCase()}`}>
            {value.map((tag) => (
              <li key={tag} className="tag-chip">
                <span aria-hidden="true">#</span>
                <span className="tag-chip-name" title={tag}>
                  {tag}
                </span>
                <button
                  type="button"
                  className="tag-chip-remove"
                  aria-label={`Remove tag ${tag}`}
                  disabled={disabled}
                  onClick={() => remove(tag)}
                >
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={input}
          id={id}
          type="text"
          value={draft}
          list={available.length ? listId : undefined}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="enter"
          disabled={disabled}
          placeholder={
            full
              ? "Tag limit reached"
              : value.length
                ? "Add another…"
                : "Liburan Bali, Work trip…"
          }
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) apply([draft]);
          }}
        />
      </div>
      {available.length > 0 && (
        <datalist id={listId}>
          {available.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
      <p className="tag-input-hint" id={hintId}>
        Press Enter or comma to add. {value.length} of {MAX_TAGS_PER_EXPENSE}{" "}
        tags.
      </p>
      {error && (
        <p className="tag-input-error" id={errorId} role="alert">
          {error}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
