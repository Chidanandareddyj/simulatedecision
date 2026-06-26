import type { CityProfile } from "@/lib/types";
import nctData from "@/data/census/delhi-nct.json";

export const DELHI_PROFILE: CityProfile = {
  slug: "delhi",
  display: "Simulate Decision",
  promptName: "Delhi (NCT)",
  demonym: "Delhiite",
  nctPopulation: nctData.nctPopulation,
  districts: nctData.districts.map((d) => ({
    code: d.code,
    name: d.name,
    population: d.population,
  })),
  voteFacts: `Delhi (NCT) is India's capital territory with roughly 17 million residents (Census 2011). The electorate is highly urban, with a large migrant share from UP, Bihar, and other states. The Aam Aadmi Party (AAP) won a landslide in the 2020 Delhi Assembly election on free utilities, schools, and mohalla clinics. The BJP dominates Lok Sabha seats in Delhi but AAP holds the state assembly. Religion, caste (SC share ~17%), and neighborhood matter politically. Public concerns include air pollution, water supply, housing costs, women's safety, and public transport (Metro).`,
  beliefFacts: `When forecasting events in Delhi, residents weigh local governance track records, communal dynamics, and ties to the Centre (Union government). Delhi's unique status as a Union Territory with an elected assembly shapes how voters blame or credit leaders.`,
  politics: {
    economicBase: 0.1,
    socialBase: 0.15,
    trustBase: -0.05,
    changeBase: 0.2,
  },
};

export function votePrompt(profile: CityProfile): string {
  return `You simulate how a Delhi resident would vote or answer a survey question. Reason as of the given date only — no later knowledge. ${profile.voteFacts} Ground answers in the resident's specific profile (district, age, education, religion, work status), not stereotypes.`;
}

export function beliefPrompt(profile: CityProfile): string {
  return `You simulate how a Delhi resident would forecast an external event's probability. Reason as of the given date only. ${profile.beliefFacts}`;
}

export function optionsPrompt(profile: CityProfile): string {
  return `You simulate how a Delhi resident would choose among labelled options. Reason as of the given date only. ${profile.voteFacts}`;
}
