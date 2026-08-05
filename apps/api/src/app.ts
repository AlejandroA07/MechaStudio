import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import {
  blockTemplateSchema,
  exerciseSchema,
  planSchema,
  routineSchema,
  sessionRecordSchema,
} from "@mechastudio/domain";

export type ProfileRole = "admin" | "member";
export type ResourceKind = "exercises" | "blocks" | "routines" | "plans" | "sessions";

export interface AuthenticatedProfile {
  readonly profileId: string;
  readonly displayName: string;
  readonly role: ProfileRole;
  readonly csrfToken: string;
}

export interface RedeemResult {
  readonly profile: AuthenticatedProfile;
  readonly sessionToken: string;
  readonly recoveryCode: string;
}

export interface RecoveryResult {
  readonly profile: AuthenticatedProfile;
  readonly sessionToken: string;
}

export interface AuthStore {
  authenticate(sessionToken: string): Promise<AuthenticatedProfile | null>;
  redeemInvite(input: { code: string; displayName: string }): Promise<RedeemResult | null>;
  recover(code: string): Promise<RecoveryResult | null>;
  logout(sessionToken: string): Promise<void>;
  createInvite(input: {
    label: string;
    expiresAt: string;
    createdBy: string;
  }): Promise<{ code: string; expiresAt: string }>;
}

export interface ResourceStore {
  list(profileId: string, kind: ResourceKind): Promise<unknown[]>;
  put(profileId: string, kind: ResourceKind, id: string, value: unknown): Promise<boolean>;
  listCatalog(): Promise<unknown[]>;
  recommend(profileId: string, input: { exerciseId: string; note?: string }): Promise<string>;
  listRecommendations(): Promise<unknown[]>;
  moderateRecommendation(adminProfileId: string, id: string, decision: "approved" | "rejected"): Promise<boolean>;
}

export interface MediaStore {
  createUploadIntent(
    profileId: string,
    input: { mimeType: AllowedMediaType; bytes: number },
  ): Promise<{ id: string; uploadToken: string; uploadUrl: string; expiresAt: string } | null>;
  upload(uploadToken: string, mimeType: string, body: ArrayBuffer): Promise<"stored" | "invalid" | "expired">;
  get(profileId: string, id: string): Promise<Response | null>;
}

export type AllowedMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "video/mp4" | "video/webm";

export interface ApiDependencies {
  readonly environment: "development" | "test" | "production";
  readonly auth: AuthStore;
  readonly resources: ResourceStore;
  readonly media?: MediaStore;
  readonly rateLimit: (key: string) => Promise<boolean>;
}

const inviteRedeemSchema = z
  .object({
    code: z.string().trim().min(12).max(256),
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();
const recoverySchema = z.object({ code: z.string().trim().min(12).max(256) }).strict();
const inviteCreateSchema = z
  .object({ label: z.string().trim().min(1).max(80), expiresInDays: z.number().int().min(1).max(30) })
  .strict();
const recommendationSchema = z
  .object({ exerciseId: z.string().min(1).max(128), note: z.string().trim().max(500).optional() })
  .strict();
const moderationSchema = z.object({ decision: z.enum(["approved", "rejected"]) }).strict();
const uploadIntentSchema = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(15 * 1024 * 1024),
  })
  .strict();

