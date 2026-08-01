import JSZip from "jszip";

import { mediaAssetSchema, type MediaAsset } from "@plan-and-train/domain";

import type { DatabaseExport, StoredMedia, TrainingDatabase } from "../storage/training-database";

const BACKUP_FILE = "plan-and-train.json";
const MAX_BACKUP_BYTES = 300 * 1024 * 1024;

interface BackupDocument {
  readonly format: "plan-and-train-backup";
  readonly version: 1;
  readonly records: DatabaseExport;
  readonly media: readonly MediaAsset[];
}

export interface BackupPreview {
  readonly exercises: number;
  readonly blocks: number;
  readonly routines: number;
  readonly plans: number;
  readonly sessions: number;
  readonly mediaFiles: number;
  readonly mediaBytes: number;
}

export async function createBackup(database: TrainingDatabase): Promise<Blob> {
  const [records, media] = await Promise.all([database.exportRecords(), database.listMedia()]);
  const zip = new JSZip();
  const metadata = media.map(({ data: _data, ...asset }) => asset);
  const document: BackupDocument = { format: "plan-and-train-backup", version: 1, records, media: metadata };
  zip.file(BACKUP_FILE, JSON.stringify(document, null, 2));
  for (const asset of media) zip.file(`media/${asset.id}`, asset.data);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function inspectBackup(blob: Blob): Promise<BackupPreview> {
  const { document } = await parseBackup(blob, false);
  return preview(document);
}

export async function restoreBackup(database: TrainingDatabase, blob: Blob): Promise<void> {
  const { document, media } = await parseBackup(blob, true);
  await database.importRecords(document.records, media);
}

async function parseBackup(
  blob: Blob,
  includeMedia: boolean,
): Promise<{ document: BackupDocument; media: StoredMedia[] }> {
  if (blob.size > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 300 MiB restore limit");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentFile = zip.file(BACKUP_FILE);
  if (!documentFile) throw new Error("Backup manifest is missing");
  const raw: unknown = JSON.parse(await documentFile.async("text"));
  if (!isBackupDocument(raw)) throw new Error("Backup manifest is invalid or unsupported");

  const media: StoredMedia[] = [];
  for (const rawAsset of raw.media) {
    const asset = mediaAssetSchema.parse(rawAsset);
    const file = zip.file(`media/${asset.id}`);
    if (!file) throw new Error(`Backup media ${asset.id} is missing`);
    if (includeMedia) {
      const data = await file.async("blob");
      if (data.size !== asset.bytes) throw new Error(`Backup media ${asset.id} has an invalid size`);
      media.push({ ...asset, data });
    }
  }

  return { document: raw, media };
}

function isBackupDocument(value: unknown): value is BackupDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.format === "plan-and-train-backup" &&
    candidate.version === 1 &&
    Array.isArray(candidate.media) &&
    !!candidate.records &&
    typeof candidate.records === "object"
  );
}

function preview(document: BackupDocument): BackupPreview {
  return {
    exercises: document.records.exercises.length,
    blocks: document.records.blockTemplates.length,
    routines: document.records.routines.length,
    plans: document.records.plans.length,
    sessions: document.records.sessions.length,
    mediaFiles: document.media.length,
    mediaBytes: document.media.reduce((total, asset) => total + asset.bytes, 0),
  };
}
