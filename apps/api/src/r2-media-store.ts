import type { AllowedMediaType, MediaStore } from "./app";

const MAX_BYTES = 15 * 1024 * 1024;
const PROFILE_QUOTA_BYTES = 250 * 1024 * 1024;

export class R2MediaStore implements MediaStore {
  constructor(
    private readonly database: D1Database,
    private readonly bucket: R2Bucket,
  ) {}

  async createUploadIntent(profileId: string, input: { mimeType: AllowedMediaType; bytes: number }) {
    const usage = await this.database
      .prepare(
        `
        SELECT
          COALESCE((SELECT SUM(bytes) FROM media_assets WHERE profile_id = ?1 AND state = 'ready'), 0) +
          COALESCE((SELECT SUM(bytes) FROM media_upload_intents WHERE profile_id = ?1 AND used_at IS NULL AND expires_at > ?2), 0)
          AS total_bytes
      `,
      )
      .bind(profileId, new Date().toISOString())
      .first<{ total_bytes: number }>();
    if ((usage?.total_bytes ?? 0) + input.bytes > PROFILE_QUOTA_BYTES) return null;
    const id = crypto.randomUUID();
    const uploadToken = randomCode(32);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await this.database
      .prepare(
        `INSERT INTO media_upload_intents (token_hash, id, profile_id, mime_type, bytes, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(await sha256(uploadToken), id, profileId, input.mimeType, input.bytes, expiresAt, new Date().toISOString())
      .run();
    return { id, uploadToken, uploadUrl: `/api/media/uploads/${encodeURIComponent(uploadToken)}`, expiresAt };
  }

  async upload(uploadToken: string, mimeType: string, body: ArrayBuffer): Promise<"stored" | "invalid" | "expired"> {
    if (uploadToken.length > 256 || body.byteLength < 1 || body.byteLength > MAX_BYTES) return "invalid";
    const now = new Date().toISOString();
    const intent = await this.database
      .prepare(
        `SELECT id, profile_id, mime_type, bytes FROM media_upload_intents WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2`,
      )
      .bind(await sha256(uploadToken), now)
      .first<IntentRow>();
    if (!intent) return "expired";
    if (
      intent.mime_type !== mimeType ||
      intent.bytes !== body.byteLength ||
      !matchesMedia(mimeType, new Uint8Array(body, 0, Math.min(16, body.byteLength)))
    )
      return "invalid";
    const objectKey = `${intent.profile_id}/${intent.id}`;
    await this.bucket.put(objectKey, body, {
      httpMetadata: { contentType: mimeType, cacheControl: "private, max-age=3600" },
    });
    try {
      await this.database.batch([
        this.database
          .prepare("UPDATE media_upload_intents SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL")
          .bind(now, await sha256(uploadToken)),
        this.database
          .prepare(
            `INSERT INTO media_assets (id, profile_id, object_key, mime_type, bytes, state, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'ready', ?6)`,
          )
          .bind(intent.id, intent.profile_id, objectKey, mimeType, body.byteLength, now),
      ]);
    } catch (error) {
      await this.bucket.delete(objectKey);
      throw error;
    }
    return "stored";
  }

  async get(profileId: string, id: string): Promise<Response | null> {
    const asset = await this.database
      .prepare(
        `SELECT object_key, mime_type, bytes FROM media_assets WHERE id = ?1 AND profile_id = ?2 AND state = 'ready'`,
      )
      .bind(id, profileId)
      .first<{ object_key: string; mime_type: string; bytes: number }>();
    if (!asset) return null;
    const object = await this.bucket.get(asset.object_key);
    if (!object) return null;
    return new Response(object.body, {
      headers: {
        "Content-Type": asset.mime_type,
        "Content-Length": String(asset.bytes),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

interface IntentRow {
  readonly id: string;
  readonly profile_id: string;
  readonly mime_type: string;
  readonly bytes: number;
}

function matchesMedia(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") return starts(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") return starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/webp") return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
  if (mimeType === "image/gif") return ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a");
  if (mimeType === "video/mp4") return ascii(bytes, 4, "ftyp");
  if (mimeType === "video/webm") return starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  return false;
}

function starts(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}
function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
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
