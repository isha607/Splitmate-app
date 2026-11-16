// Net balances (paise) se minimum payments nikalta hai.
// net > 0 = us bande ko paise milne hain, net < 0 = usse dene hain.
export type Transfer = { from: string; to: string; amount: number }

export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const creditors = Object.entries(net).filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v)
  const debtors = Object.entries(net).filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v)

  const out: Transfer[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v)
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amt })
    debtors[i].v -= amt
    creditors[j].v -= amt
    if (debtors[i].v === 0) i++
    if (creditors[j].v === 0) j++
  }
  return out
}
