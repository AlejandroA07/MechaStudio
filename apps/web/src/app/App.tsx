import { useCallback, useEffect, useMemo, useState } from "react";

import {
  compileRoutine,
  createSessionRunner,
  reduceSessionRunner,
  type BlockTemplate,
  type BlockCategory,
  type Exercise,
  type Plan,
  type Routine,
  type SessionRunnerState,
} from "@mechastudio/domain";

import { syncWithCloud } from "../cloud/cloud-client";
import { ExerciseMedia } from "../media/ExerciseMedia";
import { SessionRunner } from "../session/SessionRunner";
import { createTrainingDatabase, type TrainingDatabase } from "../storage/training-database";
import { BlockDialog, ExerciseDialog, PlanDialog, RoutineDialog } from "./AuthoringDialogs";
import { SettingsDialog, type SettingsSection } from "./SettingsDialog";
import { seedDatabase } from "./seed";

type MainView = "today" | "library" | "plans";
type LibraryView = "exercises" | "blocks" | "routines";
type CreateKind = "exercise" | "block" | "routine" | "plan";

interface AppProps {
  readonly database?: TrainingDatabase;
}

export function App({ database: providedDatabase }: AppProps) {
  const database = useMemo(() => providedDatabase ?? createTrainingDatabase(), [providedDatabase]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<MainView>("today");
  const [libraryView, setLibraryView] = useState<LibraryView>("exercises");
  const [menuOpen, setMenuOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<BlockCategory[]>([]);
  const [blocks, setBlocks] = useState<BlockTemplate[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeSession, setActiveSession] = useState<SessionRunnerState>();
  const [createKind, setCreateKind] = useState<CreateKind>();
  const [editingExercise, setEditingExercise] = useState<Exercise>();
  const [settingsSection, setSettingsSection] = useState<SettingsSection>();

  const refresh = useCallback(async () => {
    const [nextExercises, nextCategories, nextBlocks, nextRoutines, nextPlans] = await Promise.all([
      database.listExercises(),
      database.listCategories(),
      database.listBlockTemplates(),
      database.listRoutines(),
      database.listPlans(),
    ]);
    setExercises(nextExercises);
    setCategories(nextCategories);
    setBlocks(nextBlocks);
    setRoutines(nextRoutines);
    setPlans(nextPlans);
  }, [database]);

  const refreshAndSync = useCallback(async () => {
    await refresh();
    try {
      if ((await syncWithCloud(database)) === "synced") await refresh();
    } catch {
      // Local authoring remains available when the optional hosted backend is offline.
    }
  }, [database, refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await seedDatabase(database);
      await refresh();
      const saved = await database.loadActiveSession();
      if (!cancelled && saved && saved.status !== "completed") {
        setActiveSession(reduceSessionRunner(saved, { type: "interrupt" }, Date.now()));
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [database, refresh]);

  const startRoutine = useCallback(
    (routine: Routine) => {
      const snapshot = compileRoutine(routine, exercises, crypto.randomUUID());
      const state = reduceSessionRunner(createSessionRunner(snapshot), { type: "start" }, Date.now());
      setActiveSession(state);
      void database.saveActiveSession(state);
    },
    [database, exercises],
  );

  const persistActive = useCallback(
    (state: SessionRunnerState) => {
      setActiveSession(state);
      void database.saveActiveSession(state);
    },
    [database],
  );

  const finishSession = useCallback(
    (state: SessionRunnerState) => {
      const now = new Date();
      void database
        .saveSession({
          id: state.snapshot.id,
          routineId: state.snapshot.routineId,
          name: state.snapshot.name,
          date: now.toISOString().slice(0, 10),
          status: state.status === "completed" ? "completed" : "partial",
          startedAt: now.toISOString(),
          completedAt: now.toISOString(),
        })
        .then(() => syncWithCloud(database))
        .catch(() => undefined);
      void database.saveActiveSession(undefined);
      setActiveSession(undefined);
    },
    [database],
  );

  const clonePlan = useCallback(
    async (plan: Plan) => {
      const timestamp = new Date().toISOString();
      await database.savePlan({
        ...structuredClone(plan),
        id: crypto.randomUUID(),
        name: `${plan.name} copy`,
        sessions: plan.sessions.map((session) => ({ ...structuredClone(session), id: crypto.randomUUID() })),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await refreshAndSync();
    },
    [database, refreshAndSync],
  );

  const duplicateExercise = useCallback(
    async (exercise: Exercise) => {
      const timestamp = new Date().toISOString();
      await database.saveExercise({
        ...exercise,
        id: crypto.randomUUID(),
        name: `${exercise.name} copy`,
        origin: "custom",
        provider: undefined,
        externalId: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as Exercise);
      await refreshAndSync();
    },
    [database, refreshAndSync],
  );

  const archiveExercise = useCallback(
    async (exercise: Exercise) => {
      await database.saveExercise({ ...exercise, archived: true, updatedAt: new Date().toISOString() });
      await refreshAndSync();
    },
    [database, refreshAndSync],
  );

  if (!ready)
    return (
      <main className="loading">
        <div className="loading__mark">MS</div>
        <p>Preparing your local library…</p>
      </main>
    );
  if (activeSession)
    return (
      <SessionRunner database={database} initialState={activeSession} onChange={persistActive} onExit={finishSession} />
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("today")} aria-label="MechaStudio home">
          <span className="brand__mark">MS</span>
          <span>MechaStudio</span>
        </button>
        <button
          className="menu-button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        {menuOpen && (
          <div className="menu-popover">
            <strong>Settings</strong>
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsSection("profile");
              }}
            >
              Profile & sync
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsSection("backup");
              }}
            >
              Backup & restore
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsSection("storage");
              }}
            >
              Storage
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsSection("credits");
              }}
            >
              Sources & credits
            </button>
            <p>Data stays in this browser until cloud profiles are enabled.</p>
          </div>
        )}
      </header>

      <div className="desktop-layout">
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavButton active={view === "today"} label="Today" onClick={() => setView("today")} />
          <NavButton active={view === "library"} label="Library" onClick={() => setView("library")} />
          <NavButton active={view === "plans"} label="Plans" onClick={() => setView("plans")} />
        </nav>

        {view === "today" && <TodayPage routines={routines} onStart={startRoutine} />}
        {view === "library" && (
          <LibraryPage
            database={database}
            view={libraryView}
            setView={setLibraryView}
            exercises={exercises}
            blocks={blocks}
            routines={routines}
            onStart={startRoutine}
            onCreate={() => {
              setEditingExercise(undefined);
              setCreateKind(libraryView === "exercises" ? "exercise" : libraryView === "blocks" ? "block" : "routine");
            }}
            onEditExercise={(exercise) => {
              setEditingExercise(exercise);
              setCreateKind("exercise");
            }}
            onDuplicateExercise={duplicateExercise}
            onArchiveExercise={archiveExercise}
          />
        )}
        {view === "plans" && (
          <PlansPage plans={plans} routines={routines} onCreate={() => setCreateKind("plan")} onClone={clonePlan} />
        )}
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavButton active={view === "today"} label="Today" onClick={() => setView("today")} />
        <NavButton active={view === "library"} label="Library" onClick={() => setView("library")} />
        <NavButton active={view === "plans"} label="Plans" onClick={() => setView("plans")} />
      </nav>

      {createKind === "exercise" && (
        <ExerciseDialog
          database={database}
          {...(editingExercise ? { initial: editingExercise } : {})}
          onClose={() => {
            setCreateKind(undefined);
            setEditingExercise(undefined);
          }}
          onSaved={refreshAndSync}
        />
      )}
      {createKind === "block" && (
        <BlockDialog
          database={database}
          exercises={exercises}
          categories={categories}
          onClose={() => setCreateKind(undefined)}
          onSaved={refreshAndSync}
        />
      )}
      {createKind === "routine" && (
        <RoutineDialog
          database={database}
          blocks={blocks}
          onClose={() => setCreateKind(undefined)}
          onSaved={refreshAndSync}
        />
      )}
      {createKind === "plan" && (
        <PlanDialog
          database={database}
          routines={routines}
          onClose={() => setCreateKind(undefined)}
          onSaved={refreshAndSync}
        />
      )}
      {settingsSection && (
        <SettingsDialog
          section={settingsSection}
          database={database}
          onClose={() => setSettingsSection(undefined)}
          onRestored={refresh}
        />
      )}
    </div>
  );
}

