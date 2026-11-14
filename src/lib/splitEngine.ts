// All money is INTEGER PAISE (₹1 = 100 paise). Never use floats for money.
export type Paise = number;
export type Share = { id: string; amount: Paise };

export const rupeesToPaise = (r: number): Paise => Math.round(r * 100);

export const formatINR = (p: Paise): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(p / 100);

// Largest-remainder method: shares always add up EXACTLY to total.
function distribute(total: Paise, weights: { id: string; weight: number }[]): Share[] {
  if (!Number.isInteger(total) || total <= 0) throw new Error("Total must be a positive whole number of paise");
  if (weights.length === 0) throw new Error("Select at least one participant");
  const sum = weights.reduce((s, w) => s + w.weight, 0);
  if (sum <= 0) throw new Error("Weights must be positive");

  const rows = weights.map((w, index) => {
    const numerator = total * w.weight;
    return { id: w.id, index, base: Math.floor(numerator / sum), rem: numerator % sum };
  });

  let leftover = total - rows.reduce((s, r) => s + r.base, 0);
  [...rows]
    .sort((a, b) => b.rem - a.rem || a.index - b.index) // deterministic tie-break
    .forEach((r) => {
      if (leftover > 0) { r.base += 1; leftover -= 1; }
    });

  return rows.map((r) => ({ id: r.id, amount: r.base }));
}

export const splitEqual = (total: Paise, ids: string[]): Share[] =>
  distribute(total, ids.map((id) => ({ id, weight: 1 })));

export const splitShares = (total: Paise, parts: { id: string; shares: number }[]): Share[] =>
  distribute(total, parts.map((p) => ({ id: p.id, weight: p.shares })));

export const splitPercentage = (total: Paise, parts: { id: string; percent: number }[]): Share[] => {
  const weights = parts.map((p) => ({ id: p.id, weight: Math.round(p.percent * 100) }));
  if (weights.reduce((s, w) => s + w.weight, 0) !== 10000) throw new Error("Percentages must total 100%");
  return distribute(total, weights);
};

export const splitExact = (total: Paise, parts: { id: string; amount: Paise }[]): Share[] => {
  if (parts.some((p) => p.amount < 0)) throw new Error("Amounts cannot be negative");
  if (parts.reduce((s, p) => s + p.amount, 0) !== total) throw new Error("Amounts must add up to the total");
  return parts.map((p) => ({ id: p.id, amount: p.amount }));
};