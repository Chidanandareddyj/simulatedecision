import type { MarginalRow } from "@/lib/types";
import nctData from "@/data/census/delhi-nct.json";
import religionData from "@/data/census/religion-by-district.json";
import educationData from "@/data/census/education-nct.json";
import wardsData from "@/data/census/wards.json";

export interface CensusBundle {
  nctPopulation: number;
  districts: { code: string; name: string; population: number }[];
  nctMarginals: Record<string, Record<string, number>>;
  religionByDistrict: Record<string, Record<string, number>>;
  educationByReligionSex: Record<string, Record<string, Record<string, number>>>;
  wards: { district: string; ward: string; population: number }[];
}

export function loadCensusBundle(): CensusBundle {
  return {
    nctPopulation: nctData.nctPopulation,
    districts: nctData.districts,
    nctMarginals: nctData.nctMarginals as Record<string, Record<string, number>>,
    religionByDistrict: religionData.districts as Record<string, Record<string, number>>,
    educationByReligionSex: educationData.byReligionSex as Record<
      string,
      Record<string, Record<string, number>>
    >,
    wards: wardsData.wards,
  };
}

export function marginalsToRows(cityId: string, bundle: CensusBundle): MarginalRow[] {
  const rows: MarginalRow[] = [];

  for (const d of bundle.districts) {
    rows.push({
      dimension: "district",
      geography: d.name,
      geoLevel: "district",
      category: d.name,
      value: d.population,
    });
  }

  for (const [dim, cats] of Object.entries(bundle.nctMarginals)) {
    for (const [cat, val] of Object.entries(cats)) {
      rows.push({
        dimension: dim,
        geography: "NCT",
        geoLevel: "nct",
        category: cat,
        value: val,
      });
    }
  }

  for (const [district, rels] of Object.entries(bundle.religionByDistrict)) {
    const pop = bundle.districts.find((d) => d.name === district)?.population ?? 0;
    for (const [rel, share] of Object.entries(rels)) {
      rows.push({
        dimension: "religion",
        geography: district,
        geoLevel: "district",
        category: rel,
        value: pop * share,
      });
    }
  }

  for (const w of bundle.wards) {
    rows.push({
      dimension: "ward",
      geography: w.district,
      geoLevel: "ward",
      category: w.ward,
      value: w.population,
    });
  }

  return rows;
}

export { nctData, religionData, educationData, wardsData };
