import type { SyntheticResidentRecord } from "@/lib/types";

export interface Cluster {
  repIdx: number;
  memberIdx: number[];
}

function archetypeKeyLevel(r: SyntheticResidentRecord, level: number): string {
  switch (level) {
    case 0:
      return `${r.ageBand}|${r.religion}|${r.education}|${r.district}|${r.workerStatus}|${r.scst}`;
    case 1:
      return `${r.ageBand}|${r.religion}|${r.education}|${r.district}`;
    case 2:
      return `${r.ageBand}|${r.religion}|${r.education}`;
    default:
      return `${r.ageBand}|${r.education}`;
  }
}

export function clusterResidents(residents: SyntheticResidentRecord[], maxClusters: number): Cluster[] {
  for (let level = 0; level < 4; level++) {
    const map = new Map<string, number[]>();
    for (let i = 0; i < residents.length; i++) {
      const key = archetypeKeyLevel(residents[i], level);
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    }
    if (map.size <= maxClusters || level === 3) {
      const clusters = [...map.values()].map((memberIdx) => ({
        repIdx: memberIdx[0],
        memberIdx,
      }));
      clusters.sort((a, b) => a.repIdx - b.repIdx);
      return clusters;
    }
  }
  return [];
}
