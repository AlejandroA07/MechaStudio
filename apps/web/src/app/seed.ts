import { exerciseSchema, type BlockTemplate, type Exercise, type Routine } from "@plan-and-train/domain";

import type { TrainingDatabase } from "../storage/training-database";

const timestamp = "2026-08-01T08:00:00.000Z";

export const SEED_EXERCISES: readonly Exercise[] = [
  exercise("stretching", "Stretching", "Gentle full-body mobility to prepare for movement."),
  exercise("jumping-jacks", "Jumping Jacks", "A rhythmic full-body warm-up movement."),
  exercise("high-knees", "High Knees", "Run in place while lifting each knee toward hip height."),
  exercise("crunches", "Crunches", "Controlled abdominal flexion with the lower back supported."),
  exercise("heel-touches", "Heel Touches", "Alternate side bends to reach toward each heel."),
  exercise("plank", "Plank", "Hold a straight, braced position on forearms or hands."),
];

export const SEED_BLOCKS: readonly BlockTemplate[] = [
  {
    id: "warm-up-template",
    name: "60-second warm-up",
    categoryId: "warm-up",
    defaultRepeatCount: 1,
    steps: [exerciseStep("stretching", { kind: "duration", seconds: 60 })],
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "bodyweight-template",
    name: "Bodyweight circuit",
    categoryId: "training",
    defaultRepeatCount: 2,
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
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

export const ACCEPTANCE_ROUTINE: Routine = {
  id: "acceptance-routine",
  name: "Warm-up + bodyweight",
  archived: false,
  createdAt: timestamp,
  updatedAt: timestamp,
  blocks: [
    {
      id: "warm-up-block",
      sourceTemplateId: "warm-up-template",
      name: "Warm-up",
      categoryId: "warm-up",
      repeatCount: 1,
      steps: structuredClone(SEED_BLOCKS[0]?.steps ?? []),
    },
    {
      id: "training-block",
      sourceTemplateId: "bodyweight-template",
      name: "Training",
      categoryId: "training",
      repeatCount: 2,
      steps: structuredClone(SEED_BLOCKS[1]?.steps ?? []),
    },
  ],
};

export async function seedDatabase(database: TrainingDatabase): Promise<void> {
  await database.initialize();
  await database.mergeCatalog(SEED_EXERCISES);
  await mergePublishedCatalog(database);
  if ((await database.listBlockTemplates()).length === 0) {
    for (const block of SEED_BLOCKS) await database.saveBlockTemplate(block);
  }
  if ((await database.listRoutines()).length === 0) await database.saveRoutine(ACCEPTANCE_ROUTINE);
}

async function mergePublishedCatalog(database: TrainingDatabase): Promise<void> {
  try {
    const response = await fetch("/catalog/v1.json", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const document = (await response.json()) as { exercises?: unknown[] };
    if (!Array.isArray(document.exercises)) return;
    await database.mergeCatalog(document.exercises.map((exercise) => exerciseSchema.parse(exercise)));
  } catch {
    // The built-in starter catalog keeps the local app functional offline and in tests.
  }
}

function exercise(id: string, name: string, description: string): Exercise {
  return {
    id: `catalog-seed-${id}`,
    name,
    description,
    origin: "catalog",
    provider: "plan-and-train-seed",
    externalId: id,
    locale: "en",
    attribution: "Plan & Train starter catalog",
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function exerciseStep(externalId: string, target: ParametersTarget) {
  return {
    id: crypto.randomUUID(),
    kind: "exercise" as const,
    exerciseId: `catalog-seed-${externalId}`,
    target,
  };
}

function restStep(seconds: number) {
  return { id: crypto.randomUUID(), kind: "rest" as const, seconds };
}

type ParametersTarget =
  { kind: "duration"; seconds: number } | { kind: "repetitions"; count: number } | { kind: "untargeted" };
