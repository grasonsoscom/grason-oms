import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Response } from 'express';
import type { RequestOms } from './common/pelaku';
import type { ConfigApi } from './config';

export const PREFIX_API = 'api/v1';

/** Pengaturan bersama untuk main.ts dan tes. */
export function siapkanApp(app: INestApplication, config: ConfigApi): INestApplication {
  app.setGlobalPrefix(PREFIX_API);
  app.use(cookieParser());
  app.use((req: RequestOms, _res: Response, next: NextFunction) => {
    req.waktu = waktuPermintaan(req.headers[HEADER_SIM_WAKTU], config.demoMode);
    next();
  });
  app.enableCors({ origin: config.webOrigin, credentials: true });
  return app;
}

export const HEADER_SIM_WAKTU = 'x-sim-waktu';

/**
 * Waktu "sekarang" untuk satu permintaan. Di mode demo, simulator boleh mengirim
 * X-Sim-Waktu (ISO-8601, tidak di masa depan) untuk mengisi data 7 hari ke belakang
 * (keputusan 0004). Di luar mode demo header ini diabaikan.
 */
export function waktuPermintaan(header: unknown, demoMode: boolean, sekarang = new Date()): Date {
  if (!demoMode || typeof header !== 'string') return sekarang;
  const waktu = new Date(header);
  if (Number.isNaN(waktu.getTime()) || waktu.getTime() > sekarang.getTime()) return sekarang;
  return waktu;
}
