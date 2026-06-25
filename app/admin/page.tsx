"use client";

import { useCallback, useState } from "react";

type Tab = "poll" | "validation";

interface PopulationInfo {
  id: string;
  seed: number;
  n: number;
  tvScores?: Record<string, number>;
}

interface ParsedPreview {
  supported: boolean;
  framing?: string;
  question: string;
  description: string;
  options: string[];
  reason?: string;
  examples?: string[];
}

interface PollResult {
  pYes: number;
  ciLow: number;
  ciHigh: number;
  nAgents: number;
  nEff: number;
  designEffect: number;
  nArchetypes: number;
  nLlmCalls: number;
  sampleRationales: string[];
  cacheHit?: boolean;
  breakdowns: Record<string, { key: string; yesShare: number; n: number }[]>;
  pDistribution?: { label: string; p: number }[];
}

interface MarginalFit {
  passed: boolean;
  maxTv: number;
  scores: { dimension: string; tvDistance: number; constrained: boolean; labels: string[]; observed: number[]; target: number[] }[];
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("poll");
  const [n, setN] = useState(2000);
  const [seed, setSeed] = useState(42);
  const [population, setPopulation] = useState<PopulationInfo | null>(null);
  const [question, setQuestion] = useState("");
  const [parsed, setParsed] = useState<ParsedPreview | null>(null);
  const [result, setResult] = useState<PollResult | null>(null);
  const [marginalFit, setMarginalFit] = useState<MarginalFit | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const createPopulation = useCallback(async () => {
    setLoading("population");
    setError("");
    try {
      const res = await fetch("/api/populations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n, seed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPopulation(data);
      setResult(null);
      setMarginalFit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading("");
    }
  }, [n, seed]);

  const parseQuestion = useCallback(async () => {
    if (!question.trim()) return;
    setLoading("parse");
    setError("");
    try {
      const res = await fetch("/api/polls/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      setParsed(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading("");
    }
  }, [question]);

  const runPoll = useCallback(async () => {
    if (!population || !parsed?.supported) return;
    setLoading("poll");
    setError("");
    try {
      const res = await fetch("/api/polls/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          populationRunId: population.id,
          question: parsed.question,
          description: parsed.description,
          framing: parsed.framing ?? "vote",
          asOfDate: new Date().toISOString().slice(0, 10),
          options: parsed.options ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Poll failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading("");
    }
  }, [population, parsed]);

  const runMarginalValidation = useCallback(async () => {
    if (!population) return;
    setLoading("validate");
    setError("");
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "marginals", populationRunId: population.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
      setMarginalFit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading("");
    }
  }, [population]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Delhi Census Twin</h1>
            <p className="text-sm text-stone-400">Census 2011 synthetic population · NCT Delhi</p>
          </div>
          <nav className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("poll")}
              className={`rounded px-3 py-1.5 text-sm ${tab === "poll" ? "bg-amber-600 text-white" : "bg-stone-800"}`}
            >
              Poll
            </button>
            <button
              type="button"
              onClick={() => setTab("validation")}
              className={`rounded px-3 py-1.5 text-sm ${tab === "validation" ? "bg-amber-600 text-white" : "bg-stone-800"}`}
            >
              Validation
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {error && (
          <div className="rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        <section className="rounded-lg border border-stone-800 bg-stone-900/50 p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-400">Population</h2>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              N
              <input
                type="number"
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                className="ml-2 w-24 rounded border border-stone-700 bg-stone-800 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              Seed
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="ml-2 w-24 rounded border border-stone-700 bg-stone-800 px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={createPopulation}
              disabled={!!loading}
              className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
            >
              {loading === "population" ? "Building…" : "Generate population"}
            </button>
          </div>
          {population && (
            <p className="mt-3 text-sm text-stone-400">
              Run <code className="text-amber-400">{population.id.slice(0, 12)}…</code> · n={population.n} · seed={population.seed}
            </p>
          )}
        </section>

        {tab === "poll" && (
          <>
            <section className="rounded-lg border border-stone-800 bg-stone-900/50 p-5">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-400">Ask</h2>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Do Delhi voters support expanding the Metro network?"
                rows={3}
                className="w-full rounded border border-stone-700 bg-stone-800 px-3 py-2 text-sm"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={parseQuestion}
                  disabled={!!loading || !question.trim()}
                  className="rounded bg-stone-700 px-4 py-1.5 text-sm hover:bg-stone-600 disabled:opacity-50"
                >
                  {loading === "parse" ? "Parsing…" : "Parse question"}
                </button>
                <button
                  type="button"
                  onClick={runPoll}
                  disabled={!!loading || !population || !parsed?.supported}
                  className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
                >
                  {loading === "poll" ? "Running poll…" : "Run poll"}
                </button>
              </div>
            </section>

            {parsed && (
              <section className="rounded-lg border border-stone-800 bg-stone-900/50 p-5">
                <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">Parsed preview</h2>
                {!parsed.supported ? (
                  <p className="text-sm text-amber-300">{parsed.reason}</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-stone-500">Framing:</span> {parsed.framing}</p>
                    <p><span className="text-stone-500">Question:</span> {parsed.question}</p>
                    <p><span className="text-stone-500">Description:</span> {parsed.description}</p>
                  </div>
                )}
              </section>
            )}

            {result && (
              <section className="rounded-lg border border-amber-900/50 bg-stone-900/80 p-5">
                <h2 className="mb-3 text-lg font-semibold">Result</h2>
                <p className="text-3xl font-bold text-amber-400">{(result.pYes * 100).toFixed(1)}% yes</p>
                <p className="text-sm text-stone-400">
                  95% CI: {(result.ciLow * 100).toFixed(1)}% – {(result.ciHigh * 100).toFixed(1)}% · n_eff={result.nEff.toFixed(0)} · DE={result.designEffect.toFixed(2)}
                  {result.cacheHit && " · cache hit"}
                </p>
                {result.sampleRationales.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs uppercase text-stone-500">Sample rationales</h3>
                    <ul className="mt-1 list-disc pl-5 text-sm text-stone-300">
                      {result.sampleRationales.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Object.entries(result.breakdowns).map(([dim, rows]) => (
                  <div key={dim} className="mt-4">
                    <h3 className="text-xs uppercase text-stone-500">{dim}</h3>
                    <div className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                      {rows.slice(0, 6).map((r) => (
                        <div key={r.key} className="flex justify-between rounded bg-stone-800/60 px-2 py-1">
                          <span>{r.key}</span>
                          <span className="text-amber-400">{(r.yesShare * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {tab === "validation" && (
          <section className="rounded-lg border border-stone-800 bg-stone-900/50 p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-400">Census marginal fit</h2>
            <p className="mb-4 text-sm text-stone-400">
              Compares synthetic population marginals to Census 2011 NCT targets. TV distance ≤ 0.05 on constrained dimensions.
            </p>
            <button
              type="button"
              onClick={runMarginalValidation}
              disabled={!!loading || !population}
              className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
            >
              {loading === "validate" ? "Validating…" : "Run marginal validation"}
            </button>
            {marginalFit && (
              <div className="mt-4">
                <p className={`text-sm font-medium ${marginalFit.passed ? "text-green-400" : "text-amber-400"}`}>
                  {marginalFit.passed ? "PASSED" : "NEEDS REVIEW"} · max TV (constrained) = {marginalFit.maxTv.toFixed(4)}
                </p>
                <table className="mt-3 w-full text-left text-sm">
                  <thead>
                    <tr className="text-stone-500">
                      <th className="py-1">Dimension</th>
                      <th>TV</th>
                      <th>Constrained</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marginalFit.scores.map((s) => (
                      <tr key={s.dimension} className="border-t border-stone-800">
                        <td className="py-1">{s.dimension}</td>
                        <td>{s.tvDistance.toFixed(4)}</td>
                        <td>{s.constrained ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
