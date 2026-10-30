import {
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { Prisma } from '@grason/db';
import { ALAMAT_DISAMARKAN, samarkanNoWa, tanggalWib } from '@grason/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { PelakuSaatIni, Perlu } from '../common/decorators';
import { galat, validasi } from '../common/galat';
import { bolehLihatPii, type Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';
import { rentangWib } from './filter';

const tanggal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const skemaFilter = z.object({
  sistem: z.enum(['cs_ai', 'ethix', 'adv_ai']).optional(),
  arah: z.enum(['masuk', 'keluar']).optional(),
  status: z.enum(['diterima', 'diproses', 'berhasil', 'gagal', 'duplikat']).optional(),
  jenis: z.string().max(50).optional(),
  cari: z.string().trim().max(100).optional(),
  dari: tanggal,
  sampai: tanggal,
  halaman: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().min(1).max(100).default(25),
});

const skemaRentang = z.object({ dari: tanggal, sampai: tanggal });

/** Field PII di body permintaan CS AI dan payload webhook. */
const KUNCI_NO_WA = new Set(['no_wa', 'no_hp']);
const KUNCI_ALAMAT = new Set(['alamat', 'kelurahan', 'kecamatan', 'kode_pos']);

/** Samarkan nomor WA dan alamat di dalam payload untuk role tanpa izin PII. */
export function samarkanPayload(nilai: unknown): unknown {
  if (Array.isArray(nilai)) return nilai.map(samarkanPayload);
  if (!nilai || typeof nilai !== 'object') return nilai;
  return Object.fromEntries(
    Object.entries(nilai).map(([k, v]) => {
      if (KUNCI_NO_WA.has(k) && typeof v === 'string') return [k, samarkanNoWa(v)];
      if (KUNCI_ALAMAT.has(k) && typeof v === 'string') return [k, ALAMAT_DISAMARKAN];
      return [k, samarkanPayload(v)];
    }),
  );
}

const kolomCsv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Log integrasi dan rekonsiliasi (Fase 3, keputusan 0007): panggilan masuk dari CS AI,
 * event Ethix, dan webhook keluar ke CS AI.
 */
@Controller('app/integrasi')
export class AppIntegrasiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Perlu('integrasi.lihat')
  @Get()
  async daftar(@Query() query: unknown, @PelakuSaatIni() pelaku: Pelaku) {
    const f = validasi(skemaFilter, query);
    const where: Prisma.IntegrationEventWhereInput = {
      sistem: f.sistem,
      arah: f.arah,
      status: f.status,
      jenis: f.jenis,
      createdAt: rentangWib(f.dari, f.sampai),
      ...(f.cari ? { externalId: { contains: f.cari } } : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.client.integrationEvent.count({ where }),
      this.prisma.client.integrationEvent.findMany({
        where,
        include: { apiKey: { select: { nama: true, prefix: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (f.halaman - 1) * f.per,
        take: f.per,
      }),
    ]);
    const pii = bolehLihatPii(pelaku);
    return {
      total,
      halaman: f.halaman,
      per: f.per,
      data: data.map((e) => ({
        id: e.id,
        sistem: e.sistem,
        arah: e.arah,
        jenis: e.jenis,
        externalId: e.externalId,
        status: e.status,
        percobaan: e.percobaan,
        error: e.error,
        apiKey: e.apiKey,
        dibuatAt: e.createdAt,
        diprosesAt: e.diprosesAt,
        cobaLagiAt: e.cobaLagiAt,
        payload: pii ? e.payload : samarkanPayload(e.payload),
      })),
    };
  }

  /** Jumlah per tanggal WIB, jenis, dan status; dasar cek "tanpa selisih" dengan CS AI. */
  @Perlu('integrasi.lihat')
  @Get('rekap')
  async rekap(@Query() query: unknown) {
    const f = validasi(skemaRentang, query);
    const event = await this.prisma.client.integrationEvent.findMany({
      where: { sistem: 'cs_ai', createdAt: rentangWib(f.dari, f.sampai) },
      select: { arah: true, jenis: true, status: true, createdAt: true },
    });
    const hitung = new Map<string, number>();
    for (const e of event) {
      const k = [tanggalWib(e.createdAt), e.arah, e.jenis, e.status].join('|');
      hitung.set(k, (hitung.get(k) ?? 0) + 1);
    }
    return {
      data: [...hitung]
        .map(([k, jumlah]) => {
          const [tanggal, arah, jenis, status] = k.split('|');
          return { tanggal, arah, jenis, status, jumlah };
        })
        .sort(
          (a, b) =>
            b.tanggal!.localeCompare(a.tanggal!) ||
            a.arah!.localeCompare(b.arah!) ||
            a.jenis!.localeCompare(b.jenis!) ||
            a.status!.localeCompare(b.status!),
        ),
    };
  }

  /**
   * Lead dan checkout dari CS AI dalam rentang tanggal, per external_id, untuk dicocokkan
   * dengan data GrasOn AI Chat. Tanpa nomor WA dan alamat.
   */
  @Perlu('integrasi.lihat')
  @Get('ekspor.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  async ekspor(@Query() query: unknown) {
    const f = validasi(skemaRentang, query);
    const rentang = rentangWib(f.dari, f.sampai);
    const [leads, grup] = await Promise.all([
      this.prisma.client.lead.findMany({
        where: { sumber: 'cs_ai', createdAt: rentang },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.orderGroup.findMany({
        where: { sumber: 'cs_ai', createdAt: rentang },
        include: {
          lead: { select: { externalId: true } },
          orders: { select: { nomor: true, status: true }, orderBy: { nomor: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const baris = [
      [
        'jenis',
        'external_id',
        'id_oms',
        'lead_external_id',
        'nomor_order',
        'status',
        'segmen',
        'metode_bayar',
        'total',
        'dibuat_at',
      ],
      ...leads.map((l) => [
        'lead',
        l.externalId,
        l.id,
        '',
        '',
        l.status,
        l.segmen,
        '',
        '',
        l.createdAt.toISOString(),
      ]),
      ...grup.map((g) => [
        'checkout',
        g.externalId,
        g.id,
        g.lead?.externalId,
        g.orders.map((o) => o.nomor).join(' '),
        g.orders.map((o) => o.status).join(' '),
        '',
        g.metodeBayar,
        g.total,
        g.createdAt.toISOString(),
      ]),
    ];
    return baris.map((b) => b.map(kolomCsv).join(',')).join('\n') + '\n';
  }

  /** Kirim ulang webhook keluar yang sudah menyerah (status gagal). */
  @Perlu('integrasi.lihat')
  @Post(':id/kirim-ulang')
  @HttpCode(200)
  async kirimUlang(@Param('id', ParseUUIDPipe) id: string, @PelakuSaatIni() pelaku: Pelaku) {
    const e = await this.prisma.client.integrationEvent.findUnique({ where: { id } });
    if (!e) throw new NotFoundException(galat('tidak_ditemukan', 'Event tidak ditemukan'));
    if (e.arah !== 'keluar' || e.status !== 'gagal') {
      throw new ConflictException(
        galat('status_tidak_sesuai', 'Hanya webhook keluar yang gagal yang bisa dikirim ulang'),
      );
    }
    await this.prisma.client.integrationEvent.update({
      where: { id },
      data: { status: 'diterima', percobaan: 0, error: null, cobaLagiAt: null },
    });
    await this.audit.catat({
      aksi: 'integrasi.kirim_ulang',
      pelaku,
      objekTipe: 'integration_event',
      objekId: id,
      sebelum: { status: e.status, percobaan: e.percobaan, error: e.error },
    });
    return { id, status: 'diterima' };
  }
}
