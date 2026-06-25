import delhiMap from "@/data/geo/delhi-map.json";
import { SeededRng } from "@/lib/synthetic/rng";

export interface DelhiBbox {
  west: number;
  east: number;
  south: number;
  north: number;
}

export const DELHI_BBOX: DelhiBbox = delhiMap.bbox;
export const DELHI_IMAGE_SIZE = delhiMap.imageSize;

const wardByName = new Map(delhiMap.wards.map((w) => [w.ward, w]));

export function lonlatForWard(ward: string, seed: number): { lon: number; lat: number } {
  const base = wardByName.get(ward);
  if (!base) {
    const cx = (DELHI_BBOX.west + DELHI_BBOX.east) / 2;
    const cy = (DELHI_BBOX.south + DELHI_BBOX.north) / 2;
    return { lon: cx, lat: cy };
  }
  const rng = new SeededRng(seed ^ 0x9e3779b9);
  const jitterLon = (rng.next() - 0.5) * 0.018;
  const jitterLat = (rng.next() - 0.5) * 0.014;
  return {
    lon: Math.max(DELHI_BBOX.west, Math.min(DELHI_BBOX.east, base.lon + jitterLon)),
    lat: Math.max(DELHI_BBOX.south, Math.min(DELHI_BBOX.north, base.lat + jitterLat)),
  };
}

export function lonlatToPixel(
  lon: number,
  lat: number,
  imgW: number,
  imgH: number,
  bbox: DelhiBbox = DELHI_BBOX,
): { x: number; y: number } {
  return {
    x: ((lon - bbox.west) / (bbox.east - bbox.west)) * imgW,
    y: ((bbox.north - lat) / (bbox.north - bbox.south)) * imgH,
  };
}

export function ageBandMidpoint(ageBand: string): number {
  const map: Record<string, number> = {
    "0-14": 10,
    "15-24": 20,
    "25-44": 34,
    "45-59": 52,
    "60+": 68,
  };
  return map[ageBand] ?? 35;
}
