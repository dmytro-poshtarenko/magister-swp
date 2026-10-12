import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// OWASP Password Storage Cheat Sheet minimum for scrypt: N=2^17, r=8, p=1.
// Such a hash needs 128 MiB, more than the 32 MiB Node.js allows by default.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const MAX_MEMORY = 256 * 1024 * 1024;
const KEY_LENGTH = 64;

// Stored as scrypt$N$r$p$salt$hash, so stronger parameters can be introduced
// later without breaking the hashes already in the database.
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, 'base64'),
    expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEMORY },
  );
  return timingSafeEqual(actual, expected);
}
