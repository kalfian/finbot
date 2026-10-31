export const MAX_PROOFS = 3;
export const MAX_PROOF_TEXT_LENGTH = 2000;

export type ExpenseProof = {
  id: string;
  expenseId: number;
  /** New proofs are always "text"; "file" and "link" exist only on legacy rows. */
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** Proof text (or a legacy link's URL); absent for legacy file proofs. */
  textContent?: string;
};
