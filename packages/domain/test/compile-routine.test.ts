import { describe, expect, it } from "vitest";

import { compileRoutine, type Exercise, type Routine } from "../src/index";

describe("compileRoutine", () => {
  it("compiles the acceptance routine into one warm-up and the requested training rounds", () => {
    const exercises: Exercise[] = [
      exercise("stretch", "Stretching", "stretch-media"),
      exercise("jumping-jacks", "Jumping Jacks"),
      exercise("high-knees", "High Knees"),
      exercise("crunches", "Crunches"),
      exercise("heel-touches", "Heel Touches"),
      exercise("plank", "Plank"),
    ];
    const routine: Routine = {
      id: "routine-1",
      name: "Warm-up and bodyweight",
      archived: false,
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-08-01T08:00:00.000Z",
      blocks: [
        {
          id: "warm-up-placement",
          sourceTemplateId: "warm-up-template",
          name: "Warm-up",
          categoryId: "warm-up",
          repeatCount: 1,
          steps: [exerciseStep("stretch", { kind: "duration", seconds: 60 })],
        },
        {
          id: "training-placement",
          sourceTemplateId: "training-template",
          name: "Training",
          categoryId: "training",
          repeatCount: 2,
          steps: [
            exerciseStep("jumping-jacks", { kind: "duration", seconds: 30 }),
            restStep(20),
            exerciseStep("high-knees", { kind: "duration", seconds: 30 }),
            restStep(20),
            exerciseStep("crunches", { kind: "repetitions", count: 15 }),
            restStep(20),
            exerciseStep("heel-touches", { kind: "repetitions", count: 40 }),
            restStep(20),
            exerciseStep("plank", { kind: "duration", seconds: 60 }),
            restStep(20),
            exerciseStep("plank", { kind: "duration", seconds: 60 }),
          ],
        },
      ],
    };

    const snapshot = compileRoutine(routine, exercises, "session-1");

    expect(snapshot.name).toBe("Warm-up and bodyweight");
    expect(snapshot.items).toHaveLength(23);
    expect(snapshot.items[0]).toMatchObject({
      kind: "exercise",
      exerciseName: "Stretching",
      blockName: "Warm-up",
      round: 1,
      rounds: 1,
      target: { kind: "duration", seconds: 60 },
      mediaId: "stretch-media",
    });
    expect(snapshot.items[12]).toMatchObject({
      kind: "exercise",
      exerciseName: "Jumping Jacks",
      blockName: "Training",
      round: 2,
      rounds: 2,
    });
    expect(snapshot.items.at(-1)).toMatchObject({
      kind: "exercise",
      exerciseName: "Plank",
      round: 2,
      target: { kind: "duration", seconds: 60 },
    });
  });
});

function exercise(id: string, name: string, mediaId?: string): Exercise {
  return {
    id,
    name,
    origin: "custom",
    archived: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    ...(mediaId ? { mediaId } : {}),
  };
}

function exerciseStep(exerciseId: string, target: ExerciseStepTarget) {
  return { id: crypto.randomUUID(), kind: "exercise" as const, exerciseId, target };
}

function restStep(seconds: number) {
  return { id: crypto.randomUUID(), kind: "rest" as const, seconds };
}

type ExerciseStepTarget =
  { kind: "duration"; seconds: number } | { kind: "repetitions"; count: number } | { kind: "untargeted" };
