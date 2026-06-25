import { NextRequest, NextResponse } from "next/server";
import { createPopulationRun } from "@/lib/services/city";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const n = Number(body.n ?? 2000);
    const seed = Number(body.seed ?? process.env.POPULATION_SEED ?? 42);

    if (n < 100 || n > 50000) {
      return NextResponse.json({ error: "n must be between 100 and 50000" }, { status: 400 });
    }

    const { run, residents } = await createPopulationRun(n, seed);
    return NextResponse.json({
      id: run.id,
      seed: run.seed,
      n: run.n,
      nctPop: run.nctPop,
      tvScores: run.tvScores,
      createdAt: run.createdAt,
      sampleSize: residents.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create population";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
