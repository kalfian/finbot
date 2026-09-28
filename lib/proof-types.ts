export const MAX_PROOFS = 3;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export type ExpenseProof = {
  id: string;
  expenseId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};
