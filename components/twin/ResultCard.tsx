export type ResultView =
  | {
      kind: "binary";
      question: string;
      pct: number;
      belief: boolean;
      ciLow: number;
      ciHigh: number;
      n: number;
      rationales: string[];
    }
  | {
      kind: "options";
      question: string;
      dist: { label: string; p: number }[];
      n: number;
      rationales: string[];
    }
  | {
      kind: "rephrase";
      question: string;
      reason: string;
      examples: string[];
    };

function Rationales({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="res-why">
      <div className="res-why-label">what people said</div>
      <ul>
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function ResultActions({ onAgain, onDismiss }: { onAgain: () => void; onDismiss: () => void }) {
  return (
    <div className="res-actions">
      <button type="button" className="btn btn-primary" onClick={onAgain}>
        Ask another
      </button>
      <button type="button" className="btn" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

export default function ResultCard({
  result,
  onAgain,
  onDismiss,
  onExample,
}: {
  result: ResultView;
  onAgain: () => void;
  onDismiss: () => void;
  onExample: (text: string) => void;
}) {
  if (result.kind === "rephrase") {
    return (
      <div className="result-card" role="dialog" aria-label="Rephrase suggestion">
        <div className="res-q">{result.question}</div>
        <div className="res-rephrase-label">try rephrasing</div>
        <div className="res-rephrase-reason">{result.reason}</div>
        {result.examples.length > 0 && (
          <div className="res-examples">
            {result.examples.map((ex) => (
              <button key={ex} type="button" className="res-example" onClick={() => onExample(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
        <ResultActions onAgain={onAgain} onDismiss={onDismiss} />
      </div>
    );
  }

  if (result.kind === "options") {
    return (
      <div className="result-card" role="dialog" aria-label="Prediction result">
        <div className="res-q">{result.question}</div>
        <div className="res-options">
          {result.dist.map((d, i) => {
            const pct = Math.round(d.p * 100);
            return (
              <div key={d.label} className={`res-opt${i === 0 ? " win" : ""}`}>
                <div className="res-opt-head">
                  <span className="res-opt-label">{d.label}</span>
                  <span className="res-opt-pct">{pct}%</span>
                </div>
                <div className="res-opt-track">
                  <div className="res-opt-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="res-meta">{result.n.toLocaleString()} synthetic residents</div>
        <Rationales items={result.rationales} />
        <ResultActions onAgain={onAgain} onDismiss={onDismiss} />
      </div>
    );
  }

  const noPct = 100 - result.pct;
  return (
    <div className="result-card" role="dialog" aria-label="Prediction result">
      <div className="res-q">{result.question}</div>
      <div className="res-headline">
        <span className="res-pct">
          {result.pct}
          <span className="res-pct-sym">%</span>
        </span>
        <span className="res-verb">{result.belief ? "likely" : "vote yes"}</span>
      </div>
      <div className="res-bar">
        <div className="res-bar-yes" style={{ width: `${result.pct}%` }} />
        <div className="res-bar-no" style={{ width: `${noPct}%` }} />
      </div>
      <div className="res-legend">
        <span>
          <i className="dot yes" />
          {result.belief ? "yes" : "support"} {result.pct}%
        </span>
        <span>
          <i className="dot no" />
          {result.belief ? "no" : "oppose"} {noPct}%
        </span>
      </div>
      <div className="res-meta">
        {result.n.toLocaleString()} synthetic residents · 95% CI {result.ciLow}–{result.ciHigh}%
      </div>
      <Rationales items={result.rationales} />
      <ResultActions onAgain={onAgain} onDismiss={onDismiss} />
    </div>
  );
}
