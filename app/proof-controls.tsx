"use client";

import { useState } from "react";
import { FileText, Paperclip, Upload } from "lucide-react";
import { MAX_PROOFS, MAX_PROOF_BYTES, type ExpenseProof } from "@/lib/proof-types";
import { uploadProof } from "@/lib/expense-form";

type Props = { expenseId: number; count: number; onChange: () => Promise<boolean> };

export default function ProofControls({ expenseId, count, onChange }: Props) {
  const [proofs, setProofs] = useState<ExpenseProof[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ file: File; sourceId: string }[]>([]);

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

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    if (files.length + count > MAX_PROOFS) {
      setError(`You can attach up to ${MAX_PROOFS} proofs per expense.`);
      return;
    }
    if (Array.from(files).some((file) => !file.size || file.size > MAX_PROOF_BYTES)) {
      setError("Each proof must be 1 byte to 5 MB.");
      return;
    }
    await uploadFiles(Array.from(files).map((file) => ({ file, sourceId: crypto.randomUUID() })));
  }

  async function uploadFiles(selected: { file: File; sourceId: string }[]) {
    setBusy(true);
    try {
      for (let index = 0; index < selected.length; index++) {
        try { await uploadProof(expenseId, selected[index].file, selected[index].sourceId); }
        catch (caught) {
          setPending(selected.slice(index));
          setError(caught instanceof Error ? caught.message : "Proof could not be uploaded.");
          await Promise.allSettled([load(), onChange()]);
          setOpen(true);
          return;
        }
      }
      setPending([]);
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
      {proofs?.map((proof) => <a key={proof.id} href={`/api/v1/expenses/${expenseId}/proofs/${proof.id}`} target="_blank" rel="noopener noreferrer">
        <FileText size={14} aria-hidden="true" /> {proof.filename}
      </a>)}
      {count < MAX_PROOFS && <label className="proof-add"><Upload size={14} aria-hidden="true" />
        {busy ? "Uploading…" : "Attach file"}
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={busy}
          aria-label={`Attach proof to expense ${expenseId}`} onChange={(event) => {
            void add(event.target.files);
            event.target.value = "";
          }} />
      </label>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {pending.length > 0 && <button className="proof-toggle" type="button" disabled={busy}
        onClick={() => void uploadFiles(pending)}>Retry proof upload</button>}
    </div>}
  </div>;
}
