import { PREDICT, SIM } from "@/lib/map/config";

async function req<T>(
  path: string,
  { method = "GET", body, timeout = 30000, signal }: {
    method?: string;
    body?: unknown;
    timeout?: number;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: T & { error?: string; message?: string };
    try {
      data = text ? JSON.parse(text) : ({} as T & { error?: string });
    } catch {
      data = { raw: text } as unknown as T & { error?: string; message?: string };
    }
    if (!res.ok) {
      const msg = data?.error || data?.message || text || res.statusText;
      throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`${method} ${path} timed out`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export interface CityInfo {
  slug: string;
  display: string;
  bbox?: { west: number; east: number; south: number; north: number };
  knowledge_date?: string;
  default?: boolean;
}

export interface MapAgent {
  id: number;
  name?: string;
  lonlat: [number, number];
  neighborhood?: string;
  age?: number;
  race_eth?: string;
  educ?: string;
  values?: Record<string, number>;
  persona?: string;
}

export interface PollResultSnake {
  question?: string;
  framing?: string;
  p_yes: number;
  ci_low: number;
  ci_high: number;
  n_agents: number;
  sample_rationales: string[];
  p_distribution?: [string, number][] | { label: string; p: number }[];
}

function normalizePoll(raw: Record<string, unknown>): PollResultSnake {
  const dist = raw.pDistribution ?? raw.p_distribution;
  let p_distribution: [string, number][] | undefined;
  if (Array.isArray(dist)) {
    p_distribution = dist.map((d) => {
      if (Array.isArray(d)) return [String(d[0]), Number(d[1])] as [string, number];
      const o = d as { label: string; p: number };
      return [o.label, o.p] as [string, number];
    });
  }
  return {
    question: String(raw.question ?? ""),
    framing: String(raw.framing ?? "vote"),
    p_yes: Number(raw.pYes ?? raw.p_yes ?? 0),
    ci_low: Number(raw.ciLow ?? raw.ci_low ?? 0),
    ci_high: Number(raw.ciHigh ?? raw.ci_high ?? 0),
    n_agents: Number(raw.nAgents ?? raw.n_agents ?? 0),
    sample_rationales: (raw.sampleRationales ?? raw.sample_rationales ?? []) as string[],
    p_distribution,
  };
}

export const getCities = () =>
  req<{ cities: CityInfo[] }>("/api/cities", { timeout: 12000 });

export const getNews = (city: string) =>
  req<{ articles: { headline: string; summary?: string; date?: string }[] }>(
    `/api/cities/${encodeURIComponent(city)}/news`,
    { timeout: 10000 },
  );

export const getChatter = (populationRunId: string, ids: number[]) =>
  req<{ chatter: Record<string, string> }>("/api/chatter", {
    method: "POST",
    body: { populationRunId, ids },
    timeout: 15000,
  });

export const parseQuestion = (question: string, signal?: AbortSignal) =>
  req<{
    supported: boolean;
    framing?: string;
    question: string;
    description: string;
    options: string[];
    reason?: string;
    examples?: string[];
  }>("/api/polls/parse", {
    method: "POST",
    body: { question, model: PREDICT.model },
    timeout: 60000,
    signal,
  });

export const createPopulation = (overrides: { n?: number; seed?: number } = {}) =>
  req<{ id: string; n: number; seed: number }>("/api/populations", {
    method: "POST",
    body: { ...SIM, ...overrides },
    timeout: 120000,
  });

export async function getDisplayAgents(
  populationRunId: string,
  count: number,
): Promise<MapAgent[]> {
  const page = await req<{
    agents: MapAgent[];
    total_matched: number;
  }>(
    `/api/populations/${encodeURIComponent(populationRunId)}/agents?sample=${count}`,
    { timeout: 60000 },
  );
  return page.agents || [];
}

export async function getAllAgents(
  populationRunId: string,
  onProgress?: (loaded: number, total: number) => void,
  cap = 50000,
): Promise<MapAgent[]> {
  const limit = 1000;
  let offset = 0;
  const out: MapAgent[] = [];
  while (offset < cap) {
    const page = await req<{
      agents: MapAgent[];
      total_matched: number;
    }>(
      `/api/populations/${encodeURIComponent(populationRunId)}/agents?limit=${limit}&offset=${offset}`,
      { timeout: 60000 },
    );
    const batch = page.agents || [];
    out.push(...batch);
    const total = page.total_matched ?? out.length;
    offset += limit;
    onProgress?.(out.length, total);
    if (out.length >= total || batch.length < limit) break;
  }
  return out;
}

export const poll = (
  populationRunId: string,
  payload: {
    question: string;
    description: string;
    framing: string;
    options?: string[];
    as_of_date?: string;
    model?: string;
  },
  signal?: AbortSignal,
) =>
  req<Record<string, unknown>>("/api/polls/run", {
    method: "POST",
    body: {
      populationRunId,
      question: payload.question,
      description: payload.description,
      framing: payload.framing,
      options: payload.options,
      asOfDate: payload.as_of_date ?? PREDICT.as_of_date,
      model: payload.model ?? PREDICT.model,
    },
    timeout: 180000,
    signal,
  }).then(normalizePoll);

export { SIM, PREDICT };
