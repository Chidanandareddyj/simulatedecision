import { NextRequest, NextResponse } from "next/server";
import { PollSpecSchema } from "@/lib/types";
import { loadResidents } from "@/lib/services/city";
import { runCounterfactual } from "@/lib/predict/engine";
import { createLlmClient } from "@/lib/llm/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const populationRunId = String(body.populationRunId ?? "");
    if (!populationRunId) {
      return NextResponse.json({ error: "populationRunId is required" }, { status: 400 });
    }

    const poll = PollSpecSchema.parse({
      question: body.question,
      description: body.description ?? "",
      framing: body.framing ?? "vote",
      asOfDate: body.asOfDate,
      options: body.options ?? [],
      model: body.model,
    });

    const event = body.event;
    if (!event?.text) {
      return NextResponse.json({ error: "event.text is required" }, { status: 400 });
    }

    const residents = await loadResidents(populationRunId);
    if (residents.length === 0) {
      return NextResponse.json({ error: "Population not found" }, { status: 404 });
    }

    const llm = createLlmClient();
    const result = await runCounterfactual(
      residents,
      poll,
      { text: event.text, asOfDate: event.asOfDate ?? poll.asOfDate },
      llm,
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Counterfactual failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
