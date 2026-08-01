import Dexie, { type EntityTable } from "dexie";

import {
  SEEDED_CATEGORIES,
  blockCategorySchema,
  blockTemplateSchema,
  exerciseSchema,
  planSchema,
  routineSchema,
  sessionRecordSchema,
  type BlockCategory,
  type BlockTemplate,
  type Exercise,
  type MediaAsset,
  type Plan,
  type Routine,
  type SessionRecord,
  type SessionRunnerState,
} from "@plan-and-train/domain";

export interface IndexedDbDependencies {
  readonly indexedDB: IDBFactory;
  readonly IDBKeyRange: typeof IDBKeyRange;
}

export interface StoredMedia extends MediaAsset {
  readonly data: Blob;
}

export interface TrainingDatabase {
  initialize(): Promise<void>;
  mergeCatalog(exercises: readonly Exercise[]): Promise<void>;
  listExercises(): Promise<Exercise[]>;
  saveExercise(exercise: Exercise): Promise<void>;
  saveMedia(media: StoredMedia): Promise<void>;
  getMedia(id: string): Promise<StoredMedia | undefined>;
  listMedia(): Promise<StoredMedia[]>;
  listCategories(): Promise<BlockCategory[]>;
  saveCategory(category: BlockCategory): Promise<void>;
  listBlockTemplates(): Promise<BlockTemplate[]>;
  saveBlockTemplate(block: BlockTemplate): Promise<void>;
  listRoutines(): Promise<Routine[]>;
  saveRoutine(routine: Routine): Promise<void>;
  listPlans(): Promise<Plan[]>;
  savePlan(plan: Plan): Promise<void>;
  listSessions(): Promise<SessionRecord[]>;
  saveSession(session: SessionRecord): Promise<void>;
  loadActiveSession(): Promise<SessionRunnerState | undefined>;
  saveActiveSession(session: SessionRunnerState | undefined): Promise<void>;
  exportRecords(): Promise<DatabaseExport>;
  importRecords(records: DatabaseExport, media?: readonly StoredMedia[]): Promise<void>;
  delete(): Promise<void>;
}

export interface DatabaseExport {
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly exercises: readonly Exercise[];
  readonly categories: readonly BlockCategory[];
  readonly blockTemplates: readonly BlockTemplate[];
  readonly routines: readonly Routine[];
  readonly plans: readonly Plan[];
  readonly sessions: readonly SessionRecord[];
}

interface SingletonRecord<T> {
  readonly key: string;
  readonly value: T;
}

export function createTrainingDatabase(
  name = "plan-and-train",
  dependencies: IndexedDbDependencies = { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange },
): TrainingDatabase {
  return new DexieTrainingDatabase(name, dependencies);
}

class DexieTrainingDatabase implements TrainingDatabase {
  private readonly db: Dexie;
  private readonly exercises: EntityTable<Exercise, "id">;
  private readonly media: EntityTable<StoredMedia, "id">;
  private readonly categories: EntityTable<BlockCategory, "id">;
  private readonly blockTemplates: EntityTable<BlockTemplate, "id">;
  private readonly routines: EntityTable<Routine, "id">;
  private readonly plans: EntityTable<Plan, "id">;
  private readonly sessions: EntityTable<SessionRecord, "id">;
  private readonly state: EntityTable<SingletonRecord<SessionRunnerState>, "key">;

  constructor(name: string, dependencies: IndexedDbDependencies) {
    this.db = new Dexie(name, dependencies);
    this.db.version(1).stores({
      exercises: "id, name, origin, [provider+externalId], archived, updatedAt",
      media: "id, kind, storage",
      categories: "id, name, seeded",
      blockTemplates: "id, name, categoryId, archived, updatedAt",
      routines: "id, name, archived, updatedAt",
      plans: "id, name, startDate, archived, updatedAt",
      sessions: "id, date, status, startedAt",
      state: "key",
    });
    this.exercises = this.db.table("exercises");
    this.media = this.db.table("media");
    this.categories = this.db.table("categories");
    this.blockTemplates = this.db.table("blockTemplates");
    this.routines = this.db.table("routines");
    this.plans = this.db.table("plans");
    this.sessions = this.db.table("sessions");
    this.state = this.db.table("state");
  }

  async initialize(): Promise<void> {
    await this.db.open();
    await this.db.transaction("rw", this.categories, async () => {
      for (const category of SEEDED_CATEGORIES) {
        if (!(await this.categories.get(category.id))) await this.categories.add(category);
      }
    });
  }

