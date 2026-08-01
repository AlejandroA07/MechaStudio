import { describe, expect, it } from "vitest";

import { compileRoutine, createSessionRunner, reduceSessionRunner, type Exercise, type Routine } from "../src/index";

describe("Session Runner", () => {
  it("extends only the active timer and auto-advances timed steps", () => {
    const snapshot = compileRoutine(routine(), exercises(), "session-1");
    let runner = createSessionRunner(snapshot);

    runner = reduceSessionRunner(runner, { type: "start" }, 1_000);
    expect(runner.status).toBe("running");
    expect(runner.remainingMs).toBe(60_000);

    runner = reduceSessionRunner(runner, { type: "add-time", milliseconds: 5_000 }, 11_000);
    expect(runner.remainingMs).toBe(55_000);

    runner = reduceSessionRunner(runner, { type: "tick" }, 66_000);
    expect(runner.currentIndex).toBe(1);
    expect(runner.activeItem).toMatchObject({ exerciseName: "Jumping Jacks" });
    expect(runner.remainingMs).toBe(30_000);
  });

  it("pauses on interruption and waits for Done on repetition steps", () => {
    const snapshot = compileRoutine(routine(), exercises(), "session-2");
    let runner = createSessionRunner(snapshot);

    runner = reduceSessionRunner(runner, { type: "start" }, 1_000);
    runner = reduceSessionRunner(runner, { type: "interrupt" }, 21_000);
    expect(runner.status).toBe("interrupted");
    expect(runner.remainingMs).toBe(40_000);

    runner = reduceSessionRunner(runner, { type: "resume" }, 100_000);
    runner = reduceSessionRunner(runner, { type: "tick" }, 140_000);
    runner = reduceSessionRunner(runner, { type: "next" }, 140_000);
    runner = reduceSessionRunner(runner, { type: "tick" }, 170_000);
    runner = reduceSessionRunner(runner, { type: "next" }, 170_000);
    runner = reduceSessionRunner(runner, { type: "tick" }, 200_000);

    expect(runner.activeItem).toMatchObject({ exerciseName: "Crunches" });
    expect(runner.status).toBe("awaiting-completion");

    runner = reduceSessionRunner(runner, { type: "tick" }, 999_000);
    expect(runner.activeItem).toMatchObject({ exerciseName: "Crunches" });
  });
});

function exercises(): Exercise[] {
  return ["Stretching", "Jumping Jacks", "High Knees", "Crunches"].map((name) => ({
    id: name.toLowerCase().replaceAll(" ", "-"),
    name,
    origin: "custom" as const,
    archived: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
  }));
}

function routine(): Routine {
  return {
    id: "routine-1",
    name: "Morning training",
    archived: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    blocks: [
      {
        id: "warm-up",
        name: "Warm-up",
        categoryId: "warm-up",
        repeatCount: 1,
        steps: [
          { id: "stretch-step", kind: "exercise", exerciseId: "stretching", target: { kind: "duration", seconds: 60 } },
        ],
      },
      {
        id: "training",
        name: "Training",
        categoryId: "training",
        repeatCount: 1,
        steps: [
          { id: "jump", kind: "exercise", exerciseId: "jumping-jacks", target: { kind: "duration", seconds: 30 } },
          { id: "rest-1", kind: "rest", seconds: 20 },
          { id: "knees", kind: "exercise", exerciseId: "high-knees", target: { kind: "duration", seconds: 30 } },
          { id: "rest-2", kind: "rest", seconds: 20 },
          { id: "crunches", kind: "exercise", exerciseId: "crunches", target: { kind: "repetitions", count: 15 } },
        ],
      },
    ],
  };
}
