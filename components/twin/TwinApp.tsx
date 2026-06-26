"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MapCanvas, { type MapCanvasHandle } from "@/components/twin/MapCanvas";
import type { DelhiMap } from "@/lib/map/delhi-map";
import type { MapSprite } from "@/lib/map/delhi-map";
import { assignVerdicts } from "@/lib/map/verdict";
import { MAP, SIM, TIMING, MAP_SPRITE_COUNT } from "@/lib/map/config";
import { DELHI_BBOX } from "@/lib/geo/delhi";
import * as api from "@/lib/api/client";
import type { CityInfo, PollResultSnake } from "@/lib/api/client";
import ResultCard, { type ResultView } from "@/components/twin/ResultCard";

type Phase = "booting" | "idle" | "waiting" | "reveal" | "results" | "error";

interface NewsArticle {
  headline: string;
  summary?: string;
  date?: string;
}

const DELHI_FALLBACK: CityInfo = {
  slug: "delhi",
  display: "Simulate Decision",
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

function fallbackAgents(n = MAP_SPRITE_COUNT, bbox = DELHI_BBOX) {
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
  const [resultView, setResultView] = useState<ResultView | null>(null);
  const [aboutOpen, setAboutOpen] = useState(true);
  const [charSprite, setCharSprite] = useState<MapSprite | null>(null);
  const portraitRef = useRef<HTMLCanvasElement>(null);
  const askInputRef = useRef<HTMLTextAreaElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const isBusy = phase === "waiting" || phase === "reveal";
  const inputOpen = askState === "input";

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);

  const autoGrow = useCallback(() => {
    const ta = askInputRef.current;
    if (!ta) return;
    ta.style.height = `${LINE_H}px`;
    const sh = ta.scrollHeight;
    if (sh > LINE_H + 1) {
      const cap = Math.round(window.innerHeight * 0.4);
      const h = Math.min(sh, cap);
      ta.style.height = `${h}px`;
      ta.style.overflowY = h >= cap ? "auto" : "hidden";
    } else {
      ta.style.overflowY = "hidden";
    }
  }, []);

  const setIdleStatus = useCallback((n: number, c: CityInfo) => {
    const display = (c.display || "the city").toLowerCase();
    if (typeof window !== "undefined" && window.innerWidth < 560) {
      setStatusHtml(`${n.toLocaleString()} residents`);
    } else {
      setStatusHtml(`${escapeHtml(display)} · ${n.toLocaleString()} residents`);
    }
  }, []);

  const charSpriteRef = useRef<MapSprite | null>(null);
  charSpriteRef.current = charSprite;

  const loadCity = useCallback(async (c: CityInfo) => {
    const map = mapInstance.current;
    if (!map) return;
    setCity(c);
    MAP.base = c.slug === "delhi" ? "/assets/Delhi.png" : `/assets/${c.slug}_tiles.png`;
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
      const agents = await api.getDisplayAgents(pop.id, MAP_SPRITE_COUNT);
      setBootPct(0.97);
      if (!agents.length) throw new Error("no agents returned");
      map.setAgents(agents);
      setResidents(pop.n);
      map.setSim(c.slug, pop.id);
      setBootPct(1);
      setIdleStatus(pop.n, c);
      setTimeout(() => {
        setShowBoot(false);
        api.getNews(c.slug).then((d) => setNews(d.articles || [])).catch(() => {});
      }, 450);
      setPhase("idle");
    } catch (err) {
      console.error(err);
      setShowBoot(false);
      setPopulationRunId(null);
      map.setAgents(fallbackAgents());
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

  const openInput = useCallback((prefill = "") => {
    if (isBusy) return;
    if (phase === "error" || !populationRunId) {
      showToast("Predictions need the backend — it's currently unreachable.");
      return;
    }
    mapInstance.current?.clearVerdicts();
    setCharSprite(null);
    setShowSummary(false);
    setResultView(null);
    setAskState("input");
    setPhase("idle");
    setIdleStatus(residents, city);
    setQuestion(prefill);
    requestAnimationFrame(() => {
      const ta = askInputRef.current;
      if (!ta) return;
      ta.style.height = `${LINE_H}px`;
      ta.focus();
      if (prefill) autoGrow();
    });
  }, [autoGrow, city, isBusy, phase, populationRunId, residents, setIdleStatus, showToast]);

  const closeInput = useCallback(() => {
    setAskState("idle");
    setQuestion("");
    const ta = askInputRef.current;
    if (ta) {
      ta.style.height = `${LINE_H}px`;
      ta.blur();
    }
  }, []);

  const dismissResults = useCallback(() => {
    setResultView(null);
    setShowSummary(false);
    mapInstance.current?.clearVerdicts();
    setAskState("idle");
    setIdleStatus(residents, city);
    setPhase("idle");
  }, [city, residents, setIdleStatus]);

  const cancelPrediction = () => {
    reqId.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    mapInstance.current!.onProgress = null;
    mapInstance.current!.onRevealComplete = null;
    setProgressIndeterminate(false);
    setShowSummary(false);
    setResultView(null);
    mapInstance.current?.clearVerdicts();
    setAskState("idle");
    setIdleStatus(residents, city);
    setPhase("idle");
  };

  const showResults = (result: PollResultSnake) => {
    setPhase("results");
    setAskState("idle");
    setProgressPct(100);
    setShowSummary(false);
    setToast("");

    const n = result.n_agents ?? mapInstance.current?.agents.length ?? 0;
    const rationales = (result.sample_rationales || []).slice(0, 3);
    const questionText = result.question || "";

    if (result.framing === "options" && result.p_distribution?.length) {
      const dist = result.p_distribution
        .map((d) => (Array.isArray(d) ? { label: String(d[0]), p: Number(d[1]) } : d))
        .sort((a, b) => b.p - a.p);
      setResultView({ kind: "options", question: questionText, dist, n, rationales });
      return;
    }

    const pct = Math.round((result.p_yes ?? 0) * 100);
    const belief = result.framing === "belief";
    const ciLow = Math.round((result.ci_low ?? result.p_yes) * 100);
    const ciHigh = Math.round((result.ci_high ?? result.p_yes) * 100);
    setResultView({
      kind: "binary",
      question: questionText,
      pct,
      belief,
      ciLow,
      ciHigh,
      n,
      rationales,
    });
  };

  const showRephrase = (parsed: { reason?: string; examples?: string[] }, q: string) => {
    setPhase("results");
    setAskState("idle");
    setProgressIndeterminate(false);
    setShowSummary(false);
    mapInstance.current?.clearVerdicts();
    const reason = parsed.reason || "I couldn't turn that into a poll for this city.";
    const examples = (parsed.examples || []).filter(Boolean).slice(0, 4);
    setResultView({ kind: "rephrase", question: q, reason, examples });
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
    setResultView(null);
    setShowSummary(true);
    askInputRef.current?.blur();
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
    const onMouseDown = (e: MouseEvent) => {
      if (askState === "input" && dockRef.current && !dockRef.current.contains(e.target as Node)) {
        closeInput();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [askState, closeInput]);

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
  }, [aboutOpen, charSprite, closeInput, dismissResults, inputOpen, isBusy, openInput, phase]);

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
        <div className="title-select ui-interactive">
          <button className="title title-btn" type="button" disabled aria-label="City">
            <span className="title-current">{city.display}</span>
          </button>
        </div>

        <div className="status ui-interactive" dangerouslySetInnerHTML={{ __html: statusHtml }} />

        {/* {news.length > 0 && (
          <div
            className="news-bubble ui-interactive"
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
        )} */}

        {showBoot && (
          <div className="boot" aria-hidden="true">
            <div className="boot-track">
              <div className="boot-fill" style={{ width: `${Math.round(bootPct * 100)}%` }} />
            </div>
          </div>
        )}

        {zoomedIn && (
          <button type="button" className="return ui-interactive" aria-label="Return to the whole city" onClick={() => mapInstance.current?.returnToOverview()}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
            </svg>
            <span>overview</span>
          </button>
        )}

        <div className="dock ui-interactive" ref={dockRef}>
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

          {resultView && (
            <ResultCard
              result={resultView}
              onAgain={() => openInput()}
              onDismiss={dismissResults}
              onExample={(text) => openInput(text)}
            />
          )}

          <div className="dock-row">
            <div className="dock-spacer" aria-hidden="true" />
            <div
              className="ask"
              data-state={askState}
              onClick={() => {
                if (isBusy) cancelPrediction();
                else if (inputOpen) {
                  askInputRef.current?.focus();
                  return;
                }
                openInput();
              }}
            >
              <svg className="ask-search" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M15 15l4.5 4.5" />
              </svg>
              <span className="ask-label">{askState === "busy" ? "predicting…" : "Ask"}</span>
              <textarea
                ref={askInputRef}
                className="ask-input"
                rows={1}
                value={question}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  autoGrow();
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    runPrediction(question);
                  }
                }}
                placeholder="predict anything — e.g. will voters support a new transit line?"
                aria-label="Predict anything"
              />
              <kbd className="ask-enter" aria-hidden="true">↵</kbd>
            </div>
            <button type="button" className="info-btn" aria-label="About Census Twin" title="About" onClick={() => setAboutOpen(true)}>?</button>
          </div>
        </div>

        {toast && <div className="toast ui-interactive">{toast}</div>}

        {aboutOpen && (
          <>
            <div className="about-scrim" aria-hidden="true" />
            <div className="about ui-interactive" role="dialog" aria-modal="true" aria-label="About Census Twin">
              <button type="button" className="about-close" aria-label="Close" onClick={() => setAboutOpen(false)}>×</button>
              <div className="about-title">Simulate Decision</div>
              <div className="about-sub">simulate and predict decisions from census data</div>
              <div className="about-h">The pitch</div>
              <p>What if you could predict how residents would respond to a policy before it launched? Or get a signal on who will win an election?</p>
              <p>This is a synthetic population for cities from census marginals: demographics, neighborhoods, religion, education, migration and polls it with archetype-clustered LLM calls.</p>
              <div className="about-h">How it works</div>
              <p>Ask any yes/no question, belief forecast, or multi-option poll. The synthetic population clusters residents into demographic archetypes, batches model calls, and aggregates answers with survey weights then reveals the verdict on the map.</p>
              <div className="about-credit">
                Built on Census 2011 PCA data. <b>Simulate Decision</b>
              </div>
            </div>
          </>
        )}

        {charSprite?.name && (
          <div className="char-card ui-interactive">
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
