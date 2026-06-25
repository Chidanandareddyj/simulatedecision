import { SeededRng } from "@/lib/synthetic/rng";

export interface WeightedAnswer {
  weight: number;
  probs: number[];
}

export function weightedYesShare(answers: [number, number][]): number {
  let num = 0;
  let den = 0;
  for (const [w, p] of answers) {
    num += w * Math.max(0, Math.min(1, p));
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export function weightedDistribution(answers: WeightedAnswer[], nOptions: number): number[] {
  const num = Array(nOptions).fill(0);
  let den = 0;
  for (const a of answers) {
    den += a.weight;
    for (let k = 0; k < nOptions; k++) {
      num[k] += a.weight * (a.probs[k] ?? 0);
    }
  }
  if (den <= 0) return Array(nOptions).fill(1 / nOptions);
  return num.map((x) => x / den);
}

export function effectiveN(weights: number[]): number {
  const s = weights.reduce((a, b) => a + b, 0);
  const s2 = weights.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}

export function designEffect(weights: number[]): number {
  const neff = effectiveN(weights);
  return neff > 0 ? weights.length / neff : 1;
}

export function weightedBootstrapCi(
  answers: [number, number][],
  b: number,
  alpha: number,
  seed: number,
): [number, number] {
  if (answers.length === 0) return [0, 0];
  const n = answers.length;
  const rng = new SeededRng(seed);
  const shares: number[] = [];
  for (let i = 0; i < b; i++) {
    let num = 0;
    let den = 0;
    for (let j = 0; j < n; j++) {
      const idx = rng.nextInt(n);
      const [w, p] = answers[idx];
      num += w * Math.max(0, Math.min(1, p));
      den += w;
    }
    shares.push(den > 0 ? num / den : 0);
  }
  shares.sort((a, c) => a - c);
  const loIdx = Math.floor((alpha / 2) * b);
  const hiIdx = Math.min(b - 1, Math.ceil((1 - alpha / 2) * b) - 1);
  return [shares[loIdx], shares[hiIdx]];
}

export function breakdown<K extends string>(
  rows: [K, number, number][],
): { key: K; yesShare: number; weight: number; n: number }[] {
  const acc = new Map<K, { num: number; den: number; n: number }>();
  for (const [k, w, p] of rows) {
    const e = acc.get(k) ?? { num: 0, den: 0, n: 0 };
    e.num += w * Math.max(0, Math.min(1, p));
    e.den += w;
    e.n += 1;
    acc.set(k, e);
  }
  return [...acc.entries()]
    .map(([key, e]) => ({
      key,
      yesShare: e.den > 0 ? e.num / e.den : 0,
      weight: e.den,
      n: e.n,
    }))
    .sort((a, b) => b.weight - a.weight);
}

export function tvDistance(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return d / 2;
}
