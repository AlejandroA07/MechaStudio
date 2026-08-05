import { useState, type FormEvent } from "react";

import type {
  BlockCategory,
  BlockTemplate,
  Exercise,
  PlannedSession,
  Routine,
  RoutineBlock,
  Step,
} from "@mechastudio/domain";

import { validateExerciseMedia } from "../media/validate-media";
import type { TrainingDatabase } from "../storage/training-database";

interface SharedProps {
  readonly database: TrainingDatabase;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}

export function ExerciseDialog({ database, onClose, onSaved, initial }: SharedProps & { readonly initial?: Exercise }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const timestamp = new Date().toISOString();
      const exerciseId = initial?.id ?? crypto.randomUUID();
      let mediaId = initial?.mediaId;
      if (file) {
        const accepted = await validateExerciseMedia(file);
        mediaId = crypto.randomUUID();
        await database.saveMedia({
          id: mediaId,
          ...accepted,
          storage: "indexeddb",
          locator: mediaId,
          data: file,
        });
      }
      const exercise: Exercise = {
        id: exerciseId,
        name,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(mediaId ? { mediaId } : {}),
        origin: "custom",
        archived: false,
        createdAt: initial?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      await database.saveExercise(exercise);
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save exercise");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell title={initial ? "Edit exercise" : "Create exercise"} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Name">
          <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <Field label="Short description">
          <textarea
            maxLength={500}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label="Picture, GIF, or short video">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
          <small>Optional · maximum 15 MiB · stored only in this browser</small>
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </DialogShell>
  );
}

export function BlockDialog(
  props: SharedProps & { readonly exercises: readonly Exercise[]; readonly categories: readonly BlockCategory[] },
) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(props.categories[0]?.id ?? "training");
  const [repeatCount, setRepeatCount] = useState(1);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedExercise, setSelectedExercise] = useState(props.exercises[0]?.id ?? "");
  const [error, setError] = useState("");

  function addExercise() {
    if (!selectedExercise) return;
    setSteps((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: "exercise",
        exerciseId: selectedExercise,
        target: { kind: "duration", seconds: 30 },
      },
    ]);
  }

  function addRest() {
    setSteps((current) => [...current, { id: crypto.randomUUID(), kind: "rest", seconds: 20 }]);
  }

  function updateStep(index: number, next: Step) {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? next : step)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (steps.length === 0) {
      setError("Add at least one exercise or rest step");
      return;
    }
    const timestamp = new Date().toISOString();
    const block: BlockTemplate = {
      id: crypto.randomUUID(),
      name,
      categoryId,
      defaultRepeatCount: repeatCount,
      steps,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await props.database.saveBlockTemplate(block);
    await props.onSaved();
    props.onClose();
  }

  return (
    <DialogShell title="Create block" onClose={props.onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Block name">
            <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </Field>
          <Field label="Category">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default rounds">
            <input
              type="number"
              min={1}
              max={99}
              value={repeatCount}
              onChange={(event) => setRepeatCount(Number(event.target.value))}
            />
          </Field>
        </div>
        <div className="builder-toolbar">
          <select
            aria-label="Exercise to add"
            value={selectedExercise}
            onChange={(event) => setSelectedExercise(event.target.value)}
          >
            {props.exercises
              .filter((exercise) => !exercise.archived)
              .map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
          </select>
          <button type="button" className="button" onClick={addExercise}>
            + Exercise
          </button>
          <button type="button" className="button" onClick={addRest}>
            + Rest
          </button>
        </div>
        <ol className="builder-list">
          {steps.map((step, index) => (
            <li key={step.id}>
              <span className="builder-list__index">{index + 1}</span>
              <strong>
                {step.kind === "rest"
                  ? "Rest"
                  : props.exercises.find((exercise) => exercise.id === step.exerciseId)?.name}
              </strong>
              {step.kind === "rest" ? (
                <>
                  <input
                    aria-label={`Rest seconds ${index + 1}`}
                    type="number"
                    min={1}
                    max={3600}
                    value={step.seconds}
                    onChange={(event) => updateStep(index, { ...step, seconds: Number(event.target.value) })}
                  />
                  <span>sec</span>
                </>
              ) : (
                <>
                  <select
                    aria-label={`Target type ${index + 1}`}
                    value={step.target.kind}
                    onChange={(event) => {
                      const kind = event.target.value;
                      updateStep(index, {
                        ...step,
                        target:
                          kind === "duration"
                            ? { kind, seconds: 30 }
                            : kind === "repetitions"
                              ? { kind, count: 10 }
                              : { kind: "untargeted" },
                      });
                    }}
                  >
                    <option value="duration">Time</option>
                    <option value="repetitions">Reps</option>
                    <option value="untargeted">Untargeted</option>
                  </select>
                  {step.target.kind === "duration" && (
                    <input
                      aria-label={`Exercise seconds ${index + 1}`}
                      type="number"
                      min={1}
                      max={3600}
                      value={step.target.seconds}
                      onChange={(event) =>
                        updateStep(index, {
                          ...step,
                          target: { kind: "duration", seconds: Number(event.target.value) },
                        })
                      }
                    />
                  )}
                  {step.target.kind === "repetitions" && (
                    <input
                      aria-label={`Exercise repetitions ${index + 1}`}
                      type="number"
                      min={1}
                      max={9999}
                      value={step.target.count}
                      onChange={(event) =>
                        updateStep(index, {
                          ...step,
                          target: { kind: "repetitions", count: Number(event.target.value) },
                        })
                      }
                    />
                  )}
                </>
              )}
              <MoveButtons
                index={index}
                length={steps.length}
                move={(from, to) => setSteps((current) => move(current, from, to))}
                remove={() => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index))}
              />
            </li>
          ))}
        </ol>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <FormActions onCancel={props.onClose} />
      </form>
    </DialogShell>
  );
}

