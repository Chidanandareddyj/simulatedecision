import { NextRequest, NextResponse } from "next/server";
import delhiNews from "@/data/news/delhi.json";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ city: string }> }) {
  const { city } = await ctx.params;
  if (city !== "delhi") {
    return NextResponse.json({ error: "City not found" }, { status: 404 });
  }
  return NextResponse.json(delhiNews);
}
