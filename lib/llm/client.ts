import { ChatOpenAICompletions } from "@langchain/openai";
import dotenv from "dotenv";
import { cacheKey, getCachedResponse, setCachedResponse } from "@/lib/llm/cache";

dotenv.config({ override: true });

/** GitHub Models inference endpoint (OpenAI-compatible). */
const GITHUB_MODELS_BASE_URL =
  process.env.GITHUB_MODELS_BASE_URL ?? "https://models.github.ai/inference";
const DEFAULT_LLM_MODEL = process.env.DEFAULT_MODEL ?? "openai/gpt-4o";
const DEFAULT_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 1000);

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

export function isLlmConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_TOKEN?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
  );
}

function getLlmApiKey(): string {
  const apiKey =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GITHUB_TOKEN is not set. Create a GitHub PAT with models:read at https://github.com/settings/tokens",
    );
  }
  return apiKey;
}

function getLlmBaseUrl(): string {
  if (process.env.LLM_BASE_URL?.trim()) return process.env.LLM_BASE_URL.trim();
  if (process.env.GITHUB_TOKEN?.trim()) return GITHUB_MODELS_BASE_URL;
  return process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
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

      const usingGitHub = getLlmBaseUrl() === GITHUB_MODELS_BASE_URL;
      const chat = new ChatOpenAICompletions({
        model,
        temperature: 0,
        maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        apiKey: getLlmApiKey(),
        configuration: {
          baseURL: getLlmBaseUrl(),
          defaultHeaders: usingGitHub
            ? undefined
            : {
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
