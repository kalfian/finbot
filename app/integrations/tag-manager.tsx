"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/money";
import { MAX_TAG_LENGTH, validateTagName } from "@/lib/tags";

type Tag = { id: number; name: string; createdAt: string; expenseCount: number; totalCents: number };

const errorMessage = (body: unknown, fallback: string) =>
  body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;

export default function TagManager() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const editing = tags?.find((tag) => tag.id === editingId);

  async function load() {
    const response = await fetch("/api/v1/tags");
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object" || !("tags" in body) || !Array.isArray(body.tags)) {
      throw new Error("Tags could not be loaded.");
    }
    setTags(body.tags as Tag[]);
  }

  useEffect(() => { void Promise.resolve().then(load).catch((cause) => setError(cause.message)); }, []);

  function cancelEdit() {
    setEditingId(null);
    setName("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    let clean: string;
    try { clean = validateTagName(name); } catch (cause) {
      setError((cause as Error).message);
      nameInput.current?.focus();
      return;
    }
    setPending(true);
    try {
      const response = await fetch(editingId === null ? "/api/v1/tags" : `/api/v1/tags/${editingId}`, {
        method: editingId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Tag could not be saved."));
      setNotice(editingId === null ? `#${clean} is ready to use.` : `Renamed to #${clean} on every tagged expense.`);
      setName("");
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tag could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function remove(tag: Tag) {
    const expenses = tag.expenseCount === 1 ? "1 expense" : `${tag.expenseCount} expenses`;
    const consequence = tag.expenseCount
      ? `Your ${expenses} will be kept; only the #${tag.name} label is removed from ${tag.expenseCount === 1 ? "it" : "them"}.`
      : "No expenses use it.";
    if (!window.confirm(`Delete tag "#${tag.name}"? ${consequence}`)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/v1/tags/${tag.id}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Tag could not be deleted."));
      if (editingId === tag.id) cancelEdit();
      setNotice(`#${tag.name} deleted. ${tag.expenseCount ? `${expenses} kept.` : ""}`.trim());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tag could not be deleted.");
    } finally {
      setPending(false);
    }
  }

  return <section className="access-panel tag-panel" aria-labelledby="tag-heading">
    <p className="section-label">Classification</p><h2 id="tag-heading">Expense tags</h2>
    <p className="access-copy">Tags group expenses across categories, such as a trip or an event. Add them while recording an expense; renaming updates every tagged expense, and deleting a tag keeps the expenses.</p>
    <form className="token-form" onSubmit={submit} noValidate>
      <label htmlFor="tag-name">{editing ? `Rename #${editing.name}` : "New tag"}</label>
      <div><input ref={nameInput} id="tag-name" maxLength={MAX_TAG_LENGTH + 1} value={name} placeholder="Liburan Bali"
        onChange={(event) => { setName(event.target.value); setError(""); }} disabled={pending}
        aria-invalid={Boolean(error)} aria-describedby={error ? "tag-name-hint tag-error" : "tag-name-hint"} required />
        <button className="download-button" type="submit" disabled={pending}>{pending ? "Saving…" : editingId === null ? "Add" : "Save"}</button>
        {editingId !== null && <button className="inline-button category-cancel" type="button" onClick={cancelEdit} disabled={pending}><X size={14} aria-hidden="true" /> Cancel</button>}</div>
      <p className="tag-name-hint" id="tag-name-hint">Up to {MAX_TAG_LENGTH} characters, no commas. A leading # is optional.</p>
    </form>
    {error && <p className="field-error" id="tag-error" role="alert">{error}</p>}
    <p className="tag-notice success" role="status">{notice}</p>
    {tags === null ? !error && <p className="tag-empty">Loading tags…</p>
      : tags.length === 0 ? <p className="tag-empty">No tags yet. Create one here, or type one in the Tags field when you add an expense.</p>
        : <ul className="category-list tag-manager-list" aria-busy={pending}>
          {tags.map((tag) => <li key={tag.id} className={tag.id === editingId ? "is-editing" : undefined}>
            <span className="tag-manager-name"><strong title={tag.name}><span aria-hidden="true">#</span>{tag.name}</strong>
              <small>{tag.expenseCount === 1 ? "1 expense" : `${tag.expenseCount} expenses`} · {formatCurrency(tag.totalCents)}</small></span>
            <div>
              <button type="button" onClick={() => { setEditingId(tag.id); setName(tag.name); setError(""); setNotice(""); nameInput.current?.focus(); }} disabled={pending} aria-label={`Rename ${tag.name}`} title="Rename"><Pencil size={14} aria-hidden="true" /></button>
              <button type="button" onClick={() => void remove(tag)} disabled={pending} aria-label={`Delete ${tag.name}`} title="Delete tag, keep expenses"><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          </li>)}
        </ul>}
  </section>;
}
