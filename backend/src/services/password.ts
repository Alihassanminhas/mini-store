import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const keyLength = 64;

function deriveKey(password: string, salt: Buffer, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, { N: 16_384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, encodedSalt, encodedKey] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || !cost || !blockSize || !parallelization || !encodedSalt || !encodedKey) return false;

  try {
    const expectedKey = Buffer.from(encodedKey, 'base64url');
    const actualKey = await deriveKey(password, Buffer.from(encodedSalt, 'base64url'), {
      N: Number(cost), r: Number(blockSize), p: Number(parallelization),
    });
    return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
