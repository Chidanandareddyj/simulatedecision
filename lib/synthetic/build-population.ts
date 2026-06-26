import type { CensusBundle } from "@/lib/data/ingest";
import { ipf, tableToDistribution } from "@/lib/synthetic/ipf";
import { SeededRng, agentSeed } from "@/lib/synthetic/rng";
import { buildPersona } from "@/lib/persona/build";
import { assignName } from "@/lib/persona/names";
import { lonlatEvenScatter } from "@/lib/geo/delhi";
import type { SyntheticResidentRecord } from "@/lib/types";

const SEXES = ["male", "female"] as const;
const AGE_BANDS = ["0-14", "15-24", "25-44", "45-59", "60+"] as const;
const LITERACY = ["literate", "illiterate"] as const;
const SCST = ["sc", "non_sc"] as const;
const WORKER = ["worker", "non_worker"] as const;
const LANGS = ["hindi", "punjabi", "urdu", "bengali", "other"] as const;

export interface BuildPopulationOptions {
  n: number;
  seed: number;
  bundle: CensusBundle;
}

export interface BuildPopulationResult {
  residents: SyntheticResidentRecord[];
  tvScores: Record<string, number>;
}

const COL_COUNT = LITERACY.length * SCST.length * WORKER.length;

/**
 * Demographic association PRIORS — deliberately NOT treated as Census ground truth.
 * They give IPF a correlated seed so raking transfers realistic cross-attribute
 * structure (age / sex / caste -> literacy and work) onto the true 1-way Census
 * marginals, instead of drawing every attribute independently.
 *
 * Limitation: literacy / SC / worker stay mutually independent *unconditionally*
 * (their joint is pinned to the column marginals); the seed only induces their
 * correlation with sex and age.
 */
function literateSharePrior(sex: string, age: string, scst: string): number {
  const byAge: Record<string, number> = {
    "0-14": 0.78,
    "15-24": 0.93,
    "25-44": 0.86,
    "45-59": 0.72,
    "60+": 0.55,
  };
  let p = byAge[age] ?? 0.8;
  if (sex === "female") p -= 0.1;
  if (scst === "sc") p -= 0.08;
  return Math.min(0.98, Math.max(0.05, p));
}

function workerSharePrior(sex: string, age: string): number {
  const byAge: Record<string, number> = {
    "0-14": 0.02,
    "15-24": 0.42,
    "25-44": 0.74,
    "45-59": 0.62,
    "60+": 0.18,
  };
  let p = byAge[age] ?? 0.4;
  if (sex === "female") p *= 0.45; // large gender gap in Indian labour-force participation
  return Math.min(0.95, Math.max(0.01, p));
}

function buildSeedTable(): number[][] {
  const rowMeta = SEXES.flatMap((s) => AGE_BANDS.map((a) => ({ s, a })));
  const colMeta = LITERACY.flatMap((l) => SCST.flatMap((sc) => WORKER.map((w) => ({ l, sc, w }))));
  return rowMeta.map(({ s, a }) =>
    colMeta.map(({ l, sc, w }) => {
      const lit = literateSharePrior(s, a, sc);
      const litC = l === "literate" ? lit : 1 - lit;
      const wp = workerSharePrior(s, a);
      const wC = w === "worker" ? wp : 1 - wp;
      return Math.max(1e-6, litC * wC);
    }),
  );
}

/**
 * Build the NCT demographic cell distribution once via IPF: a correlated seed
 * reconciled against the true sex×age (rows) and literacy×SC×worker (cols)
 * marginals. District does not alter this distribution (religion / ward /
 * education vary by district downstream), so it is computed a single time.
 */
function buildNctCellDistribution(bundle: CensusBundle): number[] {
  const m = bundle.nctMarginals;
  const scTotal = m.scst.sc + m.scst.non_sc;
  const rowTargets = SEXES.flatMap((s) =>
    AGE_BANDS.map((a) => (m.sex[s] / bundle.nctPopulation) * (m.ageBand[a] / bundle.nctPopulation)),
  );
  const colTargets = LITERACY.flatMap((l) =>
    SCST.flatMap((sc) =>
      WORKER.map(
        (w) =>
          (m.literacy[l] / bundle.nctPopulation) *
          (m.scst[sc] / scTotal) *
          (m.workerStatus[w] / bundle.nctPopulation),
      ),
    ),
  );
  return tableToDistribution(ipf(buildSeedTable(), rowTargets, colTargets));
}

function decodeCell(rowIdx: number, colIdx: number): {
  sex: string;
  ageBand: string;
  literacy: string;
  scst: string;
  workerStatus: string;
} {
  const sex = SEXES[Math.floor(rowIdx / AGE_BANDS.length)];
  const ageBand = AGE_BANDS[rowIdx % AGE_BANDS.length];
  const colPerLit = SCST.length * WORKER.length;
  const litIdx = Math.floor(colIdx / colPerLit);
  const rem = colIdx % colPerLit;
  const scIdx = Math.floor(rem / WORKER.length);
  const wIdx = rem % WORKER.length;
  return {
    sex,
    ageBand,
    literacy: LITERACY[litIdx],
    scst: SCST[scIdx],
    workerStatus: WORKER[wIdx],
  };
}

function assignOccupation(workerStatus: string, rng: SeededRng, bundle: CensusBundle): string {
  if (workerStatus === "non_worker") return "non_worker";
  const m = bundle.nctMarginals.occupationGroup;
  const workerTotal = m.cultivator + m.ag_labor + m.household_industry + m.other_worker;
  const groups = ["cultivator", "ag_labor", "household_industry", "other_worker"] as const;
  const weights = groups.map((g) => m[g]);
  return rng.pickWeighted([...groups], weights);
}

