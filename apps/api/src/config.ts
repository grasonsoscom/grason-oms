import { z } from 'zod';

const skemaConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
});

export interface ConfigApi {
  lingkungan: 'development' | 'test' | 'production';
  databaseUrl: string;
  port: number;
  webOrigin: string;
  sesiTtlMs: number;
}

export const CONFIG = Symbol('CONFIG');

export function muatConfig(env: NodeJS.ProcessEnv): ConfigApi {
  const hasil = skemaConfig.safeParse(env);
  if (!hasil.success) {
    const pesan = hasil.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi API tidak valid – ${pesan}`);
  }
  const c = hasil.data;
  return {
    lingkungan: c.NODE_ENV,
    databaseUrl: c.DATABASE_URL,
    port: c.API_PORT,
    webOrigin: c.WEB_ORIGIN,
    sesiTtlMs: c.SESSION_TTL_HOURS * 60 * 60 * 1000,
  };
}