export function createApiApp(dependencies: ApiDependencies): Hono {
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header("Referrer-Policy", "no-referrer");
    context.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    context.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (dependencies.environment === "production")
      context.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  });

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.post("/api/invites/redeem", async (context) => {
    if (!(await allowAuthAttempt(context, dependencies))) return context.json({ error: "Try again later" }, 429);
    const input = await parseJson(context, inviteRedeemSchema);
    if (!input.ok) return input.response;
    const result = await dependencies.auth.redeemInvite(input.value);
    if (!result) return context.json({ error: "Invite is invalid or expired" }, 400);
    setSessionCookies(context, result.profile, result.sessionToken, dependencies.environment);
    return context.json({ profile: publicProfile(result.profile), recoveryCode: result.recoveryCode }, 201);
  });

  app.post("/api/access/recover", async (context) => {
    if (!(await allowAuthAttempt(context, dependencies))) return context.json({ error: "Try again later" }, 429);
    const input = await parseJson(context, recoverySchema);
    if (!input.ok) return input.response;
    const result = await dependencies.auth.recover(input.value.code);
    if (!result) return context.json({ error: "Recovery code is invalid" }, 400);
    setSessionCookies(context, result.profile, result.sessionToken, dependencies.environment);
    return context.json({ profile: publicProfile(result.profile) });
  });

  app.post("/api/logout", async (context) => {
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    if (!validCsrf(context, session.profile)) return context.json({ error: "CSRF validation failed" }, 403);
    await dependencies.auth.logout(session.token);
    deleteCookie(context, "mechastudio_session", cookieOptions(dependencies.environment));
    deleteCookie(context, "mechastudio_csrf", { ...cookieOptions(dependencies.environment), httpOnly: false });
    return context.body(null, 204);
  });

  app.get("/api/me", async (context) => {
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    return context.json({ profile: publicProfile(session.profile) });
  });

  app.get("/api/me/:kind", async (context) => {
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    const kind = resourceKind(context.req.param("kind"));
    if (!kind) return context.json({ error: "Resource not found" }, 404);
    return context.json({ items: await dependencies.resources.list(session.profile.profileId, kind) });
  });

  app.put("/api/me/:kind/:id", async (context) => {
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    if (!validCsrf(context, session.profile)) return context.json({ error: "CSRF validation failed" }, 403);
    const kind = resourceKind(context.req.param("kind"));
    if (!kind) return context.json({ error: "Resource not found" }, 404);
    const parsed = await parseResource(context, kind);
    if (!parsed.ok) return parsed.response;
    const id = context.req.param("id");
    if (!hasMatchingId(parsed.value, id))
      return context.json({ error: "Resource identifier does not match body" }, 400);
    if (!(await dependencies.resources.put(session.profile.profileId, kind, id, parsed.value)))
      return context.json({ error: "Resource not found" }, 404);
    return context.json({ item: parsed.value });
  });

  app.get("/api/catalog/exercises", async (context) => {
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    return context.json({ items: await dependencies.resources.listCatalog() });
  });

  app.post("/api/recommendations", async (context) => {
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    if (!validCsrf(context, session.profile)) return context.json({ error: "CSRF validation failed" }, 403);
    const input = await parseJson(context, recommendationSchema);
    if (!input.ok) return input.response;
    const id = await dependencies.resources.recommend(session.profile.profileId, {
      exerciseId: input.value.exerciseId,
      ...(input.value.note ? { note: input.value.note } : {}),
    });
    return context.json({ id, status: "pending" }, 201);
  });

  app.post("/api/media/upload-intents", async (context) => {
    if (!dependencies.media) return context.json({ error: "Media storage is not configured" }, 503);
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    if (!validCsrf(context, session.profile)) return context.json({ error: "CSRF validation failed" }, 403);
    const input = await parseJson(context, uploadIntentSchema);
    if (!input.ok) return input.response;
    const intent = await dependencies.media.createUploadIntent(session.profile.profileId, input.value);
    return intent ? context.json(intent, 201) : context.json({ error: "Profile media quota would be exceeded" }, 413);
  });

  app.put("/api/media/uploads/:token", async (context) => {
    if (!dependencies.media) return context.json({ error: "Media storage is not configured" }, 503);
    const contentLength = Number(context.req.header("Content-Length") ?? "0");
    if (!Number.isInteger(contentLength) || contentLength < 1 || contentLength > 15 * 1024 * 1024)
      return context.json({ error: "Upload size is invalid" }, 400);
    const body = await context.req.arrayBuffer();
    if (body.byteLength !== contentLength) return context.json({ error: "Upload size does not match" }, 400);
    const result = await dependencies.media.upload(
      context.req.param("token"),
      context.req.header("Content-Type") ?? "",
      body,
    );
    if (result === "expired") return context.json({ error: "Upload intent is invalid or expired" }, 404);
    if (result === "invalid") return context.json({ error: "Upload contents are invalid" }, 400);
    return context.json({ status: "stored" }, 201);
  });

  app.get("/api/media/:id", async (context) => {
    if (!dependencies.media) return context.json({ error: "Media storage is not configured" }, 503);
    const session = await authenticate(context, dependencies);
    if (!session) return context.json({ error: "Authentication required" }, 401);
    return (
      (await dependencies.media.get(session.profile.profileId, context.req.param("id"))) ??
      context.json({ error: "Media not found" }, 404)
    );
  });

  app.post("/api/admin/invites", async (context) => {
    const admin = await requireAdmin(context, dependencies);
    if (!admin.ok) return admin.response;
    if (!validCsrf(context, admin.profile)) return context.json({ error: "CSRF validation failed" }, 403);
    const input = await parseJson(context, inviteCreateSchema);
    if (!input.ok) return input.response;
    const expiresAt = new Date(Date.now() + input.value.expiresInDays * 86_400_000).toISOString();
    return context.json(
      await dependencies.auth.createInvite({ label: input.value.label, expiresAt, createdBy: admin.profile.profileId }),
      201,
    );
  });

  app.get("/api/admin/recommendations", async (context) => {
    const admin = await requireAdmin(context, dependencies);
    if (!admin.ok) return admin.response;
    return context.json({ items: await dependencies.resources.listRecommendations() });
  });

  app.post("/api/admin/recommendations/:id", async (context) => {
    const admin = await requireAdmin(context, dependencies);
    if (!admin.ok) return admin.response;
    if (!validCsrf(context, admin.profile)) return context.json({ error: "CSRF validation failed" }, 403);
    const input = await parseJson(context, moderationSchema);
    if (!input.ok) return input.response;
    const changed = await dependencies.resources.moderateRecommendation(
      admin.profile.profileId,
      context.req.param("id"),
      input.value.decision,
    );
    return changed
      ? context.json({ status: input.value.decision })
      : context.json({ error: "Recommendation not found" }, 404);
  });

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((_error, context) => context.json({ error: "Request could not be completed" }, 500));
  return app;
}

