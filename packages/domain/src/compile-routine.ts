import type { Exercise, ExerciseTarget, Routine } from "./model";

export interface RuntimeExerciseItem {
  readonly id: string;
  readonly kind: "exercise";
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly mediaId?: string;
  readonly blockName: string;
  readonly round: number;
  readonly rounds: number;
  readonly target: ExerciseTarget;
}

export interface RuntimeRestItem {
  readonly id: string;
  readonly kind: "rest";
  readonly blockName: string;
  readonly round: number;
  readonly rounds: number;
  readonly seconds: number;
}

export type RuntimeItem = RuntimeExerciseItem | RuntimeRestItem;

export interface RuntimeSessionSnapshot {
  readonly id: string;
  readonly routineId: string;
  readonly name: string;
  readonly items: readonly RuntimeItem[];
}

export function compileRoutine(
  routine: Routine,
  exercises: readonly Exercise[],
  sessionId: string,
): RuntimeSessionSnapshot {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const items: RuntimeItem[] = [];

  routine.blocks.forEach((block, blockIndex) => {
    for (let round = 1; round <= block.repeatCount; round += 1) {
      block.steps.forEach((step, stepIndex) => {
        const id = `${sessionId}:${blockIndex}:${round}:${stepIndex}`;
        if (step.kind === "rest") {
          items.push(
            Object.freeze({
              id,
              kind: "rest",
              blockName: block.name,
              round,
              rounds: block.repeatCount,
              seconds: step.seconds,
            }),
          );
          return;
        }

        const exercise = exerciseById.get(step.exerciseId);
        if (!exercise) throw new Error(`Exercise ${step.exerciseId} is not available`);
        items.push(
          Object.freeze({
            id,
            kind: "exercise",
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            ...(exercise.mediaId ? { mediaId: exercise.mediaId } : {}),
            blockName: block.name,
            round,
            rounds: block.repeatCount,
            target: Object.freeze({ ...step.target }),
          }),
        );
      });
    }
  });

  return Object.freeze({
    id: sessionId,
    routineId: routine.id,
    name: routine.name,
    items: Object.freeze(items),
  });
}
