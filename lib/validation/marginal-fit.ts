import { readFileSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import type { SyntheticResidentRecord, TvScore } from "@/lib/types";
import { loadCensusBundle } from "@/lib/data/ingest";
import { tvDistance } from "@/lib/predict/aggregate";

const TV_THRESHOLD = 0.05;

export function computeMarginalFit(residents: SyntheticResidentRecord[]): {
  scores: TvScore[];
  passed: boolean;
  maxTv: number;
} {
  const bundle = loadCensusBundle();
  const totalW = residents.reduce((s, r) => s + r.weight, 0);
  const scores: TvScore[] = [];

  const dims: { dim: keyof SyntheticResidentRecord; target: Record<string, number>; constrained: boolean }[] = [
    { dim: "sex", target: bundle.nctMarginals.sex, constrained: true },
    { dim: "ageBand", target: bundle.nctMarginals.ageBand, constrained: true },
    { dim: "scst", target: { sc: bundle.nctMarginals.scst.sc, non_sc: bundle.nctMarginals.scst.non_sc }, constrained: true },
    { dim: "workerStatus", target: bundle.nctMarginals.workerStatus, constrained: true },
    { dim: "religion", target: bundle.nctMarginals.religion, constrained: false },
  ];

  for (const { dim, target, constrained } of dims) {
    const labels = Object.keys(target);
    const targetDist = labels.map((l) => target[l] / bundle.nctPopulation);
    const obs: Record<string, number> = {};
    for (const r of residents) {
      const k = String(r[dim]);
      obs[k] = (obs[k] ?? 0) + r.weight;
    }
    const observed = labels.map((l) => (obs[l] ?? 0) / totalW);
    scores.push({
      dimension: String(dim),
      geography: "NCT",
      target: targetDist,
      observed,
      labels,
      tvDistance: tvDistance(targetDist, observed),
      constrained,
    });
  }

  const constrainedScores = scores.filter((s) => s.constrained);
  const maxTv = constrainedScores.length ? Math.max(...constrainedScores.map((s) => s.tvDistance)) : 0;
  return { scores, passed: maxTv <= TV_THRESHOLD, maxTv };
}

export interface RubricEntry {
  id: string;
  as_of_date: string;
  model: string;
  question: string;
  description: string;
  target_share?: number;
  tolerance?: number;
  direction?: "up" | "down";
  leakage_warning?: string;
}

export interface DelhiRubric {
  meta: Record<string, unknown>;
  weights: Record<string, number>;
  thresholds: Record<string, number>;
  elections_measures: RubricEntry[];
  counterfactuals: RubricEntry[];
}

export function loadDelhiRubric(): DelhiRubric {
  const path = join(process.cwd(), "data", "rubric", "delhi.yaml");
  return yaml.load(readFileSync(path, "utf8")) as DelhiRubric;
}
