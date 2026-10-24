import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq, count } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Photo } from "@/db/schema";
import { HttpError } from "./auth";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_JOB = 12;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function savePhoto(jobId: number, userId: number, file: File, label?: string | null): Promise<Photo> {
  const ext = EXT[file.type];
  if (!ext) throw new HttpError(400, "Photos must be JPEG, PNG, WebP or GIF.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "Each photo must be under 8 MB.");
  const existing = db.select({ n: count() }).from(schema.photos).where(eq(schema.photos.jobId, jobId)).get();
  if ((existing?.n ?? 0) >= MAX_PHOTOS_PER_JOB) {
    throw new HttpError(400, `A job can have at most ${MAX_PHOTOS_PER_JOB} photos.`);
  }

  const rel = path.join(`job-${jobId}`, `${crypto.randomUUID()}.${ext}`);
  await fs.mkdir(path.join(UPLOAD_DIR, `job-${jobId}`), { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, rel), Buffer.from(await file.arrayBuffer()));

  return db
    .insert(schema.photos)
    .values({ jobId, uploadedBy: userId, path: rel, mime: file.type, label: label?.slice(0, 80) || null })
    .returning()
    .get();
}

export function readPhoto(photo: Photo) {
  const full = path.resolve(UPLOAD_DIR, photo.path);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new HttpError(404, "Not found.");
  return fs.readFile(full);
}

export function unsentPhotos(jobId: number) {
  return db
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.jobId, jobId), eq(schema.photos.sentToAgent, false)))
    .all();
}