  async mergeCatalog(exercises: readonly Exercise[]): Promise<void> {
    const parsed = exercises.map((exercise) => exerciseSchema.parse(exercise));
    await this.db.transaction("rw", this.exercises, async () => {
      for (const incoming of parsed) {
        if (incoming.origin !== "catalog") throw new Error("Catalog imports must have catalog origin");
        const existingById = await this.exercises.get(incoming.id);
        if (existingById?.origin === "custom") continue;
        const existingBySource =
          incoming.provider && incoming.externalId
            ? await this.exercises
                .where("[provider+externalId]")
                .equals([incoming.provider, incoming.externalId])
                .first()
            : undefined;
        await this.exercises.put({ ...incoming, id: existingBySource?.id ?? incoming.id });
      }
    });
  }

  async listExercises(): Promise<Exercise[]> {
    return this.exercises.orderBy("id").toArray();
  }

  async saveExercise(exercise: Exercise): Promise<void> {
    await this.exercises.put(exerciseSchema.parse(exercise));
  }

  async saveMedia(media: StoredMedia): Promise<void> {
    await this.media.put(media);
  }

  getMedia(id: string): Promise<StoredMedia | undefined> {
    return this.media.get(id);
  }

  listMedia(): Promise<StoredMedia[]> {
    return this.media.toArray();
  }

  listCategories(): Promise<BlockCategory[]> {
    return this.categories.orderBy("name").toArray();
  }

  async saveCategory(category: BlockCategory): Promise<void> {
    await this.categories.put(blockCategorySchema.parse(category));
  }

  listBlockTemplates(): Promise<BlockTemplate[]> {
    return this.blockTemplates.orderBy("name").toArray();
  }

  async saveBlockTemplate(block: BlockTemplate): Promise<void> {
    await this.blockTemplates.put(blockTemplateSchema.parse(block));
  }

  listRoutines(): Promise<Routine[]> {
    return this.routines.orderBy("name").toArray();
  }

  async saveRoutine(routine: Routine): Promise<void> {
    await this.routines.put(routineSchema.parse(routine));
  }

  listPlans(): Promise<Plan[]> {
    return this.plans.orderBy("startDate").toArray();
  }

  async savePlan(plan: Plan): Promise<void> {
    await this.plans.put(planSchema.parse(plan));
  }

  listSessions(): Promise<SessionRecord[]> {
    return this.sessions.orderBy("date").reverse().toArray();
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.sessions.put(sessionRecordSchema.parse(session));
  }

  async loadActiveSession(): Promise<SessionRunnerState | undefined> {
    return (await this.state.get("active-session"))?.value;
  }

  async saveActiveSession(session: SessionRunnerState | undefined): Promise<void> {
    if (!session) {
      await this.state.delete("active-session");
      return;
    }
    await this.state.put({ key: "active-session", value: session });
  }

  async exportRecords(): Promise<DatabaseExport> {
    const [exercises, categories, blockTemplates, routines, plans, sessions] = await Promise.all([
      this.listExercises(),
      this.listCategories(),
      this.listBlockTemplates(),
      this.listRoutines(),
      this.listPlans(),
      this.listSessions(),
    ]);
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      exercises,
      categories,
      blockTemplates,
      routines,
      plans,
      sessions,
    };
  }

  async importRecords(records: DatabaseExport, media: readonly StoredMedia[] = []): Promise<void> {
    if (records.schemaVersion !== 1) throw new Error("Unsupported backup schema");
    const exercises = records.exercises.map((record) => exerciseSchema.parse(record));
    const categories = records.categories.map((record) => blockCategorySchema.parse(record));
    const blocks = records.blockTemplates.map((record) => blockTemplateSchema.parse(record));
    const routines = records.routines.map((record) => routineSchema.parse(record));
    const plans = records.plans.map((record) => planSchema.parse(record));
    const sessions = records.sessions.map((record) => sessionRecordSchema.parse(record));
    await this.db.transaction(
      "rw",
      [this.exercises, this.categories, this.blockTemplates, this.routines, this.plans, this.sessions, this.media],
      async () => {
        await this.exercises.bulkPut(exercises);
        await this.categories.bulkPut(categories);
        await this.blockTemplates.bulkPut(blocks);
        await this.routines.bulkPut(routines);
        await this.plans.bulkPut(plans);
        await this.sessions.bulkPut(sessions);
        await this.media.bulkPut(media);
      },
    );
  }

  async delete(): Promise<void> {
    this.db.close();
    await this.db.delete();
  }
}
