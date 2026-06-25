export type Verdict = "yes" | "no";

export interface VerdictAgent {
  hx: number;
  hy: number;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeField(rng: () => number, w: number, h: number) {
  const waves: { kx: number; ky: number; ph: number; amp: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const freq = (0.6 + rng() * 2.4) / Math.max(w, h);
    const ang = rng() * Math.PI * 2;
    waves.push({
      kx: Math.cos(ang) * freq * Math.PI * 2,
      ky: Math.sin(ang) * freq * Math.PI * 2,
      ph: rng() * Math.PI * 2,
      amp: 0.5 + rng() * 0.5,
    });
  }
  return (x: number, y: number) => {
    let v = 0;
    for (const wv of waves) v += wv.amp * Math.sin(x * wv.kx + y * wv.ky + wv.ph);
    return v;
  };
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function assignVerdicts(
  agents: VerdictAgent[],
  pYes: number,
  question: string,
  planarSize: { w: number; h: number },
): Verdict[] {
  const rng = mulberry32(hashString(question || "predict") ^ 0x9e3779b9);
  const field = makeField(rng, planarSize.w, planarSize.h);
  const scored = agents.map((a, i) => ({
    i,
    v: field(a.hx, a.hy) + (rng() - 0.5) * 0.7,
  }));
  scored.sort((p, q) => p.v - q.v);
  const yesCount = Math.round(clamp01(pYes) * agents.length);
  const verdict: Verdict[] = new Array(agents.length).fill("no");
  for (let k = 0; k < yesCount; k++) verdict[scored[k].i] = "yes";
  return verdict;
}
