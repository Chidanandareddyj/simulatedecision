#!/usr/bin/env tsx
/**
 * Normalize committed census JSON into DB marginals (optional; also done on first city bootstrap).
 */
import { ensureDelhiCity } from "../lib/services/city";

async function main() {
  const city = await ensureDelhiCity();
  console.log(`Ingested census marginals for city: ${city.slug} (${city.id})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
