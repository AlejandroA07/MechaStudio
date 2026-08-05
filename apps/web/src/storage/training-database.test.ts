import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import type { Exercise, Routine } from "@mechastudio/domain";

import { createTrainingDatabase, type TrainingDatabase } from "./training-database";

describe("TrainingDatabase", () => {
  let database: TrainingDatabase | undefined;

  afterEach(async () => {
    await database?.delete();
  });

  it("persists custom work and updates catalog-owned records without overwriting it", async () => {
    database = createTrainingDatabase(`test-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
    await database.initialize();
    await database.mergeCatalog([catalogExercise("Jumping Jacks")]);
    await database.saveExercise(customExercise());

    await database.mergeCatalog([catalogExercise("Jumping Jacks · updated")]);
    await database.saveRoutine(routine());

    expect(await database.listExercises()).toEqual([
      expect.objectContaining({ id: "catalog-wger-1", name: "Jumping Jacks · updated", origin: "catalog" }),
      expect.objectContaining({ id: "custom-plank", name: "My Plank", origin: "custom" }),
    ]);
    expect(await database.listRoutines()).toEqual([expect.objectContaining({ id: "routine-1", name: "Core session" })]);
  });

  it("copies records from the legacy product database on first MechaStudio launch", async () => {
    const legacy = createTrainingDatabase("plan-and-train", { indexedDB, IDBKeyRange });
    const renamed = createTrainingDatabase(undefined, { indexedDB, IDBKeyRange });
    database = renamed;
    await legacy.initialize();
    await legacy.saveExercise(customExercise());

    await renamed.initialize();

    expect(await renamed.listExercises()).toEqual([
      expect.objectContaining({ id: "custom-plank", name: "My Plank", origin: "custom" }),
    ]);
    await legacy.delete();
  });
});

function catalogExercise(name: string): Exercise {
  return {
    id: "catalog-wger-1",
    name,
    origin: "catalog",
    provider: "wger",
    externalId: "1",
    locale: "en",
    archived: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
  };
}

function customExercise(): Exercise {
  return {
    id: "custom-plank",
    name: "My Plank",
    origin: "custom",
    archived: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
  };
}

function routine(): Routine {
  return {
    id: "routine-1",
    name: "Core session",
    archived: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    blocks: [
      {
        id: "block-1",
        name: "Core",
        categoryId: "training",
        repeatCount: 2,
        steps: [
          { id: "step-1", kind: "exercise", exerciseId: "custom-plank", target: { kind: "duration", seconds: 60 } },
        ],
      },
    ],
  };
}
