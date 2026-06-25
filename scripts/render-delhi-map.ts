/**
 * Generate a stylized pixel-art Delhi map PNG for the frontend land mask.
 * Water pixels use rgb(33, 92, 129) — blue-dominant for SFMap land detection.
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import delhiMap from "../data/geo/delhi-map.json";

const W = delhiMap.imageSize.width;
const H = delhiMap.imageSize.height;
const WATER = { r: 33, g: 92, b: 129 };
const GRASS = { r: 120, g: 168, b: 88 };
const ROAD = { r: 180, g: 175, b: 160 };
const PARK = { r: 95, g: 145, b: 72 };
const SAND = { r: 210, g: 195, b: 150 };

const DISTRICT_COLORS: Record<string, { r: number; g: number; b: number }> = {
  "North West": { r: 140, g: 155, b: 110 },
  North: { r: 130, g: 148, b: 105 },
  "North East": { r: 125, g: 142, b: 98 },
  East: { r: 135, g: 150, b: 108 },
  "New Delhi": { r: 155, g: 165, b: 120 },
  Central: { r: 145, g: 158, b: 112 },
  West: { r: 128, g: 145, b: 100 },
  "South West": { r: 118, g: 138, b: 95 },
  South: { r: 122, g: 140, b: 96 },
};

function lonlatToPx(lon: number, lat: number): { x: number; y: number } {
  const b = delhiMap.bbox;
  return {
    x: ((lon - b.west) / (b.east - b.west)) * W,
    y: ((b.north - lat) / (b.north - b.south)) * H,
  };
}

function fillCircle(
  data: Buffer,
  cx: number,
  cy: number,
  radius: number,
  color: { r: number; g: number; b: number },
) {
  const r2 = radius * radius;
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        const i = (y * W + x) * 4;
        data[i] = color.r;
        data[i + 1] = color.g;
        data[i + 2] = color.b;
        data[i + 3] = 255;
      }
    }
  }
}

function drawRiver(data: Buffer) {
  // Yamuna runs roughly north-south through east Delhi
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const cx = W * (0.58 + 0.04 * Math.sin(t * Math.PI * 3));
    const width = 28 + 12 * Math.sin(t * Math.PI * 2);
    for (let x = 0; x < W; x++) {
      if (Math.abs(x - cx) < width) {
        const i = (y * W + x) * 4;
        data[i] = WATER.r;
        data[i + 1] = WATER.g;
        data[i + 2] = WATER.b;
        data[i + 3] = 255;
      }
    }
  }
}

function drawRoads(data: Buffer) {
  const roads = [
    { y: H * 0.35, x0: W * 0.1, x1: W * 0.9 },
    { y: H * 0.55, x0: W * 0.15, x1: W * 0.85 },
    { y: H * 0.72, x0: W * 0.2, x1: W * 0.8 },
    { x: W * 0.45, y0: H * 0.15, y1: H * 0.85 },
    { x: W * 0.62, y0: H * 0.1, y1: H * 0.9 },
  ];
  for (const rd of roads) {
    if ("y" in rd && rd.y !== undefined) {
      const y = Math.round(rd.y);
      for (let x = Math.round(rd.x0); x <= Math.round(rd.x1); x++) {
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy >= 0 && yy < H && x >= 0 && x < W) {
            const i = (yy * W + x) * 4;
            data[i] = ROAD.r;
            data[i + 1] = ROAD.g;
            data[i + 2] = ROAD.b;
            data[i + 3] = 255;
          }
        }
      }
    } else if ("x" in rd && rd.x !== undefined) {
      const x = Math.round(rd.x);
      for (let y = Math.round(rd.y0); y <= Math.round(rd.y1); y++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (y >= 0 && y < H && xx >= 0 && xx < W) {
            const i = (y * W + xx) * 4;
            data[i] = ROAD.r;
            data[i + 1] = ROAD.g;
            data[i + 2] = ROAD.b;
            data[i + 3] = 255;
          }
        }
      }
    }
  }
}

async function main() {
  const data = Buffer.alloc(W * H * 4);
  // fill water background
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    data[p] = WATER.r;
    data[p + 1] = WATER.g;
    data[p + 2] = WATER.b;
    data[p + 3] = 255;
  }

  drawRiver(data);

  for (const d of delhiMap.districts) {
    const { x, y } = lonlatToPx(d.lon, d.lat);
    const color = DISTRICT_COLORS[d.name] ?? GRASS;
    fillCircle(data, x, y, 95, color);
    fillCircle(data, x, y, 40, PARK);
  }

  for (const w of delhiMap.wards) {
    const { x, y } = lonlatToPx(w.lon, w.lat);
    fillCircle(data, x, y, 18, SAND);
  }

  drawRoads(data);

  const outPath = path.join(process.cwd(), "public", "assets", "delhi_tiles.png");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath);
  console.log(`Wrote ${outPath} (${W}x${H})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
