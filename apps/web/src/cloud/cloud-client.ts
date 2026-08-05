import type { BlockTemplate, Exercise, Plan, Routine, SessionRecord } from "@mechastudio/domain";

import type { DatabaseExport, TrainingDatabase } from "../storage/training-database";

export interface CloudProfile {
  readonly id: string;
  readonly displayName: string;
  readonly role: "admin" | "member";
}

export async function getCloudProfile(): Promise<CloudProfile | null> {
  const response = await fetch("/api/me", { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (response.status === 401 || response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to load profile");
  return ((await response.json()) as { profile: CloudProfile }).profile;
}

export async function redeemInvite(
  code: string,
  displayName: string,
): Promise<{ profile: CloudProfile; recoveryCode: string }> {
  return requestJson("/api/invites/redeem", { method: "POST", body: JSON.stringify({ code, displayName }) }, false);
}

export async function recoverProfile(code: string): Promise<{ profile: CloudProfile }> {
  return requestJson("/api/access/recover", { method: "POST", body: JSON.stringify({ code }) }, false);
}

export async function logoutProfile(): Promise<void> {
  await requestJson("/api/logout", { method: "POST" }, true);
}

export async function syncWithCloud(database: TrainingDatabase): Promise<"signed-out" | "synced"> {
  const profile = await getCloudProfile();
  if (!profile) return "signed-out";
  const local = await database.exportRecords();
  await pushCollection(
    "exercises",
    local.exercises.filter((exercise) => exercise.origin === "custom"),
  );
  await pushCollection("blocks", local.blockTemplates);
  await pushCollection("routines", local.routines);
  await pushCollection("plans", local.plans);
  await pushCollection("sessions", local.sessions);

  const [exercises, blocks, routines, plans, sessions] = await Promise.all([
    getCollection<Exercise>("exercises"),
    getCollection<BlockTemplate>("blocks"),
    getCollection<Routine>("routines"),
    getCollection<Plan>("plans"),
    getCollection<SessionRecord>("sessions"),
  ]);
  const merged: DatabaseExport = {
    ...local,
    exportedAt: new Date().toISOString(),
    exercises: mergeById(local.exercises, exercises),
    blockTemplates: mergeById(local.blockTemplates, blocks),
    routines: mergeById(local.routines, routines),
    plans: mergeById(local.plans, plans),
    sessions: mergeById(local.sessions, sessions),
  };
  await database.importRecords(merged);
  return "synced";
}

export async function recommendExercise(exerciseId: string, note?: string): Promise<void> {
  await requestJson(
    "/api/recommendations",
    { method: "POST", body: JSON.stringify({ exerciseId, ...(note ? { note } : {}) }) },
    true,
  );
}

async function pushCollection(kind: string, records: readonly { id: string }[]): Promise<void> {
  for (const record of records) {
    await requestJson(
      `/api/me/${kind}/${encodeURIComponent(record.id)}`,
      { method: "PUT", body: JSON.stringify(record) },
      true,
    );
  }
}

async function getCollection<T>(kind: string): Promise<T[]> {
  const response = await fetch(`/api/me/${kind}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Unable to download ${kind}`);
  return ((await response.json()) as { items: T[] }).items;
}

async function requestJson<T>(url: string, init: RequestInit, csrf: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-CSRF-Token", readCookie("mechastudio_csrf"));
  const response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
    throw new Error(body.error ?? "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function readCookie(name: string): string {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function mergeById<T extends { id: string }>(local: readonly T[], remote: readonly T[]): T[] {
  return [...new Map([...local, ...remote].map((record) => [record.id, record])).values()];
}
