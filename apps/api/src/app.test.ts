import { describe, expect, it } from "vitest";

import type { Routine } from "@mechastudio/domain";

import { createApiApp, type ApiDependencies, type AuthenticatedProfile, type ResourceKind } from "./app";

describe("profile API authorization", () => {
  it("requires a session and rejects another profile's object identifier", async () => {
    const dependencies = fakeDependencies();
    const app = createApiApp(dependencies);

    const anonymous = await app.request("http://app.test/api/me/routines");
    expect(anonymous.status).toBe(401);

    const ownList = await app.request("http://app.test/api/me/routines", {
      headers: { Cookie: "mechastudio_session=member-a" },
    });
    expect(ownList.status).toBe(200);
    await expect(ownList.json()).resolves.toEqual({ items: [expect.objectContaining({ id: "routine-a" })] });

    const crossProfile = await app.request("http://app.test/api/me/routines/routine-b", {
      method: "PUT",
      headers: {
        Cookie: "mechastudio_session=member-a; mechastudio_csrf=csrf-a",
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-a",
      },
      body: JSON.stringify(routine("routine-b")),
    });
    expect(crossProfile.status).toBe(404);
  });

  it("requires the double-submit CSRF value for authenticated mutations", async () => {
    const app = createApiApp(fakeDependencies());
    const response = await app.request("http://app.test/api/me/routines/routine-a", {
      method: "PUT",
      headers: { Cookie: "mechastudio_session=member-a", "Content-Type": "application/json" },
      body: JSON.stringify(routine("routine-a")),
    });
    expect(response.status).toBe(403);
  });

  it("rejects a media upload intent when the profile quota would be exceeded", async () => {
    const app = createApiApp({
      ...fakeDependencies(),
      media: {
        createUploadIntent: async () => null,
        upload: async () => "invalid",
        get: async () => null,
      },
    });
    const response = await app.request("http://app.test/api/media/upload-intents", {
      method: "POST",
      headers: {
        Cookie: "mechastudio_session=member-a; mechastudio_csrf=csrf-a",
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-a",
      },
      body: JSON.stringify({ mimeType: "image/jpeg", bytes: 1024 }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Profile media quota would be exceeded" });
  });
});

function fakeDependencies(): ApiDependencies {
  const profiles = new Map<string, AuthenticatedProfile>([
    ["member-a", { profileId: "profile-a", displayName: "Alex", role: "member", csrfToken: "csrf-a" }],
    ["member-b", { profileId: "profile-b", displayName: "Sam", role: "member", csrfToken: "csrf-b" }],
  ]);
  const resources = new Map<string, { profileId: string; value: unknown }>([
    ["routine-a", { profileId: "profile-a", value: routine("routine-a") }],
    ["routine-b", { profileId: "profile-b", value: routine("routine-b") }],
  ]);
  return {
    environment: "test",
    auth: {
      authenticate: async (token) => profiles.get(token) ?? null,
      redeemInvite: async () => null,
      recover: async () => null,
      logout: async () => undefined,
      createInvite: async () => ({ code: "invite", expiresAt: "2026-08-08T00:00:00.000Z" }),
    },
    resources: {
      list: async (profileId, kind) =>
        kind === "routines"
          ? [...resources.values()].filter((item) => item.profileId === profileId).map((item) => item.value)
          : [],
      put: async (profileId, _kind: ResourceKind, id, value) => {
        const existing = resources.get(id);
        if (existing && existing.profileId !== profileId) return false;
        resources.set(id, { profileId, value });
        return true;
      },
      listCatalog: async () => [],
      recommend: async () => "recommendation-1",
      listRecommendations: async () => [],
      moderateRecommendation: async () => false,
    },
    rateLimit: async () => true,
  };
}

function routine(id: string): Routine {
  const timestamp = "2026-08-01T08:00:00.000Z";
  return {
    id,
    name: "Routine",
    blocks: [
      {
        id: "block",
        name: "Block",
        categoryId: "training",
        repeatCount: 1,
        steps: [{ id: "rest", kind: "rest", seconds: 20 }],
      },
    ],
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
