import { z } from 'zod';
import type { Prisma } from '@grason/db';
import {
  AGEN,
  ENTITAS,
  LEAD_STATUS,
  METODE_BAYAR,
  ORDER_STATUS,
  SLA_RESI_JAM,
  samarkanNoWa,
} from '@grason/shared';
import type { Pelaku } from '../common/pelaku';

// Filter dan pembatasan data untuk API dashboard (/api/v1/app/*).

const tanggal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const daftar = <T extends readonly [string, ...string[]]>(nilai: T) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(nilai)));

const halaman = {
  halaman: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().min(1).max(100).default(25),
};

export const skemaFilterOrder = z.object({
  status: daftar(ORDER_STATUS),
  produk: z.uuid().optional(),
  cs: z.string().optional(), // uuid user CS, atau "cs_ai"
  entitas: z.enum(ENTITAS).optional(),
  metode: z.enum(METODE_BAYAR).optional(),
  dari: tanggal,
  sampai: tanggal,
  sla: z.enum(['terlambat', 'kuning', 'merah']).optional(),
  verifikasi_manusia: z.enum(['ya']).optional(),
  cari: z.string().trim().max(100).optional(),
  ...halaman,
});

export const skemaFilterLead = z.object({
  status: daftar(LEAD_STATUS),
  agen: z.enum(AGEN).optional(),
  cs: z.uuid().optional(),
  handover: z.enum(['ya', 'antrian']).optional(),
  produk: z.uuid().optional(),
  dari: tanggal,
  sampai: tanggal,
  cari: z.string().trim().max(100).optional(),
  ...halaman,
});

/** Rentang tanggal WIB inklusif → filter waktu UTC. */
export function rentangWib(dari?: string, sampai?: string): Prisma.DateTimeFilter | undefined {
  if (!dari && !sampai) return undefined;
  return {
    ...(dari ? { gte: new Date(`${dari}T00:00:00+07:00`) } : {}),
    ...(sampai
      ? { lt: new Date(new Date(`${sampai}T00:00:00+07:00`).getTime() + 86_400_000) }
      : {}),
  };
}

/** CS hanya melihat order miliknya, atau order dari lead yang dibagi kepadanya. */
export function whereOrderMilik(pelaku: Pelaku): Prisma.OrderWhereInput {
  if (pelaku.tipe !== 'user' || pelaku.izin.includes('order.lihat_semua')) return {};
  return { OR: [{ csUserId: pelaku.userId }, { lead: { csUserId: pelaku.userId } }] };
}

export function whereLeadMilik(pelaku: Pelaku): Prisma.LeadWhereInput {
  if (pelaku.tipe !== 'user' || pelaku.izin.includes('lead.lihat_semua')) return {};
  return { csUserId: pelaku.userId };
}

/** Order yang memuat produk satuan ini, langsung atau di dalam paket. */
export function whereOrderProduk(produkId: string): Prisma.OrderWhereInput {
  return {
    items: {
      some: {
        OR: [
          { productId: produkId },
          { product: { bundleItems: { some: { componentProductId: produkId } } } },
        ],
      },
    },
  };
}

/**
 * Order yang menunggu resi melewati SLA (blueprint: Pengiriman & RTS).
 * kuning = lewat 18 jam tapi belum 24 jam; merah = lewat 24 jam; terlambat = keduanya.
 */
export function whereSlaResi(
  jenis: 'terlambat' | 'kuning' | 'merah',
  sekarang: Date,
): Prisma.OrderWhereInput {
  const lewat = (jam: number) => new Date(sekarang.getTime() - jam * 3_600_000);
  const terverifikasiAt =
    jenis === 'merah'
      ? { lt: lewat(SLA_RESI_JAM.merah) }
      : jenis === 'kuning'
        ? { lt: lewat(SLA_RESI_JAM.kuning), gte: lewat(SLA_RESI_JAM.merah) }
        : { lt: lewat(SLA_RESI_JAM.kuning) };
  return { status: { in: ['terverifikasi', 'di_gudang'] }, terverifikasiAt };
}

export const samarkan = (noWa: string, boleh: boolean) => (boleh ? noWa : samarkanNoWa(noWa));
