import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const [algorithm, salt, digest] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) {
    return false;
  }
  const derived = scryptSync(plainPassword, salt, 64);
  const digestBuffer = Buffer.from(digest, 'hex');
  if (derived.length !== digestBuffer.length) {
    return false;
  }
  return timingSafeEqual(derived, digestBuffer);
}
