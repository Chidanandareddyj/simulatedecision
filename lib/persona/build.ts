import { SeededRng } from "@/lib/synthetic/rng";
import type { ValueVector } from "@/lib/types";

const EDUC_LABELS: Record<string, string> = {
  below_primary: "below primary school",
  primary: "primary school",
  middle: "middle school",
  secondary: "secondary school",
  higher_secondary: "higher secondary",
  graduate_plus: "graduate or above",
};

const REL_LABELS: Record<string, string> = {
  hindu: "Hindu",
  muslim: "Muslim",
  sikh: "Sikh",
  christian: "Christian",
  jain: "Jain",
  buddhist: "Buddhist",
  other: "other faith",
};

export interface PersonaInput {
  district: string;
  ward: string;
  ageBand: string;
  sex: string;
  education: string;
  religion: string;
  scst: string;
  workerStatus: string;
  occupationGroup: string;
  language: string;
  migrantStatus: string;
  seed: number;
  profile: { politics: { economicBase: number; socialBase: number; trustBase: number; changeBase: number } };
}

export function buildPersona(input: PersonaInput): { persona: string; values: ValueVector } {
  const rng = new SeededRng(input.seed);
  const p = input.profile.politics;

  const values: ValueVector = {
    economic: clamp(p.economicBase + jitter(rng, 0.35)),
    social: clamp(p.socialBase + jitter(rng, 0.35)),
    trust: clamp(p.trustBase + jitter(rng, 0.3)),
    change: clamp(p.changeBase + jitter(rng, 0.35)),
    housing: clamp(jitter(rng, 0.5) - (input.migrantStatus === "migrant" ? 0.1 : 0)),
    crime: clamp(jitter(rng, 0.4) + (input.district === "Central" || input.district === "North East" ? 0.1 : 0)),
    cost: clamp(jitter(rng, 0.45)),
    environment: clamp(jitter(rng, 0.5) - 0.15),
    migration: clamp(input.migrantStatus === "migrant" ? 0.1 : -0.05 + jitter(rng, 0.2)),
  };

  if (input.education === "graduate_plus" || input.education === "higher_secondary") {
    values.change += 0.1;
    values.environment += 0.08;
  }
  if (input.scst === "sc") values.economic -= 0.05;
  if (input.ageBand === "60+") values.change -= 0.12;

  const sexLabel = input.sex === "male" ? "man" : "woman";
  const workLabel =
    input.workerStatus === "worker"
      ? `works as a ${input.occupationGroup.replace(/_/g, " ")}`
      : "is not in the workforce";
  const migrantLabel = input.migrantStatus === "migrant" ? "moved to Delhi from another state" : "grew up in Delhi";
  const scLabel = input.scst === "sc" ? "Scheduled Caste" : "general category";

  const moods = ["pragmatic", "hopeful", "tired but resilient", "busy", "community-minded", "skeptical of politicians"];
  const mood = moods[Math.floor(rng.next() * moods.length)];

  const persona = `A ${mood} ${sexLabel} in ${input.district} (${input.ward}), age ${input.ageBand}, ${REL_LABELS[input.religion] ?? input.religion}, ${scLabel}, ${EDUC_LABELS[input.education] ?? input.education}, speaks ${input.language}, ${workLabel}, ${migrantLabel}. Cares about ${topIssues(values).join(" and ")}.`;

  return { persona, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, clamp(v)])) as ValueVector };
}

function jitter(rng: SeededRng, scale: number): number {
  return (rng.next() - 0.5) * 2 * scale;
}

function clamp(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

function topIssues(v: ValueVector, n = 2): string[] {
  const pairs: [string, number][] = [
    ["housing", Math.abs(v.housing)],
    ["crime and safety", Math.abs(v.crime)],
    ["cost of living", Math.abs(v.cost)],
    ["air pollution", Math.abs(v.environment)],
    ["migration policy", Math.abs(v.migration)],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs.slice(0, n).map(([k]) => k);
}
