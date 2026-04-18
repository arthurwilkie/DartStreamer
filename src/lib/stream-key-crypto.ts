import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM, packed as base64(iv).base64(tag).base64(ciphertext).
// STREAM_KEY_ENCRYPTION_KEY must be a base64-encoded 32-byte key.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getKey(): Buffer {
  const b64 = process.env.STREAM_KEY_ENCRYPTION_KEY;
  if (!b64) throw new Error("STREAM_KEY_ENCRYPTION_KEY not configured");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("STREAM_KEY_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function encryptStreamKey(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptStreamKey(packed: string): string {
  const parts = packed.split(".");
  if (parts.length !== 3) throw new Error("Malformed ciphertext");
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