function TodayPage({
  routines,
  onStart,
}: {
  readonly routines: readonly Routine[];
  readonly onStart: (routine: Routine) => void;
}) {
  const featured = routines[0];
  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Saturday · August 1</p>
          <h1>Today's focus</h1>
          <p>Move with intention. Your routine is ready whenever you are.</p>
        </div>
        <div className="hero__orb" aria-hidden="true">
          <span>12</span>
          <small>steps</small>
        </div>
      </section>
      {featured ? (
        <section className="featured-card">
          <div className="featured-card__visual">
            <span>Ready</span>
          </div>
          <div className="featured-card__body">
            <p className="eyebrow">Featured routine</p>
            <h2>{featured.name}</h2>
            <p>{featured.blocks.length} blocks · Mixed time and repetitions</p>
            <button className="button button--primary" onClick={() => onStart(featured)}>
              Start session
            </button>
          </div>
        </section>
      ) : (
        <EmptyState title="No routines yet" text="Create one in your Library." />
      )}
      <section className="section-heading">
        <div>
          <p className="eyebrow">Your rhythm</p>
          <h2>Recent routines</h2>
        </div>
      </section>
      <div className="card-grid">
        {routines.map((routine) => (
          <RoutineCard key={routine.id} routine={routine} onStart={onStart} />
        ))}
      </div>
    </main>
  );
}

