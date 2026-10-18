"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";

type Category = { id: number; name: string; createdAt: string };

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/categories");
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object" || !("categories" in body) || !Array.isArray(body.categories)) {
      throw new Error("Categories could not be loaded.");
    }
    setCategories(body.categories as Category[]);
  }

  useEffect(() => { void Promise.resolve().then(load).catch((cause) => setError(cause.message)); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(editingId === null ? "/api/v1/categories" : `/api/v1/categories/${editingId}`, {
        method: editingId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error : "Category could not be saved.");
      setName("");
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Category could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/categories/${category.id}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error : "Category could not be deleted.");
      if (editingId === category.id) { setEditingId(null); setName(""); }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Category could not be deleted.");
    } finally {
      setPending(false);
    }
  }

  return <section className="access-panel category-panel" aria-labelledby="category-heading">
    <p className="section-label">Classification</p><h2 id="category-heading">Expense categories</h2>
    <p className="access-copy">Categories are private to your account. Rename updates existing expenses; categories still in use cannot be deleted.</p>
    <form className="token-form" onSubmit={submit}>
      <label htmlFor="category-name">{editingId === null ? "New category" : "Rename category"}</label>
      <div><input id="category-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} required />
        <button className="download-button" type="submit" disabled={pending}>{editingId === null ? "Add" : "Save"}</button>
        {editingId !== null && <button className="inline-button category-cancel" type="button" onClick={() => { setEditingId(null); setName(""); }} disabled={pending}><X size={14} /> Cancel</button>}</div>
    </form>
    <ul className="category-list">
      {categories.map((category) => <li key={category.id}><span>{category.name}</span><div>
        <button type="button" onClick={() => { setEditingId(category.id); setName(category.name); }} disabled={pending} aria-label={`Rename ${category.name}`}><Pencil size={14} /></button>
        <button type="button" onClick={() => void remove(category)} disabled={pending} aria-label={`Delete ${category.name}`}><Trash2 size={14} /></button>
      </div></li>)}
    </ul>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
