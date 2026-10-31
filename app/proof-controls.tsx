"use client";

import { useState } from "react";
import { FileText, Paperclip, StickyNote, Type } from "lucide-react";
import { MAX_PROOFS, MAX_PROOF_TEXT_LENGTH, type ExpenseProof } from "@/lib/proof-types";
import { addTextProof } from "@/lib/expense-form";

type Props = { expenseId: number; count: number; onChange: () => Promise<boolean> };
type PendingProof = { text: string; sourceId: string };

export default function ProofControls({ expenseId, count, onChange }: Props) {
  const [proofs, setProofs] = useState<ExpenseProof[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingProof | null>(null);

  async function load() {
    const response = await fetch(`/api/v1/expenses/${expenseId}/proofs`);
    if (!response.ok) throw new Error("Could not load proofs.");
    const body = await response.json() as { proofs: ExpenseProof[] };
    setProofs(body.proofs);
  }

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setError("");
    try { await load(); } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load proofs.");
    }
  }

  async function add() {
    const text = window.prompt(`Proof text (max ${MAX_PROOF_TEXT_LENGTH} characters)`)?.trim();
    if (!text) return;
    setError("");
    if (text.length > MAX_PROOF_TEXT_LENGTH) {
      setError(`Proof text must be at most ${MAX_PROOF_TEXT_LENGTH} characters.`);
      return;
    }
    await save({ text, sourceId: crypto.randomUUID() });
  }

  async function save(proof: PendingProof) {
    setBusy(true);
    try {
      try { await addTextProof(expenseId, proof.text, proof.sourceId); }
      catch (caught) {
        setPending(proof);
        setError(caught instanceof Error ? caught.message : "Proof could not be saved.");
        await Promise.allSettled([load(), onChange()]);
        setOpen(true);
        return;
      }
      setPending(null);
      setError("");
      await Promise.all([load(), onChange()]);
      setOpen(true);
    } finally { setBusy(false); }
  }

  return <div className="proof-controls">
    <button className="proof-toggle" type="button" aria-expanded={open} onClick={() => void toggle()}>
      <Paperclip size={14} aria-hidden="true" /> {count ? `${count} ${count === 1 ? "proof" : "proofs"}` : "Add proof"}
    </button>
    {open && <div className="proof-details">
      {proofs?.length === 0 && <p>No proofs attached yet.</p>}
      {proofs?.map((proof) => proof.textContent !== undefined
        ? <p key={proof.id} className="proof-text"><StickyNote size={14} aria-hidden="true" /> {proof.textContent}</p>
        : <p key={proof.id} className="proof-text"><FileText size={14} aria-hidden="true" /> {proof.filename} (legacy file proof)</p>)}
      {count < MAX_PROOFS && <button className="proof-toggle" type="button" disabled={busy}
        aria-label={`Add text proof to expense ${expenseId}`} onClick={() => void add()}>
        <Type size={14} aria-hidden="true" /> {busy ? "Saving…" : "Add text"}
      </button>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {pending && <button className="proof-toggle" type="button" disabled={busy}
        onClick={() => void save(pending)}>Retry saving proof</button>}
    </div>}
  </div>;
}
