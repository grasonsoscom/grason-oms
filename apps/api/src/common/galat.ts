import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';

/** Kode galat yang juga dipakai di docs/api-contract (skema Galat). */
const KODE_STATUS: Record<number, string> = {
  400: 'validasi_gagal',
  401: 'tidak_terautentikasi',
  403: 'tidak_diizinkan',
  404: 'tidak_ditemukan',
  409: 'konflik',
  422: 'tidak_dapat_diproses',
  429: 'terlalu_banyak_permintaan',
};

export interface BodyGalat {
  error: { kode: string; pesan: string; detail?: unknown };
}

@Catch()
export class FilterGalat implements ExceptionFilter {
  private readonly logger = new Logger('Galat');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const isi = exception.getResponse();
      const body: BodyGalat =
        typeof isi === 'object' && isi !== null && 'error' in isi
          ? (isi as BodyGalat)
          : {
              error: {
                kode: KODE_STATUS[status] ?? 'galat',
                pesan: typeof isi === 'string' ? isi : exception.message,
              },
            };
      res.status(status).json(body);
      return;
    }

    this.logger.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { kode: 'kesalahan_server', pesan: 'Terjadi kesalahan di server' },
    } satisfies BodyGalat);
  }
}

export function galat(kode: string, pesan: string, detail?: unknown): BodyGalat {
  return { error: { kode, pesan, ...(detail === undefined ? {} : { detail }) } };
}

/** Validasi body/query dengan zod; galat 400 berisi daftar field yang salah. */
export function validasi<S extends z.ZodType>(skema: S, data: unknown): z.infer<S> {
  const hasil = skema.safeParse(data);
  if (!hasil.success) {
    throw new BadRequestException(
      galat(
        'validasi_gagal',
        'Data tidak valid',
        hasil.error.issues.map((i) => ({ field: i.path.join('.'), pesan: i.message })),
      ),
    );
  }
  return hasil.data;
}
