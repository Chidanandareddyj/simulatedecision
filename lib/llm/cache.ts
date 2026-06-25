import { createHash } from "crypto";
import { prisma } from "@/lib/db";

export function cacheKey(model: string, system: string, user: string): string {
  const h = createHash("sha256");
  h.update(model);
  h.update("\0");
  h.update(system);
  h.update("\0");
  h.update(user);
  return h.digest("hex");
}

export async function getCachedResponse(key: string): Promise<string | null> {
  const row = await prisma.llmCache.findUnique({ where: { cacheKey: key } });
  return row?.response ?? null;
}

export async function setCachedResponse(key: string, model: string, response: string): Promise<void> {
  await prisma.llmCache.upsert({
    where: { cacheKey: key },
    create: { cacheKey: key, model, response },
    update: { response, model },
  });
}
