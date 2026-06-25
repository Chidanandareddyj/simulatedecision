import { StateGraph, Annotation } from "@langchain/langgraph";
import type { CityProfile, PollResult, PollSpec, SyntheticResidentRecord } from "@/lib/types";
import { DELHI_PROFILE } from "@/lib/data/delhi-profile";
import { runPoll, type RunPollOptions } from "@/lib/predict/engine";
import { createLlmClient } from "@/lib/llm/client";

const PollState = Annotation.Root({
  residents: Annotation<SyntheticResidentRecord[]>,
  poll: Annotation<PollSpec>,
  profile: Annotation<CityProfile>,
  result: Annotation<PollResult | null>,
  cacheHit: Annotation<boolean>,
  error: Annotation<string | null>,
});

export async function executePollGraph(
  residents: SyntheticResidentRecord[],
  poll: PollSpec,
  opts?: Partial<RunPollOptions>,
): Promise<PollResult & { cacheHit: boolean }> {
  const llm = opts?.llm ?? createLlmClient();
  const profile = opts?.profile ?? DELHI_PROFILE;

  const graph = new StateGraph(PollState)
    .addNode("cluster", async (state) => state)
    .addNode("llm", async (state) => {
      const result = await runPoll({
        residents: state.residents,
        poll: state.poll,
        profile: state.profile,
        llm,
        seed: opts?.seed,
        maxClusters: opts?.maxClusters,
        batchSize: opts?.batchSize,
      });
      return { result, cacheHit: result.cacheHit };
    })
    .addNode("aggregate", async (state) => state)
    .addEdge("__start__", "cluster")
    .addEdge("cluster", "llm")
    .addEdge("llm", "aggregate")
    .addEdge("aggregate", "__end__");

  const compiled = graph.compile();
  const final = await compiled.invoke({
    residents,
    poll,
    profile,
    result: null,
    cacheHit: false,
    error: null,
  });

  if (!final.result) throw new Error("Poll graph failed to produce result");
  return { ...final.result, cacheHit: final.cacheHit };
}