function LibraryPage(props: {
  readonly database: TrainingDatabase;
  readonly view: LibraryView;
  readonly setView: (view: LibraryView) => void;
  readonly exercises: readonly Exercise[];
  readonly blocks: readonly BlockTemplate[];
  readonly routines: readonly Routine[];
  readonly onStart: (routine: Routine) => void;
  readonly onCreate: () => void;
  readonly onEditExercise: (exercise: Exercise) => void;
  readonly onDuplicateExercise: (exercise: Exercise) => Promise<void>;
  readonly onArchiveExercise: (exercise: Exercise) => Promise<void>;
}) {
  return (
    <main className="page">
      <section className="page-title">
        <div>
          <p className="eyebrow">Build your practice</p>
          <h1>Library</h1>
        </div>
        <button className="button button--primary" onClick={props.onCreate}>
          + Create
        </button>
      </section>
      <div className="segmented" role="tablist">
        {(["exercises", "blocks", "routines"] as const).map((view) => (
          <button key={view} role="tab" aria-selected={props.view === view} onClick={() => props.setView(view)}>
            {capitalize(view)}
          </button>
        ))}
      </div>
      {props.view === "exercises" && (
        <ExerciseGrid
          database={props.database}
          exercises={props.exercises}
          onEdit={props.onEditExercise}
          onDuplicate={props.onDuplicateExercise}
          onArchive={props.onArchiveExercise}
        />
      )}
      {props.view === "blocks" && <BlockGrid blocks={props.blocks} />}
      {props.view === "routines" && (
        <div className="card-grid">
          {props.routines.map((routine) => (
            <RoutineCard key={routine.id} routine={routine} onStart={props.onStart} />
          ))}
        </div>
      )}
    </main>
  );
}