export function RoutineDialog(props: SharedProps & { readonly blocks: readonly BlockTemplate[] }) {
  const [name, setName] = useState("");
  const [selectedBlock, setSelectedBlock] = useState(props.blocks[0]?.id ?? "");
  const [placedBlocks, setPlacedBlocks] = useState<RoutineBlock[]>([]);
  const [error, setError] = useState("");

  function addBlock() {
    const template = props.blocks.find((block) => block.id === selectedBlock);
    if (!template) return;
    setPlacedBlocks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sourceTemplateId: template.id,
        name: template.name,
        categoryId: template.categoryId,
        repeatCount: template.defaultRepeatCount,
        steps: structuredClone(template.steps),
      },
    ]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (placedBlocks.length === 0) {
      setError("Add at least one block");
      return;
    }
    const timestamp = new Date().toISOString();
    await props.database.saveRoutine({
      id: crypto.randomUUID(),
      name,
      blocks: placedBlocks,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await props.onSaved();
    props.onClose();
  }

  return (
    <DialogShell title="Create routine" onClose={props.onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Routine name">
          <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <div className="builder-toolbar">
          <select value={selectedBlock} onChange={(event) => setSelectedBlock(event.target.value)}>
            {props.blocks
              .filter((block) => !block.archived)
              .map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name}
                </option>
              ))}
          </select>
          <button type="button" className="button" onClick={addBlock}>
            + Add editable copy
          </button>
        </div>
        <ol className="builder-list">
          {placedBlocks.map((block, index) => (
            <li key={block.id}>
              <span className="builder-list__index">{index + 1}</span>
              <strong>{block.name}</strong>
              <label>
                Rounds{" "}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={block.repeatCount}
                  onChange={(event) =>
                    setPlacedBlocks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, repeatCount: Number(event.target.value) } : item,
                      ),
                    )
                  }
                />
              </label>
              <span>{block.steps.length} steps</span>
              <MoveButtons
                index={index}
                length={placedBlocks.length}
                move={(from, to) => setPlacedBlocks((current) => move(current, from, to))}
                remove={() => setPlacedBlocks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              />
            </li>
          ))}
        </ol>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <FormActions onCancel={props.onClose} />
      </form>
    </DialogShell>
  );
}

