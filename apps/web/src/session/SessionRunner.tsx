import { useCallback, useEffect, useRef, useState } from "react";

import { reduceSessionRunner, type SessionRunnerState } from "@plan-and-train/domain";

import { ExerciseMedia } from "../media/ExerciseMedia";
import type { TrainingDatabase } from "../storage/training-database";

interface SessionRunnerProps {
  readonly database: TrainingDatabase;
  readonly initialState: SessionRunnerState;
  readonly onChange: (state: SessionRunnerState) => void;
  readonly onExit: (state: SessionRunnerState) => void;
}

export function SessionRunner({ database, initialState, onChange, onExit }: SessionRunnerProps) {
  const [runner, setRunner] = useState(initialState);
  const warningPlayed = useRef(false);

  const dispatch = useCallback((event: Parameters<typeof reduceSessionRunner>[1]) => {
    setRunner((current) => reduceSessionRunner(current, event, Date.now()));
  }, []);

  useEffect(() => onChange(runner), [onChange, runner]);

  useEffect(() => {
    if (runner.status !== "running") return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), 200);
    return () => window.clearInterval(id);
  }, [dispatch, runner.status]);

  useEffect(() => {
    const interrupt = () => {
      if (document.hidden) dispatch({ type: "interrupt" });
    };
    document.addEventListener("visibilitychange", interrupt);
    return () => document.removeEventListener("visibilitychange", interrupt);
  }, [dispatch]);

  useEffect(() => {
    if (runner.status !== "running") return;
    let released = false;
    let sentinel: { release(): Promise<void> } | undefined;
    const wakeLock = (
      navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }
    ).wakeLock;
    void wakeLock
      ?.request("screen")
      .then((lock) => {
        if (released) void lock.release();
        else sentinel = lock;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      void sentinel?.release();
    };
  }, [runner.status]);

  useEffect(() => {
    const remaining = runner.remainingMs ?? Number.POSITIVE_INFINITY;
    if (runner.status === "running" && remaining <= 3_000 && !warningPlayed.current) {
      warningPlayed.current = true;
      playTone(520);
    }
    if (remaining > 3_000) warningPlayed.current = false;
  }, [runner.remainingMs, runner.status]);

  useEffect(() => {
    if (runner.status === "completed") playTone(760);
  }, [runner.status]);

  if (runner.status === "completed") {
    return (
      <main className="runner runner--complete">
        <p className="eyebrow">Session complete</p>
        <h1>Nicely done.</h1>
        <p>You completed {runner.snapshot.name}.</p>
        <button className="button button--primary" onClick={() => onExit(runner)}>
          Finish
        </button>
      </main>
    );
  }

  const item = runner.activeItem;
  if (!item) return null;
  const isManual = item.kind === "exercise" && item.target.kind !== "duration";
  const title = item.kind === "rest" ? "Rest" : item.exerciseName;
  const next = runner.snapshot.items[runner.currentIndex + 1];

  return (
    <main className={`runner ${item.kind === "rest" ? "runner--rest" : ""}`}>
      <header className="runner__header">
        <button
          className="icon-button"
          aria-label="Exit session"
          onClick={() => {
            if (window.confirm("Exit this session? Your progress will be marked partial.")) onExit(runner);
          }}
        >
          ×
        </button>
        <div>
          <p className="eyebrow">{item.blockName}</p>
          <p className="runner__round">
            Round {item.round} / {item.rounds}
          </p>
        </div>
        <span className="runner__progress">
          {runner.currentIndex + 1}/{runner.snapshot.items.length}
        </span>
      </header>

      <section className="runner__focus" aria-live="polite">
        <ExerciseMedia
          mediaId={item.kind === "exercise" ? item.mediaId : undefined}
          name={title}
          database={database}
          mode="runner"
          fallback={item.kind === "rest" ? "◌" : "↗"}
        />
        <p className="eyebrow">Now</p>
        <h1>{title}</h1>
        <div className="runner__target">{formatTarget(item, runner.remainingMs)}</div>
        {runner.status === "interrupted" && <p className="runner__notice">Session paused while the app was away.</p>}
        {runner.status === "paused" && <p className="runner__notice">Paused</p>}
      </section>

      <section className="runner__controls" aria-label="Session controls">
        <button
          className="button button--quiet"
          onClick={() => dispatch({ type: "previous" })}
          disabled={runner.currentIndex === 0}
        >
          Previous
        </button>
        {runner.status === "running" || runner.status === "awaiting-completion" ? (
          <button
            className="button button--primary button--large"
            onClick={() => (isManual ? dispatch({ type: "next" }) : dispatch({ type: "pause" }))}
          >
            {isManual ? "Done" : "Pause"}
          </button>
        ) : (
          <button className="button button--primary button--large" onClick={() => dispatch({ type: "resume" })}>
            Resume
          </button>
        )}
        <button className="button button--quiet" onClick={() => dispatch({ type: "next" })}>
          Skip
        </button>
      </section>

      {runner.status === "running" && !isManual && (
        <button className="runner__add-time" onClick={() => dispatch({ type: "add-time", milliseconds: 5_000 })}>
          +5 seconds
        </button>
      )}

      <footer className="runner__next">
        <span>Next</span>
        <strong>{next ? (next.kind === "rest" ? "Rest" : next.exerciseName) : "Finish"}</strong>
      </footer>
    </main>
  );
}

function formatTarget(item: NonNullable<SessionRunnerState["activeItem"]>, remainingMs: number | null): string {
  if (item.kind === "rest" || (item.kind === "exercise" && item.target.kind === "duration")) {
    const totalSeconds = Math.ceil((remainingMs ?? 0) / 1_000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }
  if (item.target.kind === "repetitions") return `${item.target.count} reps`;
  return "At your pace";
}

function playTone(frequency: number): void {
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.06;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Visual cues remain available when browser audio is unavailable.
  }
}
