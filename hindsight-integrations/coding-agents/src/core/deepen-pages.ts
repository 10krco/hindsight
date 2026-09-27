import type { HindsightClient } from "./hindsight";
import type { CustomPagesConfig, PagesConfig, PageTrigger } from "./missions";

/** Observe all active bank operations, including jobs spawned server-side after
 * a retain, before allowing the next stage. Unknown activity is not idle. */
export async function waitForBank(
  client: Pick<HindsightClient, "activeOperations">,
  stage: string,
  log: (message: string) => void
): Promise<void> {
  const deadline = Date.now() + 15 * 60 * 1000;
  for (;;) {
    const active = await client.activeOperations();
    if (active === 0) return;
    if (Date.now() > deadline) throw new Error(`[deepen] ${active} ${stage} op(s) did not settle`);
    log(`[deepen] waiting for ${active} ${stage} op(s) to settle …`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Finish an ingestion pass before seeding pages: drain only covers operations
 * enqueued in this process; consolidation and refreshes run server-side. */
export async function seedPagesAfterExtraction(
  client: Pick<HindsightClient, "opIds" | "drain" | "activeOperations" | "seedPages">,
  options: { trigger: PageTrigger; pages: PagesConfig; customPages: CustomPagesConfig },
  log: (message: string) => void
): Promise<void> {
  await client.drain(client.opIds, "extraction");
  // Previously configureBank seeded pages before the git/chat retain calls.
  // They reflected an empty bank and could stay as "Generating content..."
  // even when synced was true (synced counts page records, not page content).
  await waitForBank(client, "extraction/consolidation", log);
  await client.seedPages(options.trigger, options.pages, options.customPages);
  await waitForBank(client, "knowledge-page refresh", log);
}
