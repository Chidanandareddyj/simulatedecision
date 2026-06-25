"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MapCanvas, { type MapCanvasHandle } from "@/components/twin/MapCanvas";
import type { DelhiMap } from "@/lib/map/delhi-map";
import type { MapSprite } from "@/lib/map/delhi-map";
import { assignVerdicts } from "@/lib/map/verdict";
import { MAP, SIM, TIMING } from "@/lib/map/config";
import { DELHI_BBOX } from "@/lib/geo/delhi";
import * as api from "@/lib/api/client";
import type { CityInfo, PollResultSnake } from "@/lib/api/client";

type Phase = "booting" | "idle" | "waiting" | "reveal" | "results" | "error";

interface NewsArticle {
  headline: string;
  summary?: string;
  date?: string;
}

const DELHI_FALLBACK: CityInfo = {
  slug: "delhi",
  display: "Delhi Census Twin",
  bbox: { ...DELHI_BBOX },
  knowledge_date: "2026-06-13",
  default: true,
};

const LINE_H = 24;

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function guessFraming(question: string) {
  return /\b(will|won't|by \d{4}|going to)\b/i.test(question) ||
    /^(will|is|are|does|do|can|could|would|should)\b/i.test(question)
    ? "belief"
    : "vote";
}

function fallbackAgents(n: number, bbox = DELHI_BBOX) {
  const out: { lonlat: [number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const lon = bbox.west + Math.random() * (bbox.east - bbox.west);
    const lat = bbox.south + Math.random() * (bbox.north - bbox.south);
    out.push({ lonlat: [lon, lat] });
  }
  return out;
}

const EDUC_LABEL: Record<string, string> = {
  below_primary: "below primary",
  primary: "primary school",
  middle: "middle school",
  secondary: "secondary school",
  higher_secondary: "higher secondary",
  graduate_plus: "graduate or above",
};

const ISSUE_LABEL: Record<string, string> = {
  s_housing: "housing",
  s_crime: "public safety",
  s_homeless: "homelessness",
  s_cost: "cost of living",
  s_environment: "air pollution",
  s_immigration: "migration",
};

function leanLabel(v: number | undefined, lo: string, hi: string) {
  if (v == null) return null;
  return v < -0.33 ? lo : v > 0.33 ? hi : null;
}

function topIssues(v: Record<string, number> | undefined, n = 2) {
  if (!v) return [];
  return Object.keys(ISSUE_LABEL)
    .map((k) => [ISSUE_LABEL[k], v[k] ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map((x) => x[0]);
}

export default function TwinApp() {
  const mapRef = useRef<MapCanvasHandle>(null);
  const mapInstance = useRef<DelhiMap | null>(null);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>("booting");
  const [populationRunId, setPopulationRunId] = useState<string | null>(null);
  const [city, setCity] = useState<CityInfo>(DELHI_FALLBACK);
  const [residents, setResidents] = useState(SIM.n);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [bootPct, setBootPct] = useState(0.06);
  const [showBoot, setShowBoot] = useState(true);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [statusHtml, setStatusHtml] = useState("waking the city…");
  const [toast, setToast] = useState("");
  const [askState, setAskState] = useState<"idle" | "input" | "busy">("idle");
  const [question, setQuestion] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLabel, setSummaryLabel] = useState("PREDICTING");
  const [summaryText, setSummaryText] = useState("");
  const [progressPct, setProgressPct] = useState(12);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressIndeterminate, setProgressIndeterminate] = useState(false);
  const [resultHtml, setResultHtml] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [charSprite, setCharSprite] = useState<MapSprite | null>(null);
  const portraitRef = useRef<HTMLCanvasElement>(null);

  const isBusy = phase === "waiting" || phase === "reveal";
  const inputOpen = askState === "input";

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);

  const setIdleStatus = useCallback((n: number, c: CityInfo) => {
    const display = (c.display || "Delhi").toLowerCase();
    const kd = c.knowledge_date;
    const clock = kd
      ? `<span class="status-clock">residents know the news up to ${escapeHtml(fmtDate(kd))}</span>`
      : "";
    if (typeof window !== "undefined" && window.innerWidth < 560) {
      setStatusHtml(`${n.toLocaleString()} residents`);
    } else {
      setStatusHtml(`${escapeHtml(display)} · ${n.toLocaleString()} residents${clock}`);
    }
  }, []);

  const charSpriteRef = useRef<MapSprite | null>(null);
  charSpriteRef.current = charSprite;

  const loadCity = useCallback(async (c: CityInfo) => {
    const map = mapInstance.current;
    if (!map) return;
    setCity(c);
    MAP.base = `/assets/${c.slug}_tiles.png`;
    if (c.bbox) MAP.bbox = { ...c.bbox };
    map.setBase(MAP.base);
    setStatusHtml(`waking ${c.display}…`);
    setNews([]);
    setShowBoot(true);
    setBootPct(0.06);
    try {
      const pop = await api.createPopulation({ n: SIM.n, seed: SIM.seed });
      setPopulationRunId(pop.id);
      setBootPct(0.2);
      const agents = await api.getAllAgents(pop.id, (loaded, total) => {
        setBootPct(0.2 + 0.77 * (total ? loaded / total : 0));
      });
      if (!agents.length) throw new Error("no agents returned");
      map.setAgents(agents);
      setResidents(agents.length);
      map.setSim(c.slug, pop.id);
      setBootPct(1);
      setIdleStatus(agents.length, c);
      setTimeout(() => {
        setShowBoot(false);
        api.getNews(c.slug).then((d) => setNews(d.articles || [])).catch(() => {});
      }, 450);
      setPhase("idle");
    } catch (err) {
      console.error(err);
      setShowBoot(false);
      setPopulationRunId(null);
      map.setAgents(fallbackAgents(SIM.n));
      setStatusHtml("offline preview · backend unreachable");
      showToast("Couldn't reach the backend — showing an offline preview.");
      setPhase("error");
    }
  }, [setIdleStatus, showToast]);

  const populationRunIdRef = useRef<string | null>(null);
  populationRunIdRef.current = populationRunId;

  const bootStarted = useRef(false);
  const boot = useCallback(async () => {
    if (bootStarted.current || !mapInstance.current) return;
    bootStarted.current = true;
    let initial = DELHI_FALLBACK;
    try {
      const data = await api.getCities();
      const cities = (data?.cities || []).filter((x) => x?.slug);
      if (cities.length) initial = cities.find((x) => x.default) || cities[0];
    } catch {
      /* fallback */
    }
    await loadCity(initial);
  }, [loadCity]);

  const wireMap = useCallback(
    (map: DelhiMap) => {
      mapInstance.current = map;
      map.onZoomChange = (zi) => setZoomedIn(zi);
      map.onSpriteTap = (s) => setCharSprite(s);
      map.onEmptyTap = () => {
        if (charSpriteRef.current) {
          setCharSprite(null);
          return true;
        }
        return false;
      };
      map.onNeedChatter = async (ids) => {
        const runId = populationRunIdRef.current;
        if (!runId || !ids.length) return;
        try {
          const data = await api.getChatter(runId, ids);
          for (const [id, text] of Object.entries(data.chatter || {})) {
            map.setThought(Number(id), text);
          }
        } catch {
          /* best-effort */
        }
      };
      void boot();
    },
    [boot],
  );

  useEffect(() => {
    if (!charSprite || !portraitRef.current || !mapInstance.current) return;
    mapInstance.current.drawCharTo(portraitRef.current, charSprite.char);
  }, [charSprite]);

  useEffect(() => {
    const onResize = () => {
      if (phase === "idle" || phase === "results") setIdleStatus(residents, city);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, residents, city, setIdleStatus]);

  const openInput = () => {
    if (isBusy) return;
    if (phase === "error" || !populationRunId) {
      showToast("Predictions need the backend — it's currently unreachable.");
      return;
    }
    mapInstance.current?.clearVerdicts();
    setCharSprite(null);
    setShowSummary(false);
    setShowResult(false);
    setAskState("input");
    setPhase("idle");
    setIdleStatus(residents, city);
    setQuestion("");
  };

  const closeInput = () => {
    setAskState("idle");
    setQuestion("");
  };

  const dismissResults = () => {
    setShowResult(false);
    setShowSummary(false);
    mapInstance.current?.clearVerdicts();
    setAskState("idle");
    setIdleStatus(residents, city);
    setPhase("idle");
  };

  const cancelPrediction = () => {
    reqId.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    mapInstance.current!.onProgress = null;
    mapInstance.current!.onRevealComplete = null;
    setProgressIndeterminate(false);
    setShowSummary(false);
    setShowResult(false);
    mapInstance.current?.clearVerdicts();
    setAskState("idle");
    setIdleStatus(residents, city);
    setPhase("idle");
  };

  const wireResultActions = () => {
    document.getElementById("res-again")?.addEventListener("click", openInput);
    document.getElementById("res-dismiss")?.addEventListener("click", dismissResults);
  };

  const showResults = (result: PollResultSnake) => {
    setPhase("results");
    setAskState("idle");
    setProgressPct(100);
    setShowSummary(false);
    setToast("");

    if (result.framing === "options" && result.p_distribution?.length) {
      const dist = result.p_distribution
        .map((d) => (Array.isArray(d) ? { label: String(d[0]), p: Number(d[1]) } : d))
        .sort((a, b) => b.p - a.p);
      const n = result.n_agents ?? mapInstance.current?.agents.length ?? 0;
      const rationales = (result.sample_rationales || []).slice(0, 3);
      const rows = dist
        .map((d, i) => {
          const pct = Math.round(d.p * 100);
          return `<div class="res-opt${i === 0 ? " win" : ""}">
        <div class="res-opt-head"><span class="res-opt-label">${escapeHtml(d.label)}</span><span class="res-opt-pct">${pct}%</span></div>
        <div class="res-opt-track"><div class="res-opt-fill" style="width:${pct}%"></div></div></div>`;
        })
        .join("");
      setResultHtml(`
    <div class="res-q">${escapeHtml(result.question || "")}</div>
    <div class="res-options">${rows}</div>
    <div class="res-meta">${n.toLocaleString()} synthetic residents</div>
    ${rationales.length ? `<div class="res-why"><div class="res-why-label">what people said</div><ul>${rationales.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>` : ""}
    <div class="res-actions"><button id="res-again" class="btn btn-primary">Ask another</button><button id="res-dismiss" class="btn">Dismiss</button></div>`);
      setShowResult(true);
      setTimeout(wireResultActions, 0);
      return;
    }

    const pct = Math.round((result.p_yes ?? 0) * 100);
    const noPct = 100 - pct;
    const belief = result.framing === "belief";
    const ciLow = Math.round((result.ci_low ?? result.p_yes) * 100);
    const ciHigh = Math.round((result.ci_high ?? result.p_yes) * 100);
    const n = result.n_agents ?? mapInstance.current?.agents.length ?? 0;
    const rationales = (result.sample_rationales || []).slice(0, 3);
    setResultHtml(`
    <div class="res-q">${escapeHtml(result.question || "")}</div>
    <div class="res-headline"><span class="res-pct">${pct}<span class="res-pct-sym">%</span></span><span class="res-verb">${belief ? "likely" : "vote yes"}</span></div>
    <div class="res-bar"><div class="res-bar-yes" style="width:${pct}%"></div><div class="res-bar-no" style="width:${noPct}%"></div></div>
    <div class="res-legend"><span><i class="dot yes"></i>${belief ? "yes" : "support"} ${pct}%</span><span><i class="dot no"></i>${belief ? "no" : "oppose"} ${noPct}%</span></div>
    <div class="res-meta">${n.toLocaleString()} synthetic residents · 95% CI ${ciLow}–${ciHigh}%</div>
    ${rationales.length ? `<div class="res-why"><div class="res-why-label">what people said</div><ul>${rationales.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>` : ""}
    <div class="res-actions"><button id="res-again" class="btn btn-primary">Ask another</button><button id="res-dismiss" class="btn">Dismiss</button></div>`);
    setShowResult(true);
    setTimeout(wireResultActions, 0);
  };

  const showRephrase = (parsed: { reason?: string; examples?: string[] }, q: string) => {
    setPhase("results");
    setAskState("idle");
    setProgressIndeterminate(false);
    setShowSummary(false);
    mapInstance.current?.clearVerdicts();
    const reason = parsed.reason || "I couldn't turn that into a poll for this city.";
    const examples = (parsed.examples || []).filter(Boolean).slice(0, 4);
    setResultHtml(`
    <div class="res-q">${escapeHtml(q)}</div>
    <div class="res-rephrase-label">try rephrasing</div>
    <div class="res-rephrase-reason">${escapeHtml(reason)}</div>
    ${examples.length ? `<div class="res-examples">${examples.map((ex) => `<button type="button" class="res-example">${escapeHtml(ex)}</button>`).join("")}</div>` : ""}
    <div class="res-actions"><button id="res-again" class="btn btn-primary">Ask another</button><button id="res-dismiss" class="btn">Dismiss</button></div>`);
    setShowResult(true);
    setTimeout(() => {
      wireResultActions();
      document.querySelectorAll(".res-example").forEach((btn) => {
        btn.addEventListener("click", () => {
          openInput();
          setQuestion((btn as HTMLButtonElement).textContent || "");
        });
      });
    }, 0);
  };

  const runPrediction = async (q: string) => {
    const trimmed = (q || "").trim();
    if (!trimmed) return;
    if (phase === "error" || !populationRunId) {
      showToast("Predictions need the backend — it's currently unreachable.");
      return;
    }
    const map = mapInstance.current;
    if (!map) return;

    const myReq = ++reqId.current;
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setPhase("waiting");
    setAskState("busy");
    setSummaryLabel("READING");
    setSummaryText(trimmed);
    setProgressPct(12);
    setProgressIndeterminate(true);
    setProgressLabel("understanding your question… (esc to cancel)");
    setShowResult(false);
    setShowSummary(true);
    map.setWaiting();

    try {
      let parsed: Awaited<ReturnType<typeof api.parseQuestion>> | null = null;
      try {
        parsed = await api.parseQuestion(trimmed, signal);
      } catch (perr) {
        console.warn("parse unavailable:", perr);
      }
      if (myReq !== reqId.current) return;

      if (parsed && parsed.supported === false) {
        showRephrase(parsed, trimmed);
        return;
      }

      const framing = parsed?.framing || guessFraming(trimmed);
      const description = parsed?.description || "";
      const options = parsed?.options?.length ? parsed.options : undefined;
      const pollQuestion = parsed?.question || trimmed;

      setSummaryLabel("PREDICTING");
      setProgressPct(18);
      setProgressLabel("tallying the electorate… (esc to cancel)");

      const result = await api.poll(
        populationRunId,
        { question: pollQuestion, description, framing, options },
        signal,
      );
      if (myReq !== reqId.current) return;

      const verdicts = assignVerdicts(map.agents, result.p_yes, pollQuestion, map.proj.planarSize);
      map.setRationales(result.sample_rationales);
      setProgressIndeterminate(false);
      setProgressLabel(`0 / ${map.agents.length.toLocaleString()} responses`);
      map.onProgress = (done, total) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        setProgressPct(Math.max(6, pct));
        setProgressLabel(`${done.toLocaleString()} / ${total.toLocaleString()} responses`);
      };
      map.onRevealComplete = () => {
        if (myReq === reqId.current) showResults({ ...result, framing, question: pollQuestion });
      };
      setPhase("reveal");
      map.startReveal(verdicts, TIMING.revealMs);
    } catch (err) {
      if (myReq !== reqId.current) return;
      console.error(err);
      showToast(`Poll failed: ${err instanceof Error ? err.message : "error"}`);
      setShowSummary(false);
      setProgressIndeterminate(false);
      setAskState("idle");
      setIdleStatus(residents, city);
      setPhase("idle");
    }
  };

  useEffect(() => {
    const typingTarget = (el: Element | null) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (aboutOpen) setAboutOpen(false);
        else if (charSprite) setCharSprite(null);
        else if (isBusy) cancelPrediction();
        else if (phase === "results") dismissResults();
        else if (inputOpen) closeInput();
        else if (mapInstance.current?.zoomedIn) mapInstance.current.returnToOverview();
      } else if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!isBusy && !inputOpen) openInput();
      } else if (e.key === "/" && !isBusy && !inputOpen && !typingTarget(document.activeElement)) {
        e.preventDefault();
        openInput();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aboutOpen, charSprite, isBusy, phase, inputOpen]);

  const v = charSprite?.values;
  const charDem = charSprite
    ? [charSprite.age != null ? `${charSprite.age}` : null, charSprite.educ ? EDUC_LABEL[charSprite.educ] || charSprite.educ : null]
        .filter(Boolean)
        .join(" · ")
    : "";
  const charTags = v
    ? [leanLabel(v.economic, "economically left", "economically right"), leanLabel(v.social, "socially progressive", "socially conservative")].filter(Boolean)
    : [];
  const charIssues = topIssues(v, 2);
  const charPoll = charSprite?.verdict != null;
  const charThought = charPoll && charSprite?.rationale ? charSprite.rationale : charSprite?.thought;

  return (
    <>
      <MapCanvas ref={mapRef} onReady={wireMap} />

      <div id="ui">
        <div className="title-select">
          <button className="title title-btn" type="button" disabled aria-label="City">
            <span className="title-current">{city.display}</span>
          </button>
        </div>

        <div className="status" dangerouslySetInnerHTML={{ __html: statusHtml }} />

        {news.length > 0 && (
          <div
            className="news-bubble"
            data-expanded={newsExpanded ? "true" : "false"}
            onClick={() => setNewsExpanded((x) => !x)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setNewsExpanded((x) => !x)}
          >
            <span className="news-head">
              <span>informing the residents</span>
              {news.length > 1 && (
                <svg className="news-toggle" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              )}
            </span>
            {newsExpanded
              ? news.map((a, i) => (
                  <div key={i} className="news-art">
                    {a.date && <span className="news-art-date">{fmtDate(a.date)}</span>}
                    <span className="news-art-head">{a.headline}</span>
                    {a.summary && <span className="news-art-sum">{a.summary}</span>}
                  </div>
                ))
              : news.slice(0, 3).map((a, i) => (
                  <span key={i} className="news-item">{a.headline}</span>
                ))}
          </div>
        )}

        {showBoot && (
          <div className="boot" aria-hidden="true">
            <div className="boot-track">
              <div className="boot-fill" style={{ width: `${Math.round(bootPct * 100)}%` }} />
            </div>
          </div>
        )}

        {zoomedIn && (
          <button type="button" className="return" aria-label="Return to the whole city" onClick={() => mapInstance.current?.returnToOverview()}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
            </svg>
            <span>whole city</span>
          </button>
        )}

        <div className="dock">
          {showSummary && (
            <div className="summary" aria-live="polite">
              <div className="summary-label">{summaryLabel}</div>
              <div className="summary-text">{summaryText}</div>
              <div className={`progress${progressIndeterminate ? " indeterminate" : ""}`}>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="progress-label">{progressLabel}</div>
              </div>
            </div>
          )}

          {showResult && (
            <div className="result-card" role="dialog" aria-label="Prediction result" dangerouslySetInnerHTML={{ __html: resultHtml }} />
          )}

          <div className="dock-row">
            <div className="dock-spacer" aria-hidden="true" />
            <div
              className="ask"
              data-state={askState}
              onClick={() => {
                if (isBusy) cancelPrediction();
                else if (inputOpen) return;
                else openInput();
              }}
            >
              <svg className="ask-search" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M15 15l4.5 4.5" />
              </svg>
              <span className="ask-label">{askState === "busy" ? "predicting…" : "ask"}</span>
              <textarea
                className="ask-input"
                rows={1}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    runPrediction(question);
                  }
                }}
                placeholder="predict anything — e.g. will AAP win the next Delhi Assembly election?"
                aria-label="Predict anything"
                style={{ height: askState === "input" ? undefined : LINE_H }}
              />
              <kbd className="ask-enter" aria-hidden="true">↵</kbd>
            </div>
            <button type="button" className="info-btn" aria-label="About Delhi Census Twin" title="About" onClick={() => setAboutOpen(true)}>?</button>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}

        {aboutOpen && (
          <>
            <div className="about-scrim" onClick={() => setAboutOpen(false)} />
            <div className="about" role="dialog" aria-modal="true" aria-label="About Delhi Census Twin">
              <button type="button" className="about-close" aria-label="Close" onClick={() => setAboutOpen(false)}>×</button>
              <div className="about-title">Delhi Census Twin</div>
              <div className="about-sub">simulate and predict India&apos;s capital</div>
              <div className="about-h">The pitch</div>
              <p>What if you could predict how Delhi residents would respond to a policy before it launched? Or get a signal on who will win an election?</p>
              <p>We built a synthetic population of NCT Delhi from Census 2011 marginals — districts, wards, religion, education, migration — and poll it with archetype-clustered LLM calls.</p>
              <div className="about-h">Validation</div>
              <div className="about-ex">
                <div className="about-ex-title">2020 Delhi Assembly</div>
                <div className="about-ex-q">Will AAP win a majority?</div>
                <div className="about-ex-nums"><span className="actual">Actual: AAP landslide</span><span className="pred">Twin: strong AAP lean</span></div>
              </div>
              <div className="about-credit">
                Built on Census 2011 PCA data. <b>Delhi Census Twin</b> — a Next.js port of the simfrancisco prediction engine.
              </div>
            </div>
          </>
        )}

        {charSprite?.name && (
          <div className="char-card">
            <button type="button" className="char-close" aria-label="Close" onClick={() => setCharSprite(null)}>×</button>
            <div className="char-head">
              <canvas ref={portraitRef} className="char-portrait" width={46} height={46} />
              <div className="char-id">
                <div className="char-name">{charSprite.name}</div>
                <div className="char-sub">
                  {charDem}
                  {charSprite.hood ? ` · ${charSprite.hood}` : ""}
                </div>
              </div>
            </div>
            <div className="char-tags">
              {charTags.map((t) => (
                <span key={t} className="char-tag">{t}</span>
              ))}
              {charIssues.map((i) => (
                <span key={i} className="char-tag issue">cares about {i}</span>
              ))}
            </div>
            <div className="char-think">
              <div className={`char-label${charPoll ? ` ${charSprite.verdict}` : ""}`}>
                {charPoll ? `leaning ${charSprite.verdict}` : "thinking"}
              </div>
              <div className="char-thought">&ldquo;{charThought || "…"}&rdquo;</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
