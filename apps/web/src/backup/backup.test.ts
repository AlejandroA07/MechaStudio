import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import type { Exercise } from "@plan-and-train/domain";

import { createTrainingDatabase, type TrainingDatabase } from "../storage/training-database";
import { createBackup, inspectBackup, restoreBackup } from "./backup";

describe("ZIP backup", () => {
  const databases: TrainingDatabase[] = [];

  afterEach(async () => {
    await Promise.all(databases.map((database) => database.delete()));
  });

  it("previews and restores validated records atomically", async () => {
    const source = makeDatabase();
    const target = makeDatabase();
    await source.initialize();
    await target.initialize();
    await source.saveExercise(customExercise("exercise-1", "Window stretch"));

    const backup = await createBackup(source);
    await expect(inspectBackup(backup)).resolves.toMatchObject({ exercises: 1, mediaFiles: 0 });
    await restoreBackup(target, backup);
    expect(await target.listExercises()).toEqual([expect.objectContaining({ name: "Window stretch" })]);

    await expect(restoreBackup(target, new Blob(["not a zip"]))).rejects.toThrow();
    expect(await target.listExercises()).toEqual([expect.objectContaining({ name: "Window stretch" })]);
  });

  function makeDatabase(): TrainingDatabase {
    const database = createTrainingDatabase(`backup-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
    databases.push(database);
    return database;
  }
});

function customExercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    origin: "custom",
    archived: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
  };
}