async function authenticate(
  context: Context,
  dependencies: ApiDependencies,
): Promise<{ token: string; profile: AuthenticatedProfile } | null> {
  const token = getCookie(context, "mechastudio_session");
  if (!token || token.length > 256) return null;
  const profile = await dependencies.auth.authenticate(token);
  return profile ? { token, profile } : null;
}

async function requireAdmin(
  context: Context,
  dependencies: ApiDependencies,
): Promise<{ ok: true; profile: AuthenticatedProfile } | { ok: false; response: Response }> {
  const session = await authenticate(context, dependencies);
  if (!session) return { ok: false, response: context.json({ error: "Authentication required" }, 401) };
  if (session.profile.role !== "admin")
    return { ok: false, response: context.json({ error: "Administrator access required" }, 403) };
  return { ok: true, profile: session.profile };
}

function validCsrf(context: Context, profile: AuthenticatedProfile): boolean {
  const header = context.req.header("X-CSRF-Token") ?? "";
  const cookie = getCookie(context, "mechastudio_csrf") ?? "";
  return constantTimeEqual(header, profile.csrfToken) && constantTimeEqual(cookie, profile.csrfToken);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length || left.length === 0) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

function setSessionCookies(
  context: Context,
  profile: AuthenticatedProfile,
  sessionToken: string,
  environment: ApiDependencies["environment"],
): void {
  setCookie(context, "mechastudio_session", sessionToken, {
    ...cookieOptions(environment),
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
  setCookie(context, "mechastudio_csrf", profile.csrfToken, {
    ...cookieOptions(environment),
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
}

function cookieOptions(environment: ApiDependencies["environment"]) {
  return { path: "/", secure: environment === "production", sameSite: "Strict" as const };
}

async function allowAuthAttempt(context: Context, dependencies: ApiDependencies): Promise<boolean> {
  const key = context.req.header("CF-Connecting-IP") ?? "unknown";
  return dependencies.rateLimit(`auth:${key.slice(0, 80)}`);
}

async function parseJson<T>(
  context: Context,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    const value = schema.parse(await context.req.json());
    return { ok: true, value };
  } catch {
    return { ok: false, response: context.json({ error: "Request body is invalid" }, 400) };
  }
}

async function parseResource(context: Context, kind: ResourceKind) {
  const schemas: Record<ResourceKind, z.ZodType<unknown>> = {
    exercises: exerciseSchema,
    blocks: blockTemplateSchema,
    routines: routineSchema,
    plans: planSchema,
    sessions: sessionRecordSchema,
  };
  const result = await parseJson(context, schemas[kind]);
  if (result.ok && kind === "exercises" && (result.value as { origin: string }).origin !== "custom") {
    return { ok: false as const, response: context.json({ error: "Profile exercises must be custom" }, 400) };
  }
  return result;
}

function hasMatchingId(value: unknown, id: string): boolean {
  return !!value && typeof value === "object" && "id" in value && (value as { id: unknown }).id === id;
}

function resourceKind(value: string): ResourceKind | undefined {
  return (["exercises", "blocks", "routines", "plans", "sessions"] as const).find((kind) => kind === value);
}

function publicProfile(profile: AuthenticatedProfile) {
  return { id: profile.profileId, displayName: profile.displayName, role: profile.role };
}
