import { z } from 'zod';

const skemaConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  RATE_LIMIT_API_KEY_PER_MENIT: z.coerce.number().int().min(0).default(60),
  SESSION_COOKIE: z
    .string()
    .regex(/^[a-z_]+$/)
    .default('oms_sesi'),
});

export interface ConfigApi {
  lingkungan: 'development' | 'test' | 'production';
  databaseUrl: string;
  port: number;
  webOrigin: string;
  sesiTtlMs: number;
  /** Mode demo: header X-Sim-Waktu diterima dan pnpm demo:reset boleh jalan. Tidak pernah di produksi. */
  demoMode: boolean;
  /** Batas permintaan per API key per menit; 0 = tanpa batas. Kunci simulator di mode demo tidak dibatasi. */
  batasPerMenitApiKey: number;
  /** Nama cookie sesi; lingkungan uji sambung memakai nama lain supaya tidak bentrok dengan demo. */
  cookieSesi: string;
}

export const CONFIG = Symbol('CONFIG');

export function muatConfig(env: NodeJS.ProcessEnv): ConfigApi {
  const hasil = skemaConfig.safeParse(env);
  if (!hasil.success) {
    const pesan = hasil.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi API tidak valid – ${pesan}`);
  }
  const c = hasil.data;
  if (c.DEMO_MODE === 'true' && c.NODE_ENV === 'production') {
    throw new Error('DEMO_MODE tidak boleh aktif di produksi');
  }
  return {
    lingkungan: c.NODE_ENV,
    databaseUrl: c.DATABASE_URL,
    port: c.API_PORT,
    webOrigin: c.WEB_ORIGIN,
    sesiTtlMs: c.SESSION_TTL_HOURS * 60 * 60 * 1000,
    demoMode: c.DEMO_MODE === 'true',
    batasPerMenitApiKey: c.RATE_LIMIT_API_KEY_PER_MENIT,
    cookieSesi: c.SESSION_COOKIE,
  };
}
