import { ChatOpenAICompletions } from "@langchain/openai";
import dotenv from "dotenv";
import { cacheKey, getCachedResponse, setCachedResponse } from "@/lib/llm/cache";

dotenv.config({ override: true });

const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DEFAULT_LLM_MODEL = process.env.DEFAULT_MODEL ?? "openai/gpt-4o";

export interface LlmCompleteOptions {
  model?: string;
  system: string;
  user: string;
  maxTokens?: number;
  useCache?: boolean;
}

export type LlmClient = {
  complete: (opts: LlmCompleteOptions) => Promise<{ text: string; cacheHit: boolean }>;
};

function getLlmApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  return apiKey;
}

export function createLlmClient(overrides?: Partial<LlmClient>): LlmClient {
  if (overrides?.complete) return { complete: overrides.complete };

  return {
    async complete(opts) {
      const model = opts.model ?? DEFAULT_LLM_MODEL;
      const key = cacheKey(model, opts.system, opts.user);

      if (opts.useCache !== false) {
        const cached = await getCachedResponse(key);
        if (cached !== null) return { text: cached, cacheHit: true };
      }

      const chat = new ChatOpenAICompletions({
        model,
        temperature: 0,
        maxTokens: opts.maxTokens ?? 1600,
        apiKey: getLlmApiKey(),
        configuration: {
          baseURL: OPENROUTER_BASE_URL,
          defaultHeaders: {
            ...(process.env.OPENROUTER_HTTP_REFERER
              ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
              : {}),
            ...(process.env.OPENROUTER_APP_NAME
              ? { "X-OpenRouter-Title": process.env.OPENROUTER_APP_NAME }
              : {}),
          },
        },
      });

      const resp = await chat.invoke([
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ]);

      const text = typeof resp.content === "string" ? resp.content : JSON.stringify(resp.content);
      if (opts.useCache !== false) {
        await setCachedResponse(key, model, text);
      }
      return { text, cacheHit: false };
    },
  };
}

export const defaultLlmClient = createLlmClient();
