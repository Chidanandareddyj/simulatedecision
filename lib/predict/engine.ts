import type { CityProfile, ParsedQuestion, PollResult, PollSpec, SyntheticResidentRecord } from "@/lib/types";
import { DELHI_PROFILE } from "@/lib/data/delhi-profile";
import { clusterResidents } from "@/lib/predict/cluster";
import { buildBatchPrompt, extractJson, systemPrompt } from "@/lib/predict/prompts";
import {
  breakdown,
  designEffect,
  effectiveN,
  weightedBootstrapCi,
  weightedDistribution,
  weightedYesShare,
  type WeightedAnswer,
} from "@/lib/predict/aggregate";
import type { LlmClient } from "@/lib/llm/client";

export interface RunPollOptions {
  residents: SyntheticResidentRecord[];
  poll: PollSpec;
  profile?: CityProfile;
  llm?: LlmClient;
  seed?: number;
  maxClusters?: number;
  batchSize?: number;
}

export async function runPoll(opts: RunPollOptions): Promise<PollResult & { cacheHit: boolean }> {
  const profile = opts.profile ?? DELHI_PROFILE;
  const llm = opts.llm ?? (await import("@/lib/llm/client")).createLlmClient();
  const maxClusters = opts.maxClusters ?? Number(process.env.MAX_CLUSTERS ?? 160);
  const batchSize = opts.batchSize ?? 12;
  const model = opts.poll.model ?? process.env.DEFAULT_MODEL ?? "openai/gpt-4o";
  const seed = opts.seed ?? 42;

  const clusters = clusterResidents(opts.residents, maxClusters);
  const sys = systemPrompt(opts.poll.framing, profile);
  const isOptions = opts.poll.framing === "options" && opts.poll.options.length >= 2;
  const nOpts = isOptions ? opts.poll.options.length : 2;

  const pByCluster: number[] = clusters.map(() => 0.5);
  const distByCluster: number[][] = clusters.map(() => Array(nOpts).fill(1 / nOpts));
  const rationales: string[] = clusters.map(() => "");
  let anyCacheHit = false;
  let calls = 0;

  for (let batchStart = 0; batchStart < clusters.length; batchStart += batchSize) {
    const end = Math.min(batchStart + batchSize, clusters.length);
    const profiles = [];
    for (let ci = batchStart; ci < end; ci++) {
      const rep = opts.residents[clusters[ci].repIdx];
      profiles.push({ idx: ci, persona: rep.persona });
    }

    const user = buildBatchPrompt(
      {
        question: opts.poll.question,
        description: opts.poll.description,
        framing: opts.poll.framing,
        asOfDate: opts.poll.asOfDate,
        options: opts.poll.options,
        event: opts.poll.event,
      },
      profiles,
      profile.promptName,
    );

    const { text, cacheHit } = await llm.complete({ model, system: sys, user });
    if (cacheHit) anyCacheHit = true;
    calls++;

    const parsed = extractJson(text);
    if (Array.isArray(parsed)) {
      for (let k = 0; k < parsed.length && batchStart + k < end; k++) {
        const item = parsed[k] as Record<string, unknown>;
        const ci = batchStart + k;
        if (isOptions && Array.isArray(item.dist)) {
          const dist = (item.dist as number[]).map((x) => Number(x));
          const sum = dist.reduce((a, b) => a + b, 0);
          distByCluster[ci] = sum > 0 ? dist.map((x) => x / sum) : distByCluster[ci];
        } else if (typeof item.p_yes === "number") {
          pByCluster[ci] = Math.max(0, Math.min(1, item.p_yes));
        }
        if (typeof item.why === "string") rationales[ci] = item.why;
      }
    }
  }

  const weights = opts.residents.map((r) => r.weight);
  let answers: [number, number][];
  let pDistribution: { label: string; p: number }[] = [];

  if (isOptions) {
    const weighted: WeightedAnswer[] = opts.residents.map((r, i) => {
      const ci = clusters.findIndex((c) => c.memberIdx.includes(i));
      const probs = distByCluster[ci >= 0 ? ci : 0];
      return { weight: r.weight, probs };
    });
    const dist = weightedDistribution(weighted, nOpts);
    pDistribution = opts.poll.options.map((label, i) => ({ label, p: dist[i] ?? 0 }));
    answers = opts.residents.map((r, i) => {
      const ci = clusters.findIndex((c) => c.memberIdx.includes(i));
      const probs = distByCluster[ci >= 0 ? ci : 0];
      const pYes = probs[0] ?? 0.5;
      return [r.weight, pYes] as [number, number];
    });
  } else {
    answers = opts.residents.map((r, i) => {
      const ci = clusters.findIndex((c) => c.memberIdx.includes(i));
      const p = pByCluster[ci >= 0 ? ci : 0];
      return [r.weight, p] as [number, number];
    });
  }

  const pYes = weightedYesShare(answers);
  const [ciLow, ciHigh] = weightedBootstrapCi(answers, 500, 0.05, seed);
  const neff = effectiveN(weights);
  const deff = designEffect(weights);

  const pByResident = (i: number) => answers[i][1];
  const breakdowns: Record<string, { key: string; yesShare: number; weight: number; n: number }[]> = {
    age: breakdown(opts.residents.map((r, i) => [r.ageBand, r.weight, pByResident(i)] as const)),
    sex: breakdown(opts.residents.map((r, i) => [r.sex, r.weight, pByResident(i)] as const)),
    education: breakdown(opts.residents.map((r, i) => [r.education, r.weight, pByResident(i)] as const)),
    religion: breakdown(opts.residents.map((r, i) => [r.religion, r.weight, pByResident(i)] as const)),
    scst: breakdown(opts.residents.map((r, i) => [r.scst, r.weight, pByResident(i)] as const)),
    workerStatus: breakdown(opts.residents.map((r, i) => [r.workerStatus, r.weight, pByResident(i)] as const)),
    district: breakdown(opts.residents.map((r, i) => [r.district, r.weight, pByResident(i)] as const)),
  };

  const sampleRationales = rationales.filter(Boolean).slice(0, 5);

  return {
    question: opts.poll.question,
    asOfDate: opts.poll.asOfDate,
    model,
    pYes,
    ciLow,
    ciHigh,
    nAgents: opts.residents.length,
    nEff: neff,
    designEffect: deff,
    breakdowns,
    nArchetypes: clusters.length,
    nLlmCalls: calls,
    sampleRationales,
    pDistribution,
    cacheHit: anyCacheHit,
  };
}

