import { execSync } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';
import type { PrismaClient } from './generated/prisma/client';

const AKAR_DB = path.resolve(__dirname, '..');

/** URL database tes dari .env root. Menolak URL yang bukan database tes. */
export function urlDatabaseTes(): string {
  config({ path: path.resolve(AKAR_DB, '../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL belum diisi di .env');
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL harus menunjuk database berakhiran _test');
  }
  return url;
}

/** Terapkan semua migrasi ke database tes. Dipakai di globalSetup Vitest. */
export function migrasiDatabaseTes(): void {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: AKAR_DB,
    env: { ...process.env, DATABASE_URL: urlDatabaseTes() },
    stdio: 'pipe',
  });
}

/** Kosongkan semua tabel aplikasi (kecuali tabel migrasi Prisma). */
export async function kosongkanDatabase(prisma: PrismaClient): Promise<void> {
  const tabel = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tabel.length === 0) return;
  const daftar = tabel.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${daftar} RESTART IDENTITY CASCADE`);
}
