import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PollSpecSchema } from "@/lib/types";
import { loadResidents } from "@/lib/services/city";
import { executePollGraph } from "@/lib/graphs/poll-graph";

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
      asOfDate: body.asOfDate ?? new Date().toISOString().slice(0, 10),
      population: body.population,
      options: body.options ?? [],
      model: body.model,
      event: body.event,
    });

    const residents = await loadResidents(populationRunId);
    if (residents.length === 0) {
      return NextResponse.json({ error: "Population not found" }, { status: 404 });
    }

    const result = await executePollGraph(residents, poll, { seed: body.seed ?? 42 });

    await prisma.pollRun.create({
      data: {
        populationRunId,
        question: poll.question,
        description: poll.description,
        framing: poll.framing,
        asOfDate: poll.asOfDate,
        model: result.model,
        population: poll.population ?? null,
        options: poll.options,
        result: result as object,
        cacheHit: result.cacheHit,
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Poll run failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
