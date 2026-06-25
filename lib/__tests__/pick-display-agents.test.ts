import { describe, it, expect } from "vitest";
import { pickDisplayAgents } from "@/lib/map/pick-display-agents";

describe("pickDisplayAgents", () => {
  it("returns constant count when population is larger", () => {
    const all = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
    const picked = pickDisplayAgents(all, 400);
    expect(picked).toHaveLength(400);
  });

  it("is deterministic", () => {
    const all = Array.from({ length: 5000 }, (_, i) => i);
    const a = pickDisplayAgents(all, 400);
    const b = pickDisplayAgents(all, 400);
    expect(a).toEqual(b);
  });
});
