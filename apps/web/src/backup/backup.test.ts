import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import type { Exercise } from "@mechastudio/domain";

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

  it("accepts a backup created before the MechaStudio rename", async () => {
    const source = makeDatabase();
    const target = makeDatabase();
    await source.initialize();
    await target.initialize();
    await source.saveExercise(customExercise("legacy-exercise", "Legacy stretch"));
    const currentBackup = await createBackup(source);
    const zip = await JSZip.loadAsync(await currentBackup.arrayBuffer());
    const currentManifest = zip.file("mechastudio.json");
    if (!currentManifest) throw new Error("Current backup manifest is missing");
    const document = JSON.parse(await currentManifest.async("text")) as Record<string, unknown>;
    document.format = "plan-and-train-backup";
    zip.remove("mechastudio.json");
    zip.file("plan-and-train.json", JSON.stringify(document));
    const legacyBackup = await zip.generateAsync({ type: "blob" });

    await restoreBackup(target, legacyBackup);

    expect(await target.listExercises()).toEqual([expect.objectContaining({ name: "Legacy stretch" })]);
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
