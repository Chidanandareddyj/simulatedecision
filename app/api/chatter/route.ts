import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createLlmClient } from "@/lib/llm/client";

const FALLBACK_THOUGHTS = [
  "Metro's packed again today",
  "the air feels heavy this morning",
  "water tanker came late",
  "rent went up again",
  "AAP clinic saved us a trip",
  "traffic on Ring Road is brutal",
  "power cut in the afternoon",
  "school fees keep rising",
  "neighbourhood feels safer lately",
  "waiting for the monsoon",
];

function fallbackThought(persona: string, id: string): string {
  const hash = [...id].reduce((h, c) => ((h * 31) ^ c.charCodeAt(0)) >>> 0, 0);
  const snippet = persona.split(".")[0]?.slice(0, 80);
  if (snippet && snippet.length > 20) return snippet;
  return FALLBACK_THOUGHTS[hash % FALLBACK_THOUGHTS.length];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const populationRunId = String(body.populationRunId ?? "");
    const ids = (body.ids ?? []).map((id: string | number) => String(id)).slice(0, 12);
    if (!populationRunId || ids.length === 0) {
      return NextResponse.json({ chatter: {} });
    }

    const idxs = ids.map((id: string) => Number(id)).filter((n: number) => !Number.isNaN(n));
    const rows = await prisma.syntheticResident.findMany({
      where: { populationRunId, idx: { in: idxs } },
    });

    const chatter: Record<string, string> = {};
    for (const r of rows) {
      chatter[String(r.idx)] = fallbackThought(r.persona, r.id);
    }

    const key = process.env.OPENROUTER_API_KEY;
    if (key && rows.length > 0) {
      try {
        const llm = createLlmClient();
        const brief = rows
          .map((r) => `#${r.idx}: ${r.persona.slice(0, 120)}`)
          .join("\n");
        const res = await llm.complete({
          model: "openai/gpt-4o-mini",
          system:
            "You write one short inner thought (max 12 words) per Delhi resident. Return JSON object mapping id strings to thoughts. Casual, first-person.",
          user: `Residents:\n${brief}\n\nReturn JSON like {"0":"thought",...} for ids: ${rows.map((r) => r.idx).join(", ")}`,
          maxTokens: 400,
        });
        const parsed = JSON.parse(res.text.replace(/```json\n?|\n?```/g, "").trim()) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          if (v) chatter[k] = String(v).slice(0, 120);
        }
      } catch {
        // keep fallbacks
      }
    }

    return NextResponse.json({ chatter });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chatter failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
