import { NextResponse } from "next/server";
import { ensureDelhiCity } from "@/lib/services/city";
import { DELHI_PROFILE } from "@/lib/data/delhi-profile";

export async function GET() {
  await ensureDelhiCity();
  return NextResponse.json({
    cities: [
      {
        slug: DELHI_PROFILE.slug,
        display: DELHI_PROFILE.display,
        promptName: DELHI_PROFILE.promptName,
        demonym: DELHI_PROFILE.demonym,
        censusYear: 2011,
        nctPopulation: DELHI_PROFILE.nctPopulation,
        districts: DELHI_PROFILE.districts.length,
      },
    ],
  });
}
