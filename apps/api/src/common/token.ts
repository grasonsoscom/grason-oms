import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(nilai: string): string {
  return createHash('sha256').update(nilai).digest('hex');
}

export function tokenAcak(byte = 32): string {
  return randomBytes(byte).toString('base64url');
}

export function samaAman(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
