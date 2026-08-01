import { describe, expect, it } from "vitest";

import { normalizeWgerCatalog } from "./wger-adapter";

describe("wger catalog adapter", () => {
  it("normalizes English metadata and strips upstream HTML", () => {
    const exercises = normalizeWgerCatalog({
      results: [
        {
          id: 42,
          uuid: "abc-123",
          last_update: "2026-07-30T12:00:00Z",
          license_author: "Example author",
          translations: [
            { language: 2, name: "Jumping Jacks", description: "<p>Jump with <strong>control</strong>.</p>" },
          ],
        },
      ],
    });

    expect(exercises).toEqual([
      expect.objectContaining({
        id: "catalog-wger-abc-123",
        name: "Jumping Jacks",
        description: "Jump with control.",
        provider: "wger",
        externalId: "abc-123",
        author: "Example author",
      }),
    ]);
  });
});
