import { prisma } from "@/lib/db";
import { DELHI_PROFILE } from "@/lib/data/delhi-profile";
import { loadCensusBundle, marginalsToRows } from "@/lib/data/ingest";
import { buildPopulation } from "@/lib/synthetic/build-population";
import type { SyntheticResidentRecord } from "@/lib/types";
import * as yaml from "js-yaml";

export async function ensureDelhiCity() {
  const existing = await prisma.city.findUnique({ where: { slug: "delhi" } });
  if (existing) return existing;

  const city = await prisma.city.create({
    data: {
      slug: DELHI_PROFILE.slug,
      display: DELHI_PROFILE.display,
      promptName: DELHI_PROFILE.promptName,
      demonym: DELHI_PROFILE.demonym,
      config: DELHI_PROFILE,
    },
  });

  const bundle = loadCensusBundle();
  const rows = marginalsToRows(city.id, bundle);
  await prisma.dataSource.create({
    data: {
      cityId: city.id,
      name: "Census 2011 Delhi PCA + C-series (curated)",
      year: 2011,
      sourceUrl: "https://dataful.in/datasets/261/",
      filePath: "data/census/delhi-nct.json",
    },
  });

  await prisma.censusMarginal.createMany({
    data: rows.map((r) => ({
      cityId: city.id,
      dimension: r.dimension,
      geography: r.geography,
      geoLevel: r.geoLevel,
      category: r.category,
      value: r.value,
    })),
  });

  const rubricPath = "data/rubric/delhi.yaml";
  const fs = await import("fs/promises");
  const content = yaml.load(await fs.readFile(rubricPath, "utf8"));
  await prisma.rubric.create({
    data: { cityId: city.id, name: "delhi-v1", content: content as object },
  });

  return city;
}

export async function createPopulationRun(n: number, seed: number) {
  const city = await ensureDelhiCity();
  const bundle = loadCensusBundle();
  const { residents, tvScores } = buildPopulation({ n, seed, bundle });

  const run = await prisma.populationRun.create({
    data: {
      cityId: city.id,
      seed,
      n,
      nctPop: bundle.nctPopulation,
      tvScores,
    },
  });

  await prisma.syntheticResident.createMany({
    data: residents.map((r) => ({
      populationRunId: run.id,
      idx: r.idx,
      weight: r.weight,
      district: r.district,
      ward: r.ward,
      ageBand: r.ageBand,
      sex: r.sex,
      education: r.education,
      religion: r.religion,
      scst: r.scst,
      workerStatus: r.workerStatus,
      occupationGroup: r.occupationGroup,
      language: r.language,
      migrantStatus: r.migrantStatus,
      persona: r.persona,
      values: r.values,
    })),
  });

  return { run, residents };
}

export async function loadResidents(runId: string): Promise<SyntheticResidentRecord[]> {
  const rows = await prisma.syntheticResident.findMany({
    where: { populationRunId: runId },
    orderBy: { idx: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    idx: r.idx,
    weight: r.weight,
    district: r.district,
    ward: r.ward,
    ageBand: r.ageBand,
    sex: r.sex,
    education: r.education,
    religion: r.religion,
    scst: r.scst,
    workerStatus: r.workerStatus,
    occupationGroup: r.occupationGroup,
    language: r.language,
    migrantStatus: r.migrantStatus,
    persona: r.persona,
    values: r.values as SyntheticResidentRecord["values"],
  }));
}

export function demographicsFromResidents(residents: SyntheticResidentRecord[]) {
  const totalW = residents.reduce((s, r) => s + r.weight, 0);
  const tally = (key: keyof SyntheticResidentRecord) => {
    const m: Record<string, number> = {};
    for (const r of residents) {
      const k = String(r[key]);
      m[k] = (m[k] ?? 0) + r.weight;
    }
    return Object.entries(m)
      .map(([k, w]) => ({ key: k, share: w / totalW, weight: w, n: residents.filter((r) => String(r[key]) === k).length }))
      .sort((a, b) => b.weight - a.weight);
  };

  return {
    n: residents.length,
    totalWeight: totalW,
    byAge: tally("ageBand"),
    bySex: tally("sex"),
    byEducation: tally("education"),
    byReligion: tally("religion"),
    byScst: tally("scst"),
    byWorker: tally("workerStatus"),
    byDistrict: tally("district"),
    byOccupation: tally("occupationGroup"),
  };
}