export function PlanDialog(props: SharedProps & { readonly routines: readonly Routine[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [weeks, setWeeks] = useState(4);
  const [date, setDate] = useState(today);
  const [selectedRoutine, setSelectedRoutine] = useState(props.routines[0]?.id ?? "");
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [repeatFirstWeek, setRepeatFirstWeek] = useState(true);

  function addSession() {
    const routine = props.routines.find((item) => item.id === selectedRoutine);
    if (!routine) return;
    setSessions((current) => [
      ...current,
      { id: crypto.randomUUID(), date, routine: structuredClone(routine), status: "planned" },
    ]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const timestamp = new Date().toISOString();
    const expandedSessions = repeatFirstWeek
      ? Array.from({ length: weeks }, (_, week) =>
          sessions.map((session) => ({
            ...structuredClone(session),
            id: week === 0 ? session.id : crypto.randomUUID(),
            date: shiftDate(session.date, week * 7),
          })),
        ).flat()
      : sessions;
    await props.database.savePlan({
      id: crypto.randomUUID(),
      name,
      startDate,
      weeks,
      sessions: expandedSessions,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await props.onSaved();
    props.onClose();
  }

  return (
    <DialogShell title="Create plan" onClose={props.onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Plan name">
            <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </Field>
          <Field label="Start date">
            <input
              type="date"
              required
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (sessions.length === 0) setDate(event.target.value);
              }}
            />
          </Field>
          <Field label="Weeks">
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(event) => setWeeks(Number(event.target.value))}
            />
          </Field>
        </div>
        <div className="builder-toolbar">
          <input aria-label="Session date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <select
            aria-label="Routine to schedule"
            value={selectedRoutine}
            onChange={(event) => setSelectedRoutine(event.target.value)}
          >
            {props.routines.map((routine) => (
              <option value={routine.id} key={routine.id}>
                {routine.name}
              </option>
            ))}
          </select>
          <button type="button" className="button" onClick={addSession}>
            + Session
          </button>
        </div>
        <ol className="builder-list">
          {sessions
            .sort((left, right) => left.date.localeCompare(right.date))
            .map((session, index) => (
              <li key={session.id}>
                <span className="builder-list__index">{index + 1}</span>
                <strong>{session.routine.name}</strong>
                <span>{session.date}</span>
                <MoveButtons
                  index={index}
                  length={sessions.length}
                  move={() => undefined}
                  remove={() => setSessions((current) => current.filter((item) => item.id !== session.id))}
                  hideMove
                />
              </li>
            ))}
        </ol>
        <label className="check-field">
          <input
            type="checkbox"
            checked={repeatFirstWeek}
            onChange={(event) => setRepeatFirstWeek(event.target.checked)}
          />
          Repeat these dated Sessions every week across the Plan. Each generated Session remains independently editable.
        </label>
        <FormActions onCancel={props.onClose} />
      </form>
    </DialogShell>
  );
}

function DialogShell({
  title,
  onClose,
  wide,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly wide?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={wide ? "dialog dialog--wide" : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header>
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="icon-button icon-button--light" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function FormActions({ saving, onCancel }: { readonly saving?: boolean; readonly onCancel: () => void }) {
  return (
    <div className="form-actions">
      <button className="button" type="button" onClick={onCancel}>
        Cancel
      </button>
      <button className="button button--primary" disabled={saving} type="submit">
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
function MoveButtons({
  index,
  length,
  move: moveItem,
  remove,
  hideMove,
}: {
  readonly index: number;
  readonly length: number;
  readonly move: (from: number, to: number) => void;
  readonly remove: () => void;
  readonly hideMove?: boolean;
}) {
  return (
    <div className="move-buttons">
      {!hideMove && (
        <>
          <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveItem(index, index - 1)}>
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={index === length - 1}
            onClick={() => moveItem(index, index + 1)}
          >
            ↓
          </button>
        </>
      )}
      <button type="button" aria-label="Remove" onClick={remove}>
        ×
      </button>
    </div>
  );
}
function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