function assignReligion(district: string, rng: SeededRng, bundle: CensusBundle): string {
  const rels = bundle.religionByDistrict[district];
  if (!rels) return "hindu";
  const keys = Object.keys(rels);
  const weights = keys.map((k) => rels[k]);
  return rng.pickWeighted(keys, weights);
}

function assignEducation(religion: string, sex: string, rng: SeededRng, bundle: CensusBundle): string {
  const table = bundle.educationByReligionSex[religion]?.[sex];
  if (!table) return "middle";
  const keys = Object.keys(table);
  const weights = keys.map((k) => table[k]);
  return rng.pickWeighted(keys, weights);
}

function assignLanguage(rng: SeededRng, bundle: CensusBundle): string {
  const m = bundle.nctMarginals.language;
  const keys = LANGS as unknown as string[];
  const weights = keys.map((k) => m[k] ?? 0);
  return rng.pickWeighted(keys, weights);
}

function assignMigrant(rng: SeededRng, bundle: CensusBundle): string {
  const m = bundle.nctMarginals.migrantStatus;
  return rng.pickWeighted(["native", "migrant"], [m.native, m.migrant]);
}

function assignWard(district: string, rng: SeededRng, bundle: CensusBundle): string {
  const wards = bundle.wards.filter((w) => w.district === district);
  if (wards.length === 0) return `${district}-W01`;
  return rng.pickWeighted(
    wards.map((w) => w.ward),
    wards.map((w) => w.population),
  );
}

function computeTvScores(residents: SyntheticResidentRecord[], bundle: CensusBundle): Record<string, number> {
  const totalW = residents.reduce((s, r) => s + r.weight, 0);
  const scores: Record<string, number> = {};

  const checkMarginal = (dim: keyof SyntheticResidentRecord, target: Record<string, number>, constrained = true) => {
    const obs: Record<string, number> = {};
    for (const r of residents) {
      const k = String(r[dim]);
      obs[k] = (obs[k] ?? 0) + r.weight;
    }
    const labels = Object.keys(target);
    const targetDist = labels.map((l) => target[l] / bundle.nctPopulation);
    const obsDist = labels.map((l) => (obs[l] ?? 0) / totalW);
    let tv = 0;
    for (let i = 0; i < labels.length; i++) tv += Math.abs(targetDist[i] - obsDist[i]);
    if (constrained) scores[dim as string] = tv / 2;
  };

  checkMarginal("sex", bundle.nctMarginals.sex);
  checkMarginal("ageBand", bundle.nctMarginals.ageBand);
  checkMarginal("scst", { sc: bundle.nctMarginals.scst.sc, non_sc: bundle.nctMarginals.scst.non_sc });
  checkMarginal("workerStatus", bundle.nctMarginals.workerStatus);

  return scores;
}

export function buildPopulation(opts: BuildPopulationOptions): BuildPopulationResult {
  const { n, seed, bundle } = opts;
  const baseWeight = bundle.nctPopulation / n;
  const residents: SyntheticResidentRecord[] = [];
  const rng = new SeededRng(seed);

  const districtWeights = bundle.districts.map((d) => d.population);
  const districtNames = bundle.districts.map((d) => d.name);

  // IPF cell table is district-independent — build it once, then sample per resident.
  const cellDist = buildNctCellDistribution(bundle);
  const cellIndices = cellDist.map((_, j) => j);

  let idx = 0;
  for (let i = 0; i < n; i++) {
    const district = rng.pickWeighted(districtNames, districtWeights);
    const cellIdx = rng.pickWeighted(cellIndices, cellDist);
    const rowIdx = Math.floor(cellIdx / COL_COUNT);
    const colIdx = cellIdx % COL_COUNT;
    const cell = decodeCell(rowIdx, colIdx);

    const aseed = agentSeed(seed, idx);
    const prng = new SeededRng(aseed);
    const religion = assignReligion(district, prng, bundle);
    const education = cell.literacy === "illiterate" ? "below_primary" : assignEducation(religion, cell.sex, prng, bundle);
    const occupationGroup = assignOccupation(cell.workerStatus, prng, bundle);
    const language = assignLanguage(prng, bundle);
    const migrantStatus = assignMigrant(prng, bundle);
    const ward = assignWard(district, prng, bundle);

    const { persona, values } = buildPersona({
      district,
      ward,
      ageBand: cell.ageBand,
      sex: cell.sex,
      education,
      religion,
      scst: cell.scst,
      workerStatus: cell.workerStatus,
      occupationGroup,
      language,
      migrantStatus,
      seed: aseed,
      profile: { politics: { economicBase: 0.1, socialBase: 0.15, trustBase: -0.05, changeBase: 0.2 } },
    });

    const { lon, lat } = lonlatEvenScatter(seed, idx, n);
    const name = assignName(aseed);

    residents.push({
      idx,
      weight: baseWeight,
      name,
      lon,
      lat,
      district,
      ward,
      ageBand: cell.ageBand,
      sex: cell.sex,
      education,
      religion,
      scst: cell.scst,
      workerStatus: cell.workerStatus,
      occupationGroup,
      language,
      migrantStatus,
      persona,
      values,
    });
    idx++;
  }

  const tvScores = computeTvScores(residents, bundle);
  return { residents, tvScores };
}
