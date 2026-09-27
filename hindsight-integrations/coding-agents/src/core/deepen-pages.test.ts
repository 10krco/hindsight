import { afterEach, describe, expect, it, vi } from "vitest";
import { seedPagesAfterExtraction } from "./deepen-pages";
import { buildPageTrigger } from "./missions";
import type { HindsightClient } from "./hindsight";

afterEach(() => vi.useRealTimers());

const options = { trigger: buildPageTrigger(), pages: {}, customPages: {} };

describe("deepen page-last ordering", () => {
  it("never posts a page until this run's git extraction and the bank's consolidation settle", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const statuses = [1, 0, 1, 0];
    const client = {
      opIds: ["git-operation"],
      drain: async (ids: string[], label: string) => {
        expect(ids).toEqual(["git-operation"]);
        expect(label).toBe("extraction");
        events.push("drain");
      },
      activeOperations: async () => {
        const count = statuses.shift();
        if (count === undefined) throw new Error("unexpected poll");
        events.push(`active:${count}`);
        return count;
      },
      seedPages: async () => { events.push("seed"); },
    } as unknown as Pick<HindsightClient, "opIds" | "drain" | "activeOperations" | "seedPages">;

    const run = seedPagesAfterExtraction(client, options, () => {});
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    expect(events).toEqual(["drain", "active:1", "active:0", "seed", "active:1", "active:0"]);
  });

  it("does not seed pages when extraction status cannot be established", async () => {
    const seedPages = vi.fn();
    const client = {
      opIds: ["git-operation"],
      drain: async () => {},
      activeOperations: async () => { throw new Error("operations API unavailable"); },
      seedPages,
    } as unknown as Pick<HindsightClient, "opIds" | "drain" | "activeOperations" | "seedPages">;
    await expect(seedPagesAfterExtraction(client, options, () => {}))
      .rejects.toThrow("operations API unavailable");
    expect(seedPages).not.toHaveBeenCalled();
  });

  it("does not seed pages when this run's drain fails", async () => {
    const seedPages = vi.fn();
    const client = {
      opIds: ["git-operation"],
      drain: async () => { throw new Error("extraction did not drain"); },
      activeOperations: async () => 0,
      seedPages,
    } as unknown as Pick<HindsightClient, "opIds" | "drain" | "activeOperations" | "seedPages">;
    await expect(seedPagesAfterExtraction(client, options, () => {}))
      .rejects.toThrow("extraction did not drain");
    expect(seedPages).not.toHaveBeenCalled();
  });
});
