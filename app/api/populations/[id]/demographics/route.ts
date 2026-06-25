import { NextRequest, NextResponse } from "next/server";
import { demographicsFromResidents, loadResidents } from "@/lib/services/city";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const residents = await loadResidents(id);
    if (residents.length === 0) {
      return NextResponse.json({ error: "Population not found" }, { status: 404 });
    }
    return NextResponse.json(demographicsFromResidents(residents));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load demographics";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
