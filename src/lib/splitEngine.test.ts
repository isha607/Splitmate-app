import { describe, it, expect } from "vitest";
import { splitEqual, splitShares, splitPercentage, splitExact, rupeesToPaise } from "./splitEngine";

const sum = (s: { amount: number }[]) => s.reduce((a, b) => a + b.amount, 0);

describe("splitEngine", () => {
  it("splits ₹1000 three ways without losing a paisa", () => {
    const r = splitEqual(rupeesToPaise(1000), ["A", "B", "C"]);
    expect(r.map((x) => x.amount)).toEqual([33334, 33333, 33333]);
    expect(sum(r)).toBe(100000);
  });

  it("charges only selected participants (C excluded)", () => {
    const r = splitEqual(rupeesToPaise(2000), ["A", "B", "D", "E"]);
    expect(r.every((x) => x.amount === 50000)).toBe(true);
    expect(r.find((x) => x.id === "C")).toBeUndefined();
  });

  it("handles shares 2:1:1", () => {
    const r = splitShares(rupeesToPaise(1000), [
      { id: "A", shares: 2 }, { id: "B", shares: 1 }, { id: "C", shares: 1 },
    ]);
    expect(r.map((x) => x.amount)).toEqual([50000, 25000, 25000]);
  });

  it("rejects percentages that don't total 100", () => {
    expect(() => splitPercentage(100000, [{ id: "A", percent: 60 }, { id: "B", percent: 30 }])).toThrow();
  });

  it("rejects exact amounts that don't match the total", () => {
    expect(() => splitExact(100000, [{ id: "A", amount: 50000 }])).toThrow();
  });

  it("always sums to the total for awkward numbers", () => {
    for (const total of [1, 7, 99, 12345, 100001]) {
      expect(sum(splitEqual(total, ["A", "B", "C", "D", "E", "F", "G"]))).toBe(total);
    }
  });
});