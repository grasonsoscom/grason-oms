import { VersioningType, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Response } from 'express';
import type { Pelaku, RequestOms } from './common/pelaku';
import type { ConfigApi } from './config';
import { DOMAIN_DEMO } from './demo/demo';

/** URL = /api/v<versi>/…; controller tanpa versi = v1. cs-ai.v2 ada di /api/v2 (keputusan 0006). */
export const PREFIX_API = 'api';

/** Pengaturan bersama untuk main.ts dan tes. */
export function siapkanApp(app: INestApplication, config: ConfigApi): INestApplication {
  app.setGlobalPrefix(PREFIX_API);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  // Waktu bawaan; AksesGuard menggantinya dengan X-Sim-Waktu bila pelaku boleh.
  app.use((req: RequestOms, _res: Response, next: NextFunction) => {
    req.waktu = new Date();
    next();
  });
  app.enableCors({ origin: config.webOrigin, credentials: true });
  return app;
}

export const HEADER_SIM_WAKTU = 'x-sim-waktu';

/**
 * Hanya simulator yang boleh mengatur waktu: API key bertanda simulator (dibuat
 * pnpm demo:reset) dan akun demo (CS manusia palsu), dan hanya di mode demo.
 * API key lain, termasuk CS AI sungguhan, selalu memakai jam server.
 */
export function bolehAturWaktu(pelaku: Pelaku, demoMode: boolean): boolean {
  if (!demoMode) return false;
  if (pelaku.tipe === 'api_key') return pelaku.simulator;
  return pelaku.email.endsWith(`@${DOMAIN_DEMO}`);
}

/**
 * Waktu "sekarang" untuk satu permintaan. Simulator boleh mengirim X-Sim-Waktu
 * (ISO-8601, tidak di masa depan) untuk mengisi data 7 hari ke belakang (keputusan 0004).
 * Selain itu header ini diabaikan.
 */
export function waktuPermintaan(header: unknown, boleh: boolean, sekarang = new Date()): Date {
  if (!boleh || typeof header !== 'string') return sekarang;
  const waktu = new Date(header);
  if (Number.isNaN(waktu.getTime()) || waktu.getTime() > sekarang.getTime()) return sekarang;
  return waktu;
}
