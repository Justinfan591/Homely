import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ScanPhoto } from "@/db/schema";
import { HttpError } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
const EXT: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export function checkImage(file: File): ImageType {
  if (!IMAGE_TYPES.includes(file.type as ImageType)) throw new HttpError(400, "Photos must be JPEG, PNG, WebP or GIF.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "Each photo must be under 8 MB.");
  return file.type as ImageType;
}

/** Writes the file and returns its path relative to /uploads. */
export async function writeScanPhoto(scanId: number, bytes: Buffer, type: ImageType) {
  const rel = path.join(`scan-${scanId}`, `${crypto.randomUUID()}.${EXT[type]}`);
  await fs.mkdir(path.join(UPLOAD_DIR, `scan-${scanId}`), { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, rel), bytes);
  return rel;
}

export function readScanPhoto(photo: Pick<ScanPhoto, "path">) {
  const full = path.resolve(UPLOAD_DIR, photo.path);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new HttpError(404, "Not found.");
  return fs.readFile(full);
}

// ---------- Signed photo links ----------
// <img> tags can't send a bearer token, so each photo also gets a `src` link
// signed with SESSION_SECRET that works on its own for 24 hours.

const LINK_TTL_S = 24 * 3600;
function sign(id: number, exp: number) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters (see .env.example).");
  return crypto.createHmac("sha256", secret).update(`scan-photo:${id}:${exp}`).digest("base64url");
}

export function signedPhotoUrl(id: number, now = Date.now()) {
  // Round the expiry to the hour so links stay stable between 2-second polls (no image flicker).
  const exp = Math.ceil((now / 1000 + LINK_TTL_S) / 3600) * 3600;
  return `/api/scan-photos/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

export function validPhotoSignature(id: number, exp: string | null, sig: string | null) {
  const e = Number(exp);
  if (!sig || !Number.isInteger(e) || e * 1000 < Date.now()) return false;
  const want = Buffer.from(sign(id, e));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
