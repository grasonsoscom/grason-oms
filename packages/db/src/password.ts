import { hash, verify } from '@node-rs/argon2';

export const PANJANG_PASSWORD_MINIMAL = 12;

/** argon2id dengan parameter bawaan @node-rs/argon2. */
export function hashPassword(password: string): Promise<string> {
  if (password.length < PANJANG_PASSWORD_MINIMAL) {
    throw new Error(`Password minimal ${PANJANG_PASSWORD_MINIMAL} karakter`);
  }
  return hash(password);
}

export async function cocokPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
