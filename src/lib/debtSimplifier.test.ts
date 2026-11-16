import { describe, it, expect } from 'vitest'
import { simplifyDebts } from './debtSimplifier'

describe('simplifyDebts', () => {
  it('A->B 500, B->C 300, C->A 200 simplify hota hai', () => {
    // A: -500+200 = -300, B: +500-300 = +200, C: +300-200 = +100
    const t = simplifyDebts({ A: -300, B: 200, C: 100 })
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(300)
    expect(t.length).toBe(2)
  })
  it('settled group me koi transfer nahi', () => {
    expect(simplifyDebts({ A: 0, B: 0 })).toEqual([])
  })
})