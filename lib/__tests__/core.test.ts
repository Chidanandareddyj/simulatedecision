import { describe, it, expect } from "vitest";
import { tvDistance, weightedYesShare, weightedBootstrapCi } from "@/lib/predict/aggregate";
import { ipf as ipfFn } from "@/lib/synthetic/ipf";
import { buildPopulation } from "@/lib/synthetic/build-population";
import { loadCensusBundle } from "@/lib/data/ingest";
import { agentSeed, sampleIndices } from "@/lib/synthetic/rng";
import { clusterResidents } from "@/lib/predict/cluster";
import { cacheKey } from "@/lib/llm/cache";

describe("ipf", () => {
  it("converges to row and column marginals", () => {
    const table = ipfFn(
      [
        [1, 1],
        [1, 1],
      ],
      [30, 70],
      [40, 60],
    );
    const rowSums = table.map((r) => r.reduce((a, b) => a + b, 0));
    const colSums = [0, 1].map((j) => table.reduce((s, r) => s + r[j], 0));
    expect(rowSums[0]).toBeCloseTo(30, 0);
    expect(rowSums[1]).toBeCloseTo(70, 0);
    expect(colSums[0]).toBeCloseTo(40, 0);
    expect(colSums[1]).toBeCloseTo(60, 0);
  });
});

describe("aggregate", () => {
  it("weighted yes share", () => {
    expect(weightedYesShare([[1, 1], [1, 1], [1, 1], [1, 0]])).toBeCloseTo(0.75);
  });

  it("bootstrap ci is deterministic", () => {
    const ans = Array.from({ length: 200 }, (_, i) => [1, i < 140 ? 1 : 0] as [number, number]);
    const a = weightedBootstrapCi(ans, 500, 0.05, 7);
    const b = weightedBootstrapCi(ans, 500, 0.05, 7);
    expect(a).toEqual(b);
  });

  it("tv distance", () => {
    expect(tvDistance([1, 0], [0, 1])).toBeCloseTo(1);
  });
});

describe("rng", () => {
  it("agent seed is deterministic", () => {
    expect(agentSeed(42, 0)).toBe(agentSeed(42, 0));
    expect(agentSeed(42, 0)).not.toBe(agentSeed(42, 1));
  });

  it("sample indices deterministic", () => {
    expect(sampleIndices(10, 100, 42)).toEqual(sampleIndices(10, 100, 42));
  });
});

describe("cluster", () => {
  it("is deterministic", () => {
    const bundle = loadCensusBundle();
    const { residents } = buildPopulation({ n: 200, seed: 42, bundle });
    const a = clusterResidents(residents, 50);
    const b = clusterResidents(residents, 50);
    expect(a.map((c) => c.repIdx)).toEqual(b.map((c) => c.repIdx));
  });
});

describe("cache key", () => {
  it("is stable", () => {
    expect(cacheKey("gpt-4o", "sys", "user")).toBe(cacheKey("gpt-4o", "sys", "user"));
    expect(cacheKey("gpt-4o", "sys", "user")).not.toBe(cacheKey("gpt-4o", "sys", "user2"));
  });
});

describe("synthetic population", () => {
  it("N=2000 matches constrained marginals within TV 0.05", () => {
    const bundle = loadCensusBundle();
    const { residents } = buildPopulation({ n: 2000, seed: 42, bundle });
    const totalW = residents.reduce((s, r) => s + r.weight, 0);

    const check = (dim: keyof (typeof residents)[0], target: Record<string, number>) => {
      const labels = Object.keys(target);
      const targetDist = labels.map((l) => target[l] / bundle.nctPopulation);
      const obs: Record<string, number> = {};
      for (const r of residents) {
        const k = String(r[dim]);
        obs[k] = (obs[k] ?? 0) + r.weight;
      }
      const observed = labels.map((l) => (obs[l] ?? 0) / totalW);
      return tvDistance(targetDist, observed);
    };

    expect(check("sex", bundle.nctMarginals.sex)).toBeLessThanOrEqual(0.05);
    expect(check("workerStatus", bundle.nctMarginals.workerStatus)).toBeLessThanOrEqual(0.05);
  });

  it("is deterministic for same seed", () => {
    const bundle = loadCensusBundle();
    const a = buildPopulation({ n: 100, seed: 99, bundle });
    const b = buildPopulation({ n: 100, seed: 99, bundle });
    expect(a.residents.map((r) => r.district)).toEqual(b.residents.map((r) => r.district));
    expect(a.residents.map((r) => r.sex)).toEqual(b.residents.map((r) => r.sex));
  });
});

describe("poll engine mock", () => {
  it("returns stable results with mocked llm", async () => {
    const { runPoll } = await import("@/lib/predict/engine");
    const bundle = loadCensusBundle();
    const { residents } = buildPopulation({ n: 50, seed: 1, bundle });
    const mockLlm = {
      complete: async () => ({
        text: '[{"i":1,"p_yes":0.6,"why":"test rationale"}]',
        cacheHit: false,
      }),
    };
    const poll = {
      question: "Test?",
      description: "Test desc",
      framing: "vote" as const,
      asOfDate: "2020-01-01",
    };
    const r1 = await runPoll({ residents, poll, llm: mockLlm, maxClusters: 10, batchSize: 12 });
    const r2 = await runPoll({ residents, poll, llm: mockLlm, maxClusters: 10, batchSize: 12 });
    expect(r1.pYes).toBe(r2.pYes);
    expect(r1.nArchetypes).toBeGreaterThan(0);
  });
});
