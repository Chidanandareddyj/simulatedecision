import { NextRequest, NextResponse } from "next/server";
import { parseQuestion } from "@/lib/predict/engine";
import { createLlmClient } from "@/lib/llm/client";
import { DELHI_PROFILE } from "@/lib/data/delhi-profile";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "");
    if (!question.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    const llm = createLlmClient();
    const parsed = await parseQuestion(question, DELHI_PROFILE.promptName, llm, body.model);
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
