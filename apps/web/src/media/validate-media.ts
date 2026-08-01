import type { MediaAsset } from "@plan-and-train/domain";

export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

type AcceptedMedia = Pick<MediaAsset, "kind" | "mimeType" | "bytes">;

const accepted = {
  "image/jpeg": { kind: "image", matches: (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  "image/png": {
    kind: "image",
    matches: (bytes: Uint8Array) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  "image/webp": { kind: "image", matches: (bytes: Uint8Array) => ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP") },
  "image/gif": { kind: "gif", matches: (bytes: Uint8Array) => ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a") },
  "video/mp4": { kind: "video", matches: (bytes: Uint8Array) => ascii(bytes, 4, "ftyp") },
  "video/webm": { kind: "video", matches: (bytes: Uint8Array) => startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) },
} as const;

export async function validateExerciseMedia(file: File): Promise<AcceptedMedia> {
  if (file.size < 1) throw new Error("Media file is empty");
  if (file.size > MAX_MEDIA_BYTES) throw new Error("Media file exceeds the 15 MiB limit");
  const rule = accepted[file.type as keyof typeof accepted];
  if (!rule) throw new Error("Media type is not supported");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!rule.matches(bytes)) throw new Error("Media contents do not match the selected file type");
  return { kind: rule.kind, mimeType: file.type as AcceptedMedia["mimeType"], bytes: file.size };
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}