function ExerciseGrid({
  database,
  exercises,
  onEdit,
  onDuplicate,
  onArchive,
}: {
  readonly database: TrainingDatabase;
  readonly exercises: readonly Exercise[];
  readonly onEdit: (exercise: Exercise) => void;
  readonly onDuplicate: (exercise: Exercise) => Promise<void>;
  readonly onArchive: (exercise: Exercise) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const visible = exercises.filter(
    (exercise) => !exercise.archived && exercise.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <label className="search">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" />
      </label>
      <div className="exercise-grid">
        {visible.map((exercise) => (
          <article className="exercise-card" key={exercise.id}>
            <ExerciseMedia mediaId={exercise.mediaId} name={exercise.name} database={database} />
            <div>
              <p className="eyebrow">{exercise.origin}</p>
              <h2>{exercise.name}</h2>
              <p>{exercise.description}</p>
              <div className="card-actions">
                {exercise.origin === "custom" && <button onClick={() => onEdit(exercise)}>Edit</button>}
                <button onClick={() => void onDuplicate(exercise)}>Duplicate</button>
                {exercise.origin === "custom" && <button onClick={() => void onArchive(exercise)}>Archive</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function BlockGrid({ blocks }: { readonly blocks: readonly BlockTemplate[] }) {
  return (
    <div className="card-grid">
      {blocks
        .filter((block) => !block.archived)
        .map((block) => (
          <article className="plain-card" key={block.id}>
            <p className="eyebrow">{block.categoryId}</p>
            <h2>{block.name}</h2>
            <p>
              {block.steps.length} steps · Default {block.defaultRepeatCount}×
            </p>
            <div className="step-dots">
              {block.steps.slice(0, 8).map((step) => (
                <span key={step.id} className={step.kind === "rest" ? "step-dot step-dot--rest" : "step-dot"}></span>
              ))}
            </div>
          </article>
        ))}
    </div>
  );
}

function RoutineCard({
  routine,
  onStart,
}: {
  readonly routine: Routine;
  readonly onStart: (routine: Routine) => void;
}) {
  return (
    <article className="plain-card routine-card">
      <div>
        <p className="eyebrow">Routine</p>
        <h2>{routine.name}</h2>
        <p>
          {routine.blocks.length} blocks ·{" "}
          {routine.blocks.reduce((count, block) => count + block.steps.length * block.repeatCount, 0)} steps
        </p>
      </div>
      <button className="round-button" aria-label={`Start ${routine.name}`} onClick={() => onStart(routine)}>
        ▶
      </button>
    </article>
  );
}

function PlansPage({
  plans,
  routines,
  onCreate,
  onClone,
}: {
  readonly plans: readonly Plan[];
  readonly routines: readonly Routine[];
  readonly onCreate: () => void;
  readonly onClone: (plan: Plan) => Promise<void>;
}) {
  return (
    <main className="page">
      <section className="page-title">
        <div>
          <p className="eyebrow">Shape the weeks ahead</p>
          <h1>Plans</h1>
        </div>
        <button className="button button--primary" onClick={onCreate}>
          + New plan
        </button>
      </section>
      {plans.length === 0 ? (
        <EmptyState
          title="Your first plan starts here"
          text={`Arrange ${routines.length} saved routine${routines.length === 1 ? "" : "s"} across a week, then repeat the week as needed.`}
        />
      ) : (
        <div className="card-grid">
          {plans.map((plan) => (
            <article className="plain-card" key={plan.id}>
              <p className="eyebrow">{plan.startDate}</p>
              <h2>{plan.name}</h2>
              <p>
                {plan.weeks} weeks · {plan.sessions.length} sessions
              </p>
              <div className="plan-week">
                {plan.sessions.slice(0, 7).map((session) => (
                  <span key={session.id}>
                    <small>{session.date.slice(5)}</small>
                    {session.routine.name}
                  </span>
                ))}
              </div>
              <button className="button" onClick={() => void onClone(plan)}>
                Clone plan
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function EmptyState({ title, text }: { readonly title: string; readonly text: string }) {
  return (
    <section className="empty-state">
      <div className="empty-state__icon">＋</div>
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

function NavButton({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={active ? "nav-button nav-button--active" : "nav-button"}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span aria-hidden="true">{label === "Today" ? "◉" : label === "Library" ? "▦" : "□"}</span>
      {label}
    </button>
  );
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