export async function parseQuestion(
  raw: string,
  cityName: string,
  llm: LlmClient,
  model?: string,
): Promise<ParsedQuestion> {
  const sys = `You are a question router for a synthetic-population opinion simulator for ${cityName}. Return JSON only: {"supported":bool,"framing":"vote"|"belief"|"options","question":str,"description":str,"options":str[],"reason":str,"examples":str[]}`;
  const user = `Raw question: ${raw}`;
  const { text } = await llm.complete({ model, system: sys, user, maxTokens: 800 });
  const parsed = extractJson(text) as ParsedQuestion | null;
  if (parsed && typeof parsed.supported === "boolean") return parsed;
  return {
    supported: false,
    question: "",
    description: "",
    options: [],
    reason: "Could not parse question",
    examples: [`Will ${cityName} voters support a new Metro line?`, `Which party would win the next Delhi Assembly election?`],
  };
}

export async function runCounterfactual(
  residents: SyntheticResidentRecord[],
  basePoll: PollSpec,
  event: { text: string; asOfDate: string },
  llm: LlmClient,
): Promise<{ pYesBefore: number; pYesAfter: number; delta: number }> {
  const before = await runPoll({ residents, poll: basePoll, llm });
  const afterPoll: PollSpec = {
    ...basePoll,
    event: { text: event.text, asOfDate: event.asOfDate },
    asOfDate: event.asOfDate,
  };
  const after = await runPoll({ residents, poll: afterPoll, llm });
  return { pYesBefore: before.pYes, pYesAfter: after.pYes, delta: after.pYes - before.pYes };
}
