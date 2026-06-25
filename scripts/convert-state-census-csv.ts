#!/usr/bin/env tsx
/**
 * Build data/census/delhi-nct.json from india_state_master_dataset.csv (Delhi / NCT row).
 *
 * The master CSV is state-level only. District, ward, education-by-religion, language,
 * migrant, and SC/ST breakdowns are preserved from the existing JSON when absent in CSV.
 *
 * Usage:
 *   npx tsx scripts/convert-state-census-csv.ts
 *   npx tsx scripts/convert-state-census-csv.ts --csv path/to/file.csv
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DEFAULT_CSV = join(ROOT, "data/census/raw/india_state_master_dataset.csv");
const OUT_JSON = join(ROOT, "data/census/delhi-nct.json");

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = parseCsvLine(line);
    const row: Row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function num(row: Row, key: string): number | null {
  const v = row[key]?.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(n: number): number {
  return Math.round(n);
}

function splitAgeBands(
  workingAge: number,
  proportions: { "15-24": number; "25-44": number; "45-59": number },
): { "15-24": number; "25-44": number; "45-59": number } {
  const sum = proportions["15-24"] + proportions["25-44"] + proportions["45-59"];
  const bands = {
    "15-24": round((workingAge * proportions["15-24"]) / sum),
    "25-44": round((workingAge * proportions["25-44"]) / sum),
    "45-59": round((workingAge * proportions["45-59"]) / sum),
  };
  const drift = workingAge - (bands["15-24"] + bands["25-44"] + bands["45-59"]);
  bands["25-44"] += drift;
  return bands;
}

function findDelhiRow(rows: Row[]): Row {
  const delhi = rows.find((r) => r.State?.trim().toLowerCase() === "delhi");
  if (!delhi) throw new Error("No Delhi row found in CSV");
  return delhi;
}

function main() {
  const csvArg = process.argv.indexOf("--csv");
  const csvPath = csvArg >= 0 ? process.argv[csvArg + 1] : DEFAULT_CSV;
  const existing = JSON.parse(readFileSync(OUT_JSON, "utf8")) as {
    districts: { code: string; name: string; population: number }[];
    nctMarginals: Record<string, Record<string, number>>;
  };

  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const d = findDelhiRow(rows);

  const total = num(d, "Total Population");
  const male = num(d, "Male Population");
  const female = num(d, "Female Population");
  const workingAge = num(d, "Working Age Population");
  const senior = num(d, "Senior Citizens");
  const literate = num(d, "Literate Total");
  const totalWorkers = num(d, "Total Workers");
  const cultivators = num(d, "Cultivators");
  const agLabor = num(d, "Agricultural Labourers");

  if (
    total == null ||
    male == null ||
    female == null ||
    workingAge == null ||
    senior == null ||
    literate == null ||
    totalWorkers == null ||
    cultivators == null ||
    agLabor == null
  ) {
    throw new Error("Delhi row is missing required population fields");
  }

  const illiterate = total - literate;
  const nonWorkers = total - totalWorkers;
  const age0to14 = total - workingAge - senior;
  const priorAge = existing.nctMarginals.ageBand;
  const midBands = splitAgeBands(workingAge, {
    "15-24": priorAge["15-24"],
    "25-44": priorAge["25-44"],
    "45-59": priorAge["45-59"],
  });

  const religion = {
    hindu: num(d, "Hindu Count") ?? round(total * (num(d, "Hindu %") ?? 0)),
    muslim: num(d, "Muslim Count") ?? round(total * (num(d, "Muslim %") ?? 0)),
    christian: num(d, "Christian Count") ?? round(total * (num(d, "Christian %") ?? 0)),
    sikh: num(d, "Sikh Count") ?? round(total * (num(d, "Sikh %") ?? 0)),
    buddhist: num(d, "Buddhist Count") ?? round(total * (num(d, "Buddhist %") ?? 0)),
    jain: num(d, "Jain Count") ?? round(total * (num(d, "Jain %") ?? 0)),
    other: num(d, "Other Religions Count") ?? round(total * (num(d, "Other Religions %") ?? 0)),
  };
  const relSum = Object.values(religion).reduce((a, b) => a + b, 0);
  if (relSum !== total) religion.other += total - relSum;

  const priorHh = existing.nctMarginals.occupationGroup.household_industry ?? 0;
  const workerOccExAg = totalWorkers - cultivators - agLabor;
  const householdIndustry = priorHh > 0 && priorHh < workerOccExAg ? round(priorHh) : 0;
  const otherWorker = workerOccExAg - householdIndustry;

  const out = {
    year: 2011,
    nctPopulation: round(total),
    source:
      "Census India 2011 — NCT Delhi row from india_state_master_dataset.csv; districts/SC/education/language/migrant from prior PCA tables where CSV is state-level only",
    districts: existing.districts,
    nctMarginals: {
      sex: { male: round(male), female: round(female) },
      ageBand: {
        "0-14": round(age0to14),
        ...midBands,
        "60+": round(senior),
      },
      literacy: { literate: round(literate), illiterate: round(illiterate) },
      scst: existing.nctMarginals.scst,
      workerStatus: { worker: round(totalWorkers), non_worker: round(nonWorkers) },
      occupationGroup: {
        cultivator: round(cultivators),
        ag_labor: round(agLabor),
        household_industry: householdIndustry,
        other_worker: round(otherWorker),
        non_worker: round(nonWorkers),
      },
      religion,
      education: existing.nctMarginals.education,
      language: existing.nctMarginals.language,
      migrantStatus: existing.nctMarginals.migrantStatus,
    },
  };

  writeFileSync(OUT_JSON, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`  NCT population: ${out.nctPopulation.toLocaleString()}`);
  console.log(`  From CSV: sex, age (derived), literacy, workers, occupation (partial), religion`);
  console.log(`  Preserved from prior JSON: districts, scst, education, language, migrant`);
  console.log(`  Not in CSV (unchanged): religion-by-district.json, education-nct.json, wards.json`);
}

main();
