/**
 * Kosongkan data dummy dan isi ulang:
 *   pnpm demo:reset [--kosong] [opsi pnpm sim, mis. --lead 200 --hari 7]
 * Butuh DEMO_MODE=true dan DEMO_PASSWORD di .env. Setelah reset, simulator langsung
 * dijalankan bila API sedang hidup (pnpm dev); --kosong untuk melewatinya.
 */
import 'reflect-metadata';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as muatEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AppModule } from '../app.module';
import { pastikanBolehDemo, resetDemo } from '../demo/demo';
import { PrismaService } from '../prisma/prisma.service';

const AKAR = path.resolve(__dirname, '../../../..');
muatEnv({ path: path.join(AKAR, '.env'), quiet: true });

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const kosong = args.includes('--kosong');
  const argSim = args.filter((a) => a !== '--kosong');

  let password: string;
  try {
    password = pastikanBolehDemo(process.env);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  let hasil;
  try {
    hasil = await resetDemo(app.get(PrismaService).client, app.get(ApiKeysService), password);
  } finally {
    await app.close();
  }

  const file = path.join(AKAR, '.demo', 'kunci-simulator.json');
  mkdirSync(path.dirname(file), { recursive: true });
  const akun = (role: string) => hasil.akun.filter((a) => a.role === role).map((a) => a.email);
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        csAi: hasil.kunci.csAi,
        ethix: hasil.kunci.ethix,
        akun: { csLeader: akun('cs_leader')[0], salesOps: akun('sales_ops')[0], cs: akun('cs') },
      },
      null,
      2,
    )}\n`,
  );
  // Gudang Ethix palsu milik data lama; simulator membuat yang baru.
  rmSync(path.join(AKAR, '.demo', 'gudang-ethix.json'), { force: true });

  console.log('Data dummy dikosongkan. Akun demo (password = DEMO_PASSWORD di .env):');
  for (const a of hasil.akun) console.log(`  ${a.role.padEnd(12)} ${a.email}`);
  console.log(`API key simulator disimpan di ${path.relative(AKAR, file)} (tidak di-commit).`);

  if (kosong) return;
  const port = process.env.API_PORT ?? '3001';
  const sehat = await fetch(`http://localhost:${port}/api/v1/health`).catch(() => null);
  if (!sehat?.ok) {
    console.log(
      '\nAPI belum hidup. Jalankan `pnpm dev`, lalu `pnpm sim` untuk mengisi data dummy.',
    );
    return;
  }
  console.log('\nMenjalankan simulator…');
  const r = spawnSync('pnpm', ['--filter', '@grason/simulator', 'sim', ...argSim], {
    cwd: AKAR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(r.status ?? 1);
}

void main();
