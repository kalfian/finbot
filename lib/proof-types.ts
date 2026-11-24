export const MAX_PROOFS = 3;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const MAX_PROOF_TEXT_LENGTH = 2000;
export const PROOF_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type ProofFileType = (typeof PROOF_FILE_TYPES)[number];

export type ExpenseProof = {
  id: string;
  expenseId: number;
  /** "file" (JPEG/PNG/WebP/PDF bytes on disk) or "text"; "link" exists only on legacy rows. */
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** Proof text (or a legacy link's URL); absent for file proofs. */
  textContent?: string;
};
