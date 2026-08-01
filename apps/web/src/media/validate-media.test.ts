// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { validateExerciseMedia } from "./validate-media";

describe("validateExerciseMedia", () => {
  it("accepts an allowlisted image whose bytes match its declared type", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], "movement.png", {
      type: "image/png",
    });

    await expect(validateExerciseMedia(png)).resolves.toMatchObject({ kind: "image", mimeType: "image/png" });
  });

  it("rejects executable markup disguised as an allowlisted image", async () => {
    const disguisedSvg = new File(["<svg><script>alert(1)</script></svg>"], "movement.png", { type: "image/png" });

    await expect(validateExerciseMedia(disguisedSvg)).rejects.toThrow("contents do not match");
  });
});
