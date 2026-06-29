import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash de contraseñas con scrypt (incluido en Node, sin dependencias nativas).
 * Formato almacenado: scrypt$<salt_hex>$<hash_hex>
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(password, salt, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
