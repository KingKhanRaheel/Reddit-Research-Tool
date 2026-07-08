import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    // In production this must be set. For dev, derive a stable key from SESSION_SECRET.
    const fallback = process.env.SESSION_SECRET ?? "dev-fallback-insecure-key-change-me";
    logger.warn("ENCRYPTION_KEY not set — deriving key from SESSION_SECRET. Set ENCRYPTION_KEY in production.");
    return scryptSync(fallback, "reddit-research-ai-salt", KEY_LENGTH);
  }
  // Accept a hex-encoded 32-byte key
  if (rawKey.length === 64) {
    return Buffer.from(rawKey, "hex");
  }
  return scryptSync(rawKey, "reddit-research-ai-salt", KEY_LENGTH);
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv(hex):authTag(hex):ciphertext(hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encryptedData = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

// Re-encrypt any plaintext keys that were stored before encryption was added
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

export function safeDecrypt(value: string): string {
  if (isEncrypted(value)) {
    return decrypt(value);
  }
  // Legacy plaintext — return as-is (migration path)
  return value;
}
