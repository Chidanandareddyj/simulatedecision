import type { CityProfile, Framing } from "@/lib/types";
import { beliefPrompt, optionsPrompt, votePrompt } from "@/lib/data/delhi-profile";

export function systemPrompt(framing: Framing, profile: CityProfile): string {
  switch (framing) {
    case "vote":
      return votePrompt(profile);
    case "belief":
      return beliefPrompt(profile);
    case "options":
      return optionsPrompt(profile);
  }
}

export function buildBatchPrompt(
  poll: {
    question: string;
    description: string;
    framing: Framing;
    asOfDate: string;
    options: string[];
    event?: { text: string };
  },
  profiles: { idx: number; persona: string }[],
  cityName: string,
): string {
  let s = `Date (reason as of this date): ${poll.asOfDate}\n`;
  if (poll.event) s += `Recent event everyone is aware of: ${poll.event.text}\n`;

  if (poll.framing === "vote") {
    s += `Ballot question / choice: ${poll.question}\n`;
    s += `What it does (neutral summary): ${poll.description}\n`;
    s += "A YES means voting for / in favor.\n\n";
  } else if (poll.framing === "belief") {
    s += `Event in question: ${poll.question}\n`;
    s += `Context (neutral): ${poll.description}\n\n`;
  } else {
    s += `Question: ${poll.question}\n`;
    if (poll.description) s += `Context (neutral): ${poll.description}\n`;
    s += "Options (choose among these, in order):\n";
    poll.options.forEach((o, i) => {
      s += `  ${i}. ${o}\n`;
    });
    s += "\n";
  }

  s += "Resident profiles:\n";
  profiles.forEach((p, i) => {
    s += `${i + 1}. ${p.persona}\n`;
  });

  if (poll.framing === "options") {
    const zeros = poll.options.map(() => "0.0").join(",");
    s += `\nFor each profile, give the probability THIS resident picks each option (distribution summing to 1).\n`;
    s += `Return ONLY a JSON array: [{"i":1,"dist":[${zeros}],"why":"<=10 words"}, ...]\n`;
    s += `Ground each distribution in the resident's profile for ${cityName}, not stereotypes.`;
  } else {
    s += `\nReturn ONLY a JSON array: [{"i":1,"p_yes":0.0,"why":"<=10 words"}, ...]\n`;
    s += `p_yes is a probability between 0 and 1. Be realistic and calibrated to ${cityName} at that date.`;
  }

  return s;
}

export function extractJson(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    try {
      return JSON.parse(text.slice(objStart, objEnd + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}
