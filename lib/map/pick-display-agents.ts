/** Evenly subsample agents for map display (polls still use the full population). */
export function pickDisplayAgents<T>(all: T[], count: number): T[] {
  if (all.length <= count) return all;
  const step = all.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(all.length - 1, Math.floor(i * step + step * 0.5));
    out.push(all[idx]);
  }
  return out;
}
