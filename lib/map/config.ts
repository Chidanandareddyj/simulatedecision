import { DELHI_BBOX } from "@/lib/geo/delhi";

export const SIM = {
  n: 10000,
  seed: 42,
};

/** Visible map sprites — independent of SIM.n (full population used for polls). */
export const MAP_SPRITE_COUNT = 10000;

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
  base: "/assets/Delhi.png",
  sprites: "/assets/sprites.png",
  bbox: { ...DELHI_BBOX },
  detailZoomMul: 6.5,
  /** Normalized image rect (0–1) to keep sprites off the legend / scale (top-right). */
  uiExclusion: { x0: 0.66, y0: 0, x1: 1, y1: 0.4 },
};

export const COLORS = {
  water: "#215C81",
  ink: "#141414",
  inkSoft: "#6E7280",
  accent: "#141414",
  yes: "#2E9B4E",
  no: "#C0352F",
};
