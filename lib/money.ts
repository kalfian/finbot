export function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountCents / 100);
}

export function toAmountCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;

  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function calculateTotal(amountsCents: readonly number[]): number {
  return amountsCents.reduce((sum, amountCents) => sum + amountCents, 0);
}
