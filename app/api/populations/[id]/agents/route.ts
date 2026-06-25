import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ageBandMidpoint } from "@/lib/geo/delhi";
import type { ValueVector } from "@/lib/types";

function mapValuesForFrontend(values: ValueVector) {
  return {
    economic: values.economic,
    social: values.social,
    trust: values.trust,
    change: values.change,
    s_housing: values.housing,
    s_crime: values.crime,
    s_cost: values.cost,
    s_environment: values.environment,
    s_immigration: values.migration,
    s_homeless: values.housing * 0.5,
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") ?? 1000)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

    const total = await prisma.syntheticResident.count({ where: { populationRunId: id } });
    if (total === 0) {
      return NextResponse.json({ error: "Population not found" }, { status: 404 });
    }

    const rows = await prisma.syntheticResident.findMany({
      where: { populationRunId: id },
      orderBy: { idx: "asc" },
      skip: offset,
      take: limit,
    });

    const agents = rows.map((r) => ({
      id: r.idx,
      dbId: r.id,
      name: r.name,
      lonlat: [r.lon, r.lat],
      neighborhood: r.district,
      ward: r.ward,
      age: ageBandMidpoint(r.ageBand),
      age_band: r.ageBand,
      sex: r.sex,
      educ: r.education,
      religion: r.religion,
      values: mapValuesForFrontend(r.values as unknown as ValueVector),
      persona: r.persona,
    }));

    return NextResponse.json({
      population_run_id: id,
      total_matched: total,
      offset,
      count: agents.length,
      agents,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load agents";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
