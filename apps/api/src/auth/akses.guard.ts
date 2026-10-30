import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Izin, Scope } from '@grason/shared';
import type { Response } from 'express';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { HEADER_SIM_WAKTU, bolehAturWaktu, waktuPermintaan } from '../buat-app';
import { META_IZIN, META_PUBLIK, META_SCOPE } from '../common/decorators';
import { galat } from '../common/galat';
import type { Pelaku, RequestOms } from '../common/pelaku';
import { CONFIG, type ConfigApi } from '../config';
import { PembatasLaju } from './pembatas-laju';
import { COOKIE_SESI, SesiService } from './sesi.service';

/**
 * Guard global. Pelaku = API key (header Authorization: Bearer gok_… atau X-Api-Key)
 * atau sesi login (cookie oms_sesi). Endpoint tanpa @Publik/@Perlu/@PerluScope ditolak.
 * API key hanya diterima di endpoint @PerluScope dan dibatasi per menit; X-Sim-Waktu
 * hanya berlaku untuk simulator di mode demo.
 */
@Injectable()
export class AksesGuard implements CanActivate {
  private readonly laju: PembatasLaju;

  constructor(
    private readonly reflector: Reflector,
    private readonly sesi: SesiService,
    private readonly apiKeys: ApiKeysService,
    @Inject(CONFIG) private readonly config: ConfigApi,
  ) {
    this.laju = new PembatasLaju(config.batasPerMenitApiKey);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const target = [ctx.getHandler(), ctx.getClass()];
    const izin = this.reflector.getAllAndOverride<Izin[] | undefined>(META_IZIN, target);
    const scope = this.reflector.getAllAndOverride<Scope[] | undefined>(META_SCOPE, target);
    const req = ctx.switchToHttp().getRequest<RequestOms>();
    const kunci = this.kunciDariHeader(req);

    // API key hanya untuk endpoint @PerluScope; termasuk endpoint publik seperti login.
    if (kunci !== undefined && !scope) {
      throw this.ditolak('Endpoint ini tidak dapat diakses dengan API key');
    }
    if (this.reflector.getAllAndOverride<boolean>(META_PUBLIK, target)) return true;

    const pelaku =
      kunci !== undefined ? await this.apiKeys.validasi(kunci) : await this.sesiDari(req);
    if (!pelaku) {
      throw new UnauthorizedException(
        galat('tidak_terautentikasi', 'Silakan login terlebih dahulu'),
      );
    }
    req.pelaku = pelaku;
    req.waktu = waktuPermintaan(
      req.headers[HEADER_SIM_WAKTU],
      bolehAturWaktu(pelaku, this.config.demoMode),
    );

    if (pelaku.tipe === 'api_key' && !(pelaku.simulator && this.config.demoMode)) {
      const tunggu = this.laju.ambil(pelaku.apiKeyId);
      if (tunggu !== null) {
        ctx.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(tunggu));
        throw new HttpException(
          galat(
            'terlalu_banyak_permintaan',
            `Melewati batas ${this.config.batasPerMenitApiKey} permintaan per menit untuk API key ini`,
            { coba_lagi_detik: tunggu },
          ),
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (pelaku.tipe === 'user') {
      if (!izin) throw this.ditolak('Endpoint ini hanya untuk sistem');
      if (izin.length > 0 && !izin.some((i) => pelaku.izin.includes(i))) {
        throw this.ditolak('Role Anda tidak punya akses ke fitur ini');
      }
      return true;
    }

    if (!scope) throw this.ditolak('Endpoint ini tidak dapat diakses dengan API key');
    const kurang = scope.filter((s) => !pelaku.scopes.includes(s));
    if (kurang.length > 0) throw this.ditolak(`API key tidak punya scope: ${kurang.join(', ')}`);
    return true;
  }

  private async sesiDari(req: RequestOms): Promise<Pelaku | null> {
    const token: unknown = req.cookies?.[COOKIE_SESI];
    if (typeof token === 'string' && token.length > 0) return this.sesi.validasi(token);
    return null;
  }

  private kunciDariHeader(req: RequestOms): string | undefined {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
    const xApiKey = req.headers['x-api-key'];
    return typeof xApiKey === 'string' ? xApiKey.trim() : undefined;
  }

  private ditolak(pesan: string): ForbiddenException {
    return new ForbiddenException(galat('tidak_diizinkan', pesan));
  }
}
