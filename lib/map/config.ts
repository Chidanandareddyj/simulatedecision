import { DELHI_BBOX } from "@/lib/geo/delhi";

export const SIM = {
  n: 10000,
  seed: 42,
};

export const PREDICT = {
  as_of_date: "2026-06-13",
  model: "openai/gpt-4o",
};

export const TIMING = {
  revealMs: 3000,
  driftMs: 9000,
  fadeBackMs: 420,
};

export const MAP = {
  base: "/assets/delhi_tiles.png",
  sprites: "/assets/sprites.png",
  bbox: { ...DELHI_BBOX },
  detailZoomMul: 6.5,
};

export const COLORS = {
  water: "#215C81",
  ink: "#141414",
  inkSoft: "#6E7280",
  accent: "#141414",
  yes: "#2E9B4E",
  no: "#C0352F",
};
