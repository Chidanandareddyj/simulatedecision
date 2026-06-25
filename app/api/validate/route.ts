import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadResidents } from "@/lib/services/city";
import { computeMarginalFit, loadDelhiRubric } from "@/lib/validation/marginal-fit";
import { runPoll } from "@/lib/predict/engine";
import { createLlmClient } from "@/lib/llm/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const kind = String(body.kind ?? "marginals");
    const populationRunId = body.populationRunId ? String(body.populationRunId) : null;

    if (kind === "marginals") {
      if (!populationRunId) {
        return NextResponse.json({ error: "populationRunId required for marginal validation" }, { status: 400 });
      }
      const residents = await loadResidents(populationRunId);
      const fit = computeMarginalFit(residents);
      await prisma.validationRun.create({
        data: { kind: "marginals", result: fit, passed: fit.passed },
      });
      return NextResponse.json(fit);
    }

    if (kind === "rubric") {
      const rubric = loadDelhiRubric();
      if (!populationRunId) {
        return NextResponse.json({ error: "populationRunId required for rubric validation" }, { status: 400 });
      }
      const residents = await loadResidents(populationRunId);
      const llm = createLlmClient();
      const rows = [];

      for (const entry of rubric.elections_measures ?? []) {
        const result = await runPoll({
          residents,
          poll: {
            question: entry.question,
            description: entry.description,
            framing: "vote",
            asOfDate: entry.as_of_date,
            model: entry.model,
          },
          llm,
        });
        const err = Math.abs(result.pYes - (entry.target_share ?? 0));
        const tol = entry.tolerance ?? 0.1;
        rows.push({
          id: entry.id,
          predicted: result.pYes,
          target: entry.target_share,
          absError: err,
          passed: err <= tol,
          leakage_warning: entry.leakage_warning,
        });
      }

      const passed = rows.length ? rows.filter((r) => r.passed).length / rows.length >= rubric.thresholds.weighted_score_min : true;
      const out = { kind: "rubric", entries: rows, passed, threshold: rubric.thresholds.weighted_score_min };
      await prisma.validationRun.create({ data: { kind: "rubric", result: out, passed } });
      return NextResponse.json(out);
    }

    return NextResponse.json({ error: "kind must be marginals or rubric" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Validation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
