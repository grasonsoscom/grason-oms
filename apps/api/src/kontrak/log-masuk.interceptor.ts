import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { catchError, from, mergeMap, type Observable } from 'rxjs';
import type { RequestOms } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';

/** Jenis event per handler CsAiController yang mengubah data. GET tidak dicatat. */
const JENIS: Record<string, string> = {
  buatLead: 'lead.buat',
  ubahLead: 'lead.ubah',
  buatOrder: 'order.buat',
  verifikasi: 'order.verifikasi',
};

/**
 * Catat setiap panggilan tulis dari CS AI ke integration_events (arah masuk), termasuk
 * yang ditolak beserta alasannya, untuk uji sambung dan rekonsiliasi (keputusan 0007).
 * Penolakan oleh AksesGuard (401/403/429) terjadi sebelum interceptor dan tidak tercatat.
 * Gagal mencatat tidak menggagalkan permintaan.
 */
@Injectable()
export class LogMasukInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const jenis = JENIS[ctx.getHandler().name];
    if (!jenis) return next.handle();
    const req = ctx.switchToHttp().getRequest<RequestOms>();
    const res = ctx.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      mergeMap((hasil) =>
        from(
          this.catat(req, jenis, {
            // 200 pada pembuatan = external_id sudah ada (kiriman ulang).
            status: res.statusCode === 200 && jenis.endsWith('.buat') ? 'duplikat' : 'berhasil',
            http: res.statusCode,
            idOms:
              (hasil as { id?: string; order_group_id?: string } | null)?.id ??
              (hasil as { order_group_id?: string } | null)?.order_group_id,
          }).then(() => hasil),
        ),
      ),
      catchError((e: unknown) =>
        from(
          this.catat(req, jenis, {
            status: 'gagal',
            http: e instanceof HttpException ? e.getStatus() : 500,
            galat: e instanceof HttpException ? e.getResponse() : { kode: 'galat_server' },
          }).then(() => {
            throw e;
          }),
        ),
      ),
    );
  }

  private async catat(
    req: RequestOms,
    jenis: string,
    r: { status: 'berhasil' | 'duplikat' | 'gagal'; http: number; idOms?: string; galat?: unknown },
  ): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const galat = (r.galat as { error?: { kode?: string; pesan?: string } } | undefined)?.error;
    try {
      await this.prisma.client.integrationEvent.create({
        data: {
          sistem: 'cs_ai',
          arah: 'masuk',
          jenis,
          externalId:
            typeof body.external_id === 'string'
              ? body.external_id
              : ((req.params as Record<string, string>).id ?? null),
          idempotencyKey: randomUUID(),
          payload: {
            metode: req.method,
            path: req.originalUrl,
            status_http: r.http,
            id_oms: r.idOms ?? null,
            body: body as object,
            ...(r.galat === undefined ? {} : { respons_galat: r.galat as object }),
          },
          status: r.status,
          error: galat ? `${galat.kode}: ${galat.pesan}` : null,
          apiKeyId: req.pelaku?.tipe === 'api_key' ? req.pelaku.apiKeyId : null,
          createdAt: req.waktu ?? new Date(),
          diprosesAt: req.waktu ?? new Date(),
        },
      });
    } catch {
      // Pencatatan bersifat pelengkap.
    }
  }
}
