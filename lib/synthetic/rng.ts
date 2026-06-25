/** Deterministic PRNG matching simfrancisco's ChaCha8-style seeding semantics. */

export function agentSeed(simSeed: number, idx: number): number {
  const buf = new ArrayBuffer(16);
  const view = new DataView(buf);
  view.setBigUint64(0, BigInt(simSeed), true);
  view.setBigUint64(8, BigInt(idx), true);
  const bytes = new Uint8Array(buf);
  let h = 0xcbf29ce484222325n;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return Number(h & 0xffffffffffffffffn);
}

export class SeededRng {
  private state: bigint;

  constructor(seed: number) {
    this.state = BigInt(seed) || 1n;
  }

  next(): number {
    this.state = (this.state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    return Number(this.state >> 33n) / 0x80000000;
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  pickWeighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

export function sampleIndices(n: number, poolSize: number, seed: number): number[] {
  const rng = new SeededRng(seed);
  if (n <= poolSize) {
    const pool = Array.from({ length: poolSize }, (_, i) => i);
    for (let i = 0; i < n; i++) {
      const j = i + rng.nextInt(poolSize - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  }
  return Array.from({ length: n }, () => rng.nextInt(poolSize));
}
