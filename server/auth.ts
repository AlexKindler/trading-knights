// Password hashing utilities (CONTRACT §5)
// Salted scrypt via Node 'crypto'. Format: "scrypt$<saltHex>$<hashHex>".
// Legacy unsalted sha256 hashes are still verifiable for backward compat and
// should be transparently upgraded on successful login.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_PREFIX = "scrypt$";

/** Hash a plaintext password with a random per-password salt via scrypt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

/** True when the stored hash is a legacy (unsalted sha256) hash needing upgrade. */
export function isLegacyHash(stored: string | null | undefined): boolean {
  return !stored || !stored.startsWith(SCRYPT_PREFIX);
}

/** Verify a plaintext password against a stored hash (scrypt or legacy sha256). */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;

  if (stored.startsWith(SCRYPT_PREFIX)) {
    const parts = stored.split("$");
    // parts = ["scrypt", saltHex, hashHex]
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const hashHex = parts[2];
    if (!salt || !hashHex) return false;
    let expected: Buffer;
    try {
      expected = Buffer.from(hashHex, "hex");
    } catch {
      return false;
    }
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  }

  // Legacy unsalted sha256 hex digest.
  const legacy = createHash("sha256").update(password).digest("hex");
  const a = Buffer.from(legacy);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
