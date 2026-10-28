/**
 * Buat API key dari terminal, mis. untuk simulator:
 *   pnpm apikey:create --sistem cs_ai --nama "Simulator CS AI"
 * Kunci utuh hanya dicetak sekali; simpan di .env sistem pemakainya.
 */
import 'reflect-metadata';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config as muatEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { SISTEM, type Sistem } from '@grason/shared';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AppModule } from '../app.module';

muatEnv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: { sistem: { type: 'string' }, nama: { type: 'string' } },
  });
  const sistem = values.sistem as Sistem | undefined;
  if (!sistem || !SISTEM.includes(sistem) || !values.nama) {
    console.error(`Pakai: --sistem <${SISTEM.join('|')}> --nama "<nama kunci>"`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const hasil = await app.get(ApiKeysService).buat({ nama: values.nama, sistem });
    console.log(
      `API key "${hasil.nama}" (${hasil.sistem}) dibuat. Scope: ${hasil.scopes.join(', ')}`,
    );
    console.log('Simpan sekarang, kunci tidak bisa ditampilkan lagi:');
    console.log(hasil.kunci);
  } finally {
    await app.close();
  }
}

void main();
