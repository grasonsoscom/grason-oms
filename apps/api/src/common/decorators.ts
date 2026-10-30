import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Izin, Scope } from '@grason/shared';
import type { Pelaku, RequestOms } from './pelaku';

export const META_PUBLIK = 'oms:publik';
export const META_IZIN = 'oms:izin';
export const META_SCOPE = 'oms:scope';

// Endpoint tanpa salah satu decorator di bawah ditolak untuk semua pelaku (deny by default).

/** Tanpa login atau API key. */
export const Publik = () => SetMetadata(META_PUBLIK, true);

/** User login dengan salah satu izin ini. Tanpa argumen = cukup login. */
export const Perlu = (...izin: Izin[]) => SetMetadata(META_IZIN, izin);

/** API key sistem dengan semua scope ini. */
export const PerluScope = (...scope: Scope[]) => SetMetadata(META_SCOPE, scope);

/** Waktu permintaan (UTC). Di mode demo bisa diatur simulator lewat X-Sim-Waktu. */
export const WaktuSaatIni = createParamDecorator((_: unknown, ctx: ExecutionContext): Date => {
  return ctx.switchToHttp().getRequest<RequestOms>().waktu ?? new Date();
});

export const PelakuSaatIni = createParamDecorator((_: unknown, ctx: ExecutionContext): Pelaku => {
  const req = ctx.switchToHttp().getRequest<RequestOms>();
  if (!req.pelaku) throw new Error('Pelaku belum terisi; pastikan AksesGuard aktif');
  return req.pelaku;
});

/** Versi kontrak dari URL: /api/v2/… = 2, selain itu 1. */
export const VersiKontrak = createParamDecorator((_: unknown, ctx: ExecutionContext): 1 | 2 => {
  const req = ctx.switchToHttp().getRequest<RequestOms>();
  return /^\/api\/v2\//.test(req.originalUrl) ? 2 : 1;
});
