import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AkunDemo } from './simulasi';

/** Root repo; .env dan .demo/ ada di sini. */
export const AKAR_REPO = path.resolve(__dirname, '../../..');

/** Ditulis `pnpm demo:reset`. Berisi API key simulator, jadi di-gitignore. */
export const FILE_KUNCI = path.join(AKAR_REPO, '.demo', 'kunci-simulator.json');

export interface FileKunci {
  csAi: string;
  ethix: string;
  akun?: Omit<AkunDemo, 'password'>;
}

export interface KonfigurasiSim {
  kunci: { csAi: string; ethix: string };
  akun: AkunDemo | null;
}

/**
 * Kunci dari env (SIM_CS_AI_KEY, SIM_ETHIX_KEY) atau file .demo/kunci-simulator.json.
 * Password akun demo hanya dari env DEMO_PASSWORD.
 */
export function muatKonfigurasi(env: NodeJS.ProcessEnv): KonfigurasiSim {
  const file: Partial<FileKunci> = existsSync(FILE_KUNCI)
    ? (JSON.parse(readFileSync(FILE_KUNCI, 'utf8')) as FileKunci)
    : {};
  const csAi = env.SIM_CS_AI_KEY ?? file.csAi;
  const ethix = env.SIM_ETHIX_KEY ?? file.ethix;
  if (!csAi || !ethix) {
    throw new Error(
      'API key simulator belum ada. Jalankan `pnpm demo:reset`, atau isi SIM_CS_AI_KEY dan ' +
        'SIM_ETHIX_KEY di .env (buat dengan `pnpm apikey:create`).',
    );
  }
  const password = env.DEMO_PASSWORD;
  const akun = file.akun && password ? { ...file.akun, password } : null;
  return { kunci: { csAi, ethix }, akun };
}
