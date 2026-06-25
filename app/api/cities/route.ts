import { NextResponse } from "next/server";
import { ensureDelhiCity } from "@/lib/services/city";
import { DELHI_PROFILE } from "@/lib/data/delhi-profile";
import { DELHI_BBOX } from "@/lib/geo/delhi";

export async function GET() {
  await ensureDelhiCity();
  return NextResponse.json({
    cities: [
      {
        slug: DELHI_PROFILE.slug,
        display: DELHI_PROFILE.display,
        prompt_name: DELHI_PROFILE.promptName,
        demonym: DELHI_PROFILE.demonym,
        census_year: 2011,
        nct_population: DELHI_PROFILE.nctPopulation,
        districts: DELHI_PROFILE.districts.length,
        bbox: { ...DELHI_BBOX },
        knowledge_date: "2026-06-13",
        default: true,
      },
    ],
  });
}
