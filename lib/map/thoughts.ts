function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickFrom = (rng: () => number, arr: string[]) => arr[(rng() * arr.length) | 0];

const ISSUE: Record<string, string[]> = {
  s_housing: ["rent keeps climbing", "need more affordable homes", "landlord won't fix anything", "saving for a flat feels impossible"],
  s_crime: ["is it safe at night?", "women's safety worries me", "streetlights are too dim", "need better policing"],
  s_cost: ["everything's so expensive", "groceries cost a fortune", "two jobs and still broke", "school fees keep rising"],
  s_environment: ["the air is unbearable", "AQI was terrible today", "need more trees", "Yamuna stinks in summer"],
  s_immigration: ["moved here from UP", "sending money home", "still finding my footing", "Delhi adopted me"],
  s_homeless: ["so many people on the streets", "winter is coming for them", "shelters are full"],
};

const DAILY = [
  "Metro's packed again", "is it Friday yet?", "power cut this afternoon", "tanker came late",
  "traffic on Ring Road", "chai break soon", "monsoon can't come soon enough", "auto fare hiked again",
  "waiting for the bus", "kids have exams", "cricket match tonight", "need to recharge phone",
];

const POL = {
  prog: ["the government should do more", "fund the schools properly", "healthcare for everyone"],
  mod: ["too much spending", "fix the basics first", "just want it to work"],
  notrust: ["politicians never listen", "nothing changes", "who's in charge anyway?"],
  change: ["time for something new", "shake things up", "out with the old"],
};

const HOOD: [RegExp, string[]][] = [
  [/North West|Rohini/i, ["Rohini feels like a small town", "outer Delhi life", "metro finally reached us"]],
  [/North East|Seelampur/i, ["crowded but lively", "old Delhi vibes nearby", "markets are chaotic"]],
  [/East|Mayur Vihar/i, ["Yamuna side of town", "metro changed everything", "parks need cleaning"]],
  [/New Delhi|Lutyens/i, ["government quarter hustle", "embassy area traffic", "wide roads here"]],
  [/Central|Karol Bagh/i, ["markets never sleep", "Karol Bagh is home", "always something happening"]],
  [/West|Rajouri/i, ["suburban feel out west", "malls everywhere now", "long commute to work"]],
  [/South West|Dwarka/i, ["Dwarka sector life", "planned colony peace", "metro saved my commute"]],
  [/South|Saket/i, ["malls and cafes", "Saket feels upscale", "green belt nearby"]],
];

const YOUNG = ["rent eats my salary", "first job in Delhi", "trying to make it here"];
const OLD = ["Delhi changed so much", "lived here for decades", "miss the old neighbourhood"];

export function makeThought(
  a: { values?: Record<string, number>; age?: number; neighborhood?: string; hood?: string },
  id: number,
): string {
  const rng = mulberry32((id >>> 0) * 2654435761 + 12345);
  const v = a.values || {};
  const age = a.age || 35;
  const hood = a.neighborhood || a.hood || "";
  const r = rng();
  if (r < 0.4) {
    const keys = ["s_housing", "s_crime", "s_homeless", "s_cost", "s_environment", "s_immigration"];
    const weights = keys.map((k) => Math.max(0.05, (v[k] ?? 0.4) ** 2));
    let tot = weights.reduce((s, w) => s + w, 0);
    let x = rng() * tot;
    let pick = keys[0];
    for (let i = 0; i < keys.length; i++) {
      x -= weights[i];
      if (x <= 0) {
        pick = keys[i];
        break;
      }
    }
    return pickFrom(rng, ISSUE[pick]);
  }
  if (r < 0.68) return pickFrom(rng, DAILY);
  if (r < 0.82) {
    if (age < 28 && rng() < 0.6) return pickFrom(rng, YOUNG);
    if (age > 55 && rng() < 0.6) return pickFrom(rng, OLD);
  }
  if (r < 0.9) {
    for (const [re, arr] of HOOD) if (re.test(hood)) return pickFrom(rng, arr);
    return pickFrom(rng, DAILY);
  }
  const soc = v.social ?? 0;
  const trust = v.trust ?? 0;
  const change = v.change ?? 0;
  if (trust < -0.25 && rng() < 0.5) return pickFrom(rng, POL.notrust);
  if (change > 0.3 && rng() < 0.5) return pickFrom(rng, POL.change);
  return pickFrom(rng, soc < -0.2 ? POL.prog : POL.mod);
}

export const REACT_YES = ["I'm a yes on this", "voting yes for sure", "yeah, count me in", "this gets my vote", "yes — about time"];
export const REACT_NO = ["hard no for me", "I'm voting no", "no way", "not convinced", "this is a no"];

export function verdictReaction(verdict: string, id: number): string {
  const rng = mulberry32((id >>> 0) * 40503 + 7);
  return pickFrom(rng, verdict === "yes" ? REACT_YES : REACT_NO);
}
