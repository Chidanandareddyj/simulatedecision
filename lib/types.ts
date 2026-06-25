import { z } from "zod";

export const FramingSchema = z.enum(["vote", "belief", "options"]);
export type Framing = z.infer<typeof FramingSchema>;

export const PollSpecSchema = z.object({
  question: z.string().min(1),
  description: z.string().default(""),
  framing: FramingSchema,
  asOfDate: z.string(),
  population: z.string().optional(),
  options: z.array(z.string()).default([]),
  model: z.string().optional(),
  event: z
    .object({
      text: z.string(),
      asOfDate: z.string(),
    })
    .optional(),
});
export type PollSpec = z.infer<typeof PollSpecSchema>;

export const ParsedQuestionSchema = z.object({
  supported: z.boolean(),
  framing: FramingSchema.optional(),
  question: z.string(),
  description: z.string(),
  options: z.array(z.string()),
  reason: z.string().optional(),
  examples: z.array(z.string()).optional(),
});
export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;

export interface ValueVector {
  economic: number;
  social: number;
  trust: number;
  change: number;
  housing: number;
  crime: number;
  cost: number;
  environment: number;
  migration: number;
}

export interface SyntheticResidentRecord {
  id?: string;
  idx: number;
  weight: number;
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
  persona: string;
  values: ValueVector;
}

export interface DemoBreak {
  key: string;
  yesShare: number;
  weight: number;
  n: number;
}

export interface PollResult {
  question: string;
  asOfDate: string;
  model: string;
  pYes: number;
  ciLow: number;
  ciHigh: number;
  nAgents: number;
  nEff: number;
  designEffect: number;
  breakdowns: Record<string, DemoBreak[]>;
  nArchetypes: number;
  nLlmCalls: number;
  sampleRationales: string[];
  pDistribution: { label: string; p: number }[];
  cacheHit?: boolean;
}

export interface CityProfile {
  slug: string;
  display: string;
  promptName: string;
  demonym: string;
  nctPopulation: number;
  districts: { code: string; name: string; population: number }[];
  voteFacts: string;
  beliefFacts: string;
  politics: {
    economicBase: number;
    socialBase: number;
    trustBase: number;
    changeBase: number;
  };
}

export interface MarginalRow {
  dimension: string;
  geography: string;
  geoLevel: string;
  category: string;
  value: number;
}

export interface TvScore {
  dimension: string;
  geography: string;
  target: number[];
  observed: number[];
  labels: string[];
  tvDistance: number;
  constrained: boolean;
}
