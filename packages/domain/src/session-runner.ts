import type { RuntimeItem, RuntimeSessionSnapshot } from "./compile-routine";

export type SessionRunnerStatus = "ready" | "running" | "awaiting-completion" | "paused" | "interrupted" | "completed";

export interface SessionRunnerState {
  readonly snapshot: RuntimeSessionSnapshot;
  readonly currentIndex: number;
  readonly activeItem: RuntimeItem | null;
  readonly status: SessionRunnerStatus;
  readonly deadlineMs: number | null;
  readonly remainingMs: number | null;
}

export type SessionRunnerEvent =
  | { readonly type: "start" }
  | { readonly type: "tick" }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "interrupt" }
  | { readonly type: "next" }
  | { readonly type: "previous" }
  | { readonly type: "add-time"; readonly milliseconds: number };

export function createSessionRunner(snapshot: RuntimeSessionSnapshot): SessionRunnerState {
  return {
    snapshot,
    currentIndex: 0,
    activeItem: snapshot.items[0] ?? null,
    status: snapshot.items.length === 0 ? "completed" : "ready",
    deadlineMs: null,
    remainingMs: null,
  };
}

export function reduceSessionRunner(
  state: SessionRunnerState,
  event: SessionRunnerEvent,
  nowMs: number,
): SessionRunnerState {
  switch (event.type) {
    case "start":
      return state.status === "ready" ? enterItem(state, state.currentIndex, nowMs) : state;
    case "tick":
      return tick(state, nowMs);
    case "pause":
      return pause(state, nowMs, "paused");
    case "interrupt":
      return pause(state, nowMs, "interrupted");
    case "resume":
      return resume(state, nowMs);
    case "next":
      return enterItem(state, state.currentIndex + 1, nowMs);
    case "previous":
      return enterItem(state, Math.max(0, state.currentIndex - 1), nowMs);
    case "add-time":
      return addTime(state, event.milliseconds, nowMs);
  }
}

function tick(state: SessionRunnerState, nowMs: number): SessionRunnerState {
  if (state.status !== "running" || state.deadlineMs === null) return state;
  const remainingMs = Math.max(0, state.deadlineMs - nowMs);
  if (remainingMs > 0) return { ...state, remainingMs };
  return enterItem(state, state.currentIndex + 1, nowMs);
}

function pause(state: SessionRunnerState, nowMs: number, status: "paused" | "interrupted"): SessionRunnerState {
  if (state.status !== "running" && state.status !== "awaiting-completion") return state;
  const remainingMs = state.deadlineMs === null ? null : Math.max(0, state.deadlineMs - nowMs);
  return { ...state, status, deadlineMs: null, remainingMs };
}

function resume(state: SessionRunnerState, nowMs: number): SessionRunnerState {
  if (state.status !== "paused" && state.status !== "interrupted") return state;
  if (!state.activeItem) return { ...state, status: "completed" };
  if (!isTimed(state.activeItem)) {
    return { ...state, status: "awaiting-completion", deadlineMs: null, remainingMs: null };
  }
  const remainingMs = state.remainingMs ?? durationMs(state.activeItem);
  return { ...state, status: "running", deadlineMs: nowMs + remainingMs, remainingMs };
}

function addTime(state: SessionRunnerState, milliseconds: number, nowMs: number): SessionRunnerState {
  if (state.status !== "running" || state.deadlineMs === null || milliseconds <= 0) return state;
  const deadlineMs = state.deadlineMs + milliseconds;
  return { ...state, deadlineMs, remainingMs: Math.max(0, deadlineMs - nowMs) };
}

function enterItem(state: SessionRunnerState, index: number, nowMs: number): SessionRunnerState {
  const activeItem = state.snapshot.items[index] ?? null;
  if (!activeItem) {
    return {
      ...state,
      currentIndex: state.snapshot.items.length,
      activeItem: null,
      status: "completed",
      deadlineMs: null,
      remainingMs: 0,
    };
  }

  if (!isTimed(activeItem)) {
    return {
      ...state,
      currentIndex: index,
      activeItem,
      status: "awaiting-completion",
      deadlineMs: null,
      remainingMs: null,
    };
  }

  const remainingMs = durationMs(activeItem);
  return {
    ...state,
    currentIndex: index,
    activeItem,
    status: "running",
    deadlineMs: nowMs + remainingMs,
    remainingMs,
  };
}

function isTimed(item: RuntimeItem): boolean {
  return item.kind === "rest" || item.target.kind === "duration";
}

function durationMs(item: RuntimeItem): number {
  if (item.kind === "rest") return item.seconds * 1_000;
  if (item.target.kind === "duration") return item.target.seconds * 1_000;
  return 0;
}
