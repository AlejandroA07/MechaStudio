import { z } from "zod";

const idSchema = z.string().min(1).max(128);
const timestampSchema = z.string().datetime();

export const exerciseTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("duration"), seconds: z.number().int().min(1).max(3600) }),
  z.object({ kind: z.literal("repetitions"), count: z.number().int().min(1).max(9999) }),
  z.object({ kind: z.literal("untargeted") }),
]);

export const mediaAssetSchema = z.object({
  id: idSchema,
  kind: z.enum(["image", "gif", "video"]),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]),
  storage: z.enum(["catalog", "indexeddb", "r2"]),
  locator: z.string().min(1).max(2048),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(15 * 1024 * 1024),
  attribution: z.string().max(500).optional(),
  license: z.string().max(160).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
});

export const exerciseSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  origin: z.enum(["catalog", "custom"]),
  provider: z.string().trim().max(80).optional(),
  externalId: z.string().trim().max(160).optional(),
  locale: z.string().trim().min(2).max(35).optional(),
  sourceUpdatedAt: timestampSchema.optional(),
  author: z.string().trim().max(160).optional(),
  attribution: z.string().trim().max(500).optional(),
  license: z.string().trim().max(160).optional(),
  licenseUrl: z.string().url().max(2048).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
  mediaId: idSchema.optional(),
  archived: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const stepSchema = z.discriminatedUnion("kind", [
  z.object({ id: idSchema, kind: z.literal("exercise"), exerciseId: idSchema, target: exerciseTargetSchema }),
  z.object({ id: idSchema, kind: z.literal("rest"), seconds: z.number().int().min(1).max(3600) }),
]);

export const blockCategorySchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  seeded: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const blockTemplateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  categoryId: idSchema,
  defaultRepeatCount: z.number().int().min(1).max(99),
  steps: z.array(stepSchema).min(1).max(200),
  archived: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const routineBlockSchema = z.object({
  id: idSchema,
  sourceTemplateId: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  categoryId: idSchema,
  repeatCount: z.number().int().min(1).max(99),
  steps: z.array(stepSchema).min(1).max(200),
});

export const routineSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  blocks: z.array(routineBlockSchema).min(1).max(50),
  archived: z.boolean().default(false),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const plannedSessionSchema = z.object({
  id: idSchema,
  date: z.string().date(),
  routine: routineSchema,
  status: z.enum(["planned", "completed", "skipped", "partial"]),
});

export const planSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  startDate: z.string().date(),
  weeks: z.number().int().min(1).max(52),
  sessions: z.array(plannedSessionSchema).max(730),
  archived: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const sessionRecordSchema = z.object({
  id: idSchema,
  routineId: idSchema.optional(),
  plannedSessionId: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  date: z.string().date(),
  status: z.enum(["active", "completed", "abandoned", "partial"]),
  startedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
});

export type ExerciseTarget = z.infer<typeof exerciseTargetSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type Step = z.infer<typeof stepSchema>;
export type BlockCategory = z.infer<typeof blockCategorySchema>;
export type BlockTemplate = z.infer<typeof blockTemplateSchema>;
export type RoutineBlock = z.infer<typeof routineBlockSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type PlannedSession = z.infer<typeof plannedSessionSchema>;
export type Plan = z.infer<typeof planSchema>;
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

export const SEEDED_CATEGORIES: readonly BlockCategory[] = [
  category("warm-up", "Warm-up", "#F4A261"),
  category("training", "Training", "#2A9D8F"),
  category("stretching", "Stretching", "#8E7DBE"),
  category("cool-down", "Cool-down", "#457B9D"),
  category("recovery", "Recovery", "#6A994E"),
];

function category(id: string, name: string, color: string): BlockCategory {
  const timestamp = "2026-08-01T00:00:00.000Z";
  return { id, name, color, seeded: true, createdAt: timestamp, updatedAt: timestamp };
}
