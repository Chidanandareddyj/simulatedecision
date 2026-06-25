import { describe, it, expect } from "vitest";
import { assignVerdicts } from "@/lib/map/verdict";
import { lonlatEvenScatter, lonlatForWard, lonlatToPixel } from "@/lib/geo/delhi";

describe("assignVerdicts", () => {
  const agents = Array.from({ length: 100 }, (_, i) => ({ hx: i * 10, hy: i * 8 }));

  it("exact yes count matches p_yes", () => {
    const pYes = 0.37;
    const verdicts = assignVerdicts(agents, pYes, "test question", { w: 1600, h: 1400 });
    const yesCount = verdicts.filter((v) => v === "yes").length;
    expect(yesCount).toBe(Math.round(pYes * agents.length));
  });

  it("is deterministic for same question", () => {
    const a = assignVerdicts(agents, 0.5, "will AAP win?", { w: 1600, h: 1400 });
    const b = assignVerdicts(agents, 0.5, "will AAP win?", { w: 1600, h: 1400 });
    expect(a).toEqual(b);
  });
});

describe("delhi geo", () => {
  it("lonlatEvenScatter is deterministic", () => {
    const a = lonlatEvenScatter(42, 0, 100);
    const b = lonlatEvenScatter(42, 0, 100);
    expect(a).toEqual(b);
  });

  it("lonlatForWard is deterministic", () => {
    const a = lonlatForWard("NW-W01", 12345);
    const b = lonlatForWard("NW-W01", 12345);
    expect(a).toEqual(b);
  });

  it("lonlatToPixel maps bbox corners", () => {
    const nw = lonlatToPixel(76.84, 28.88, 1600, 1400);
    expect(nw.x).toBeCloseTo(0, 0);
    expect(nw.y).toBeCloseTo(0, 0);
    const se = lonlatToPixel(77.35, 28.4, 1600, 1400);
    expect(se.x).toBeCloseTo(1600, 0);
    expect(se.y).toBeCloseTo(1400, 0);
  });
});
