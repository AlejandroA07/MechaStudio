import type { AuthStore, AuthenticatedProfile, RecoveryResult, RedeemResult, ResourceKind, ResourceStore } from "./app";

export class D1AuthStore implements AuthStore {
  constructor(private readonly database: D1Database) {}

  async authenticate(sessionToken: string): Promise<AuthenticatedProfile | null> {
    const tokenHash = await sha256(sessionToken);
    const row = await this.database
      .prepare(
        `
      SELECT p.id AS profile_id, p.display_name, p.role, s.csrf_token
      FROM sessions s JOIN profiles p ON p.id = s.profile_id
      WHERE s.token_hash = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2
    `,
      )
      .bind(tokenHash, new Date().toISOString())
      .first<AuthRow>();
    return row ? profile(row) : null;
  }

  async redeemInvite(input: { code: string; displayName: string }): Promise<RedeemResult | null> {
    const codeHash = await sha256(input.code);
    const now = new Date().toISOString();
    const invite = await this.database
      .prepare(
        `
      SELECT id FROM invites WHERE code_hash = ?1 AND used_at IS NULL AND expires_at > ?2
    `,
      )
      .bind(codeHash, now)
      .first<{ id: string }>();
    if (!invite) return null;

    const profileId = crypto.randomUUID();
    const sessionToken = randomCode(32);
    const recoveryCode = randomCode(24);
    const csrfToken = randomCode(24);
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    try {
      await this.database.batch([
        this.database
          .prepare(
            `UPDATE invites SET used_at = ?1, used_by_profile_id = ?2 WHERE id = ?3 AND used_at IS NULL AND expires_at > ?1`,
          )
          .bind(now, profileId, invite.id),
        this.database
          .prepare(
            `INSERT INTO profiles (id, display_name, role, invite_id, created_at) SELECT ?1, ?2, 'member', id, ?3 FROM invites WHERE id = ?4 AND used_by_profile_id = ?1`,
          )
          .bind(profileId, input.displayName, now, invite.id),
        this.database
          .prepare(`INSERT INTO recovery_credentials (profile_id, code_hash, created_at) VALUES (?1, ?2, ?3)`)
          .bind(profileId, await sha256(recoveryCode), now),
        this.database
          .prepare(
            `INSERT INTO sessions (token_hash, profile_id, csrf_token, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
          )
          .bind(await sha256(sessionToken), profileId, csrfToken, expiresAt, now),
      ]);
    } catch {
      return null;
    }
    return {
      profile: { profileId, displayName: input.displayName, role: "member", csrfToken },
      sessionToken,
      recoveryCode,
    };
  }

  async recover(code: string): Promise<RecoveryResult | null> {
    const row = await this.database
      .prepare(
        `
      SELECT p.id AS profile_id, p.display_name, p.role
      FROM recovery_credentials r JOIN profiles p ON p.id = r.profile_id
      WHERE r.code_hash = ?1 AND r.revoked_at IS NULL
    `,
      )
      .bind(await sha256(code))
      .first<Omit<AuthRow, "csrf_token">>();
    if (!row) return null;
    const sessionToken = randomCode(32);
    const csrfToken = randomCode(24);
    const now = new Date().toISOString();
    await this.database
      .prepare(
        `INSERT INTO sessions (token_hash, profile_id, csrf_token, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(
        await sha256(sessionToken),
        row.profile_id,
        csrfToken,
        new Date(Date.now() + 30 * 86_400_000).toISOString(),
        now,
      )
      .run();
    return { profile: profile({ ...row, csrf_token: csrfToken }), sessionToken };
  }

  async logout(sessionToken: string): Promise<void> {
    await this.database
      .prepare("UPDATE sessions SET revoked_at = ?1 WHERE token_hash = ?2")
      .bind(new Date().toISOString(), await sha256(sessionToken))
      .run();
  }

  async createInvite(input: {
    label: string;
    expiresAt: string;
    createdBy: string;
  }): Promise<{ code: string; expiresAt: string }> {
    const code = randomCode(18);
    await this.database
      .prepare(
        `INSERT INTO invites (id, label, code_hash, expires_at, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(
        crypto.randomUUID(),
        input.label,
        await sha256(code),
        input.expiresAt,
        input.createdBy,
        new Date().toISOString(),
      )
      .run();
    return { code, expiresAt: input.expiresAt };
  }
}

export class D1ResourceStore implements ResourceStore {
  constructor(private readonly database: D1Database) {}

  async list(profileId: string, kind: ResourceKind): Promise<unknown[]> {
    const result = await this.database
      .prepare(
        `SELECT payload_json FROM profile_resources WHERE profile_id = ?1 AND kind = ?2 ORDER BY updated_at DESC LIMIT 1000`,
      )
      .bind(profileId, kind)
      .all<{ payload_json: string }>();
    return result.results.map((row) => JSON.parse(row.payload_json) as unknown);
  }

  async put(profileId: string, kind: ResourceKind, id: string, value: unknown): Promise<boolean> {
    const owner = await this.database
      .prepare("SELECT profile_id FROM profile_resources WHERE kind = ?1 AND id = ?2")
      .bind(kind, id)
      .first<{ profile_id: string }>();
    if (owner && owner.profile_id !== profileId) return false;
    await this.database
      .prepare(
        `
      INSERT INTO profile_resources (profile_id, kind, id, payload_json, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(profile_id, kind, id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
    `,
      )
      .bind(profileId, kind, id, JSON.stringify(value), new Date().toISOString())
      .run();
    return true;
  }

  async listCatalog(): Promise<unknown[]> {
    const result = await this.database
      .prepare("SELECT payload_json FROM catalog_exercises WHERE archived = 0 ORDER BY name LIMIT 5000")
      .all<{ payload_json: string }>();
    return result.results.map((row) => JSON.parse(row.payload_json) as unknown);
  }

  async recommend(profileId: string, input: { exerciseId: string; note?: string }): Promise<string> {
    const resource = await this.database
      .prepare("SELECT id FROM profile_resources WHERE profile_id = ?1 AND kind = 'exercises' AND id = ?2")
      .bind(profileId, input.exerciseId)
      .first();
    if (!resource) throw new Error("Exercise is not owned by this profile");
    const id = crypto.randomUUID();
    await this.database
      .prepare(
        `INSERT INTO recommendations (id, profile_id, exercise_id, note, status, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)`,
      )
      .bind(id, profileId, input.exerciseId, input.note ?? null, new Date().toISOString())
      .run();
    return id;
  }

  async listRecommendations(): Promise<unknown[]> {
    const result = await this.database
      .prepare(
        `SELECT id, profile_id, exercise_id, note, status, created_at FROM recommendations ORDER BY created_at DESC LIMIT 500`,
      )
      .all();
    return result.results;
  }

  async moderateRecommendation(
    adminProfileId: string,
    id: string,
    decision: "approved" | "rejected",
  ): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE recommendations SET status = ?1, reviewed_by = ?2, reviewed_at = ?3 WHERE id = ?4 AND status = 'pending'`,
      )
      .bind(decision, adminProfileId, new Date().toISOString(), id)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }
}

interface AuthRow {
  readonly profile_id: string;
  readonly display_name: string;
  readonly role: "admin" | "member";
  readonly csrf_token: string;
}

function profile(row: AuthRow): AuthenticatedProfile {
  return { profileId: row.profile_id, displayName: row.display_name, role: row.role, csrfToken: row.csrf_token };
}

function randomCode(bytes: number): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buffer))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
