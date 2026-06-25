import type { CensusBundle } from "@/lib/data/ingest";
import { ipf, tableToDistribution } from "@/lib/synthetic/ipf";
import { SeededRng, agentSeed } from "@/lib/synthetic/rng";
import { buildPersona } from "@/lib/persona/build";
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

function buildDistrictIpfTable(districtPop: number, bundle: CensusBundle): number[][] {
  const m = bundle.nctMarginals;
  const sexShare = { male: m.sex.male / bundle.nctPopulation, female: m.sex.female / bundle.nctPopulation };
  const ageShares = AGE_BANDS.map((a) => m.ageBand[a] / bundle.nctPopulation);
  const litShares = LITERACY.map((l) => m.literacy[l] / bundle.nctPopulation);
  const scShares = [m.scst.sc / bundle.nctPopulation, m.scst.non_sc / bundle.nctPopulation];
  const workerShares = WORKER.map((w) => m.workerStatus[w] / bundle.nctPopulation);

  const rowLabels = SEXES.flatMap((s) => AGE_BANDS.map((a) => `${s}|${a}`));
  const colLabels = LITERACY.flatMap((l) => SCST.flatMap((sc) => WORKER.map((w) => `${l}|${sc}|${w}`)));

  const rowTargets = SEXES.flatMap((s) => AGE_BANDS.map((a) => districtPop * sexShare[s] * (m.ageBand[a] / bundle.nctPopulation)));
  const colTargets = LITERACY.flatMap((l) =>
    SCST.flatMap((sc) => WORKER.map((w) => districtPop * (m.literacy[l] / bundle.nctPopulation) * (m.scst[sc] / bundle.nctPopulation) * (m.workerStatus[w] / bundle.nctPopulation))),
  );

  const rows = rowLabels.length;
  const cols = colLabels.length;
  const seed = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1));
  const table = ipf(seed, rowTargets, colTargets);
  return table;
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

  let idx = 0;
  for (let i = 0; i < n; i++) {
    const district = rng.pickWeighted(districtNames, districtWeights);
    const distPop = bundle.districts.find((d) => d.name === district)!.population;
    const table = buildDistrictIpfTable(distPop, bundle);
    const flat = tableToDistribution(table);
    const cellIdx = rng.pickWeighted(flat.map((_, j) => j), flat);
    const colLabels = LITERACY.length * SCST.length * WORKER.length;
    const rowIdx = Math.floor(cellIdx / colLabels);
    const colIdx = cellIdx % colLabels;
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

    residents.push({
      idx,
      weight: baseWeight,
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
