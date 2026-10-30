import { Injectable } from '@nestjs/common';
import type { Entitas, Prisma, TipeProduk } from '@grason/db';
import {
  STATUS_PEGANG_STOK,
  hariCover,
  statusCover,
  tersediaKomponen,
  tersediaPaket,
  type StatusCover,
} from '@grason/shared';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient;

export interface StokProduk {
  productId: string;
  sku: string;
  nama: string;
  tipe: TipeProduk;
  entitas: Entitas;
  /** Untuk satuan: stok fisik Ethix terbaru. Paket tidak punya stok fisik sendiri. */
  stokEthix: number | null;
  /** Qty di order yang belum keluar gudang. */
  dipesan: number;
  tersedia: number;
  terjual7Hari: number;
  hariCover: number | null;
  status: StatusCover;
  /** Waktu snapshot Ethix terakhir (untuk paket: snapshot komponen paling lama). */
  diperbaruiAt: Date | null;
}

/** Kunci advisory untuk semua pengecekan stok saat checkout (satu kunci, bebas deadlock). */
const KUNCI_STOK = 47_010_001;

const HARI_MS = 86_400_000;

@Injectable()
export class StokService {
  constructor(private readonly prisma: PrismaService) {}

  /** Serialkan checkout supaya dua order bersamaan tidak memakai stok yang sama. */
  async kunci(tx: Db): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${KUNCI_STOK})`;
  }

  /**
   * Stok semua produk aktif. Komponen: stok Ethix − dipesan. Paket: dihitung dari
   * komponennya. `sekarang` dipakai untuk rentang terjual 7 hari.
   */
  async hitung(sekarang: Date, tx: Db = this.prisma.client): Promise<StokProduk[]> {
    const produk = await tx.product.findMany({
      where: { aktif: true },
      include: { bundleItems: true },
      orderBy: [{ tipe: 'asc' }, { sku: 'asc' }],
    });

    const snapshot = await tx.$queryRaw<
      { product_id: string; stok_ethix: number; disinkron_at: Date }[]
    >`
      SELECT DISTINCT ON (product_id) product_id, stok_ethix, disinkron_at
      FROM stock_snapshots
      ORDER BY product_id, disinkron_at DESC, created_at DESC`;

    const status = [...STATUS_PEGANG_STOK];
    const dipesan = await tx.$queryRaw<{ product_id: string; qty: number }[]>`
      SELECT COALESCE(b.component_product_id, oi.product_id) AS product_id,
             SUM(oi.qty * COALESCE(b.qty, 1))::int AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN bundles b ON b.bundle_product_id = oi.product_id
      WHERE o.status::text = ANY(${status})
      GROUP BY 1`;

    const sejak = new Date(sekarang.getTime() - 7 * HARI_MS);
    const terjual = await tx.$queryRaw<{ product_id: string; qty: number }[]>`
      SELECT COALESCE(b.component_product_id, oi.product_id) AS product_id,
             SUM(oi.qty * COALESCE(b.qty, 1))::int AS qty
      FROM order_items oi
      JOIN LATERAL (
        SELECT 1 FROM order_status_history h
        WHERE h.order_id = oi.order_id AND h.ke_status = 'dikirim'
          AND h.waktu > ${sejak} AND h.waktu <= ${sekarang}
        LIMIT 1
      ) kirim ON true
      LEFT JOIN bundles b ON b.bundle_product_id = oi.product_id
      GROUP BY 1`;

    const stokPer = new Map(snapshot.map((b) => [b.product_id, b]));
    const dipesanPer = new Map(dipesan.map((b) => [b.product_id, b.qty]));
    const terjualPer = new Map(terjual.map((b) => [b.product_id, b.qty]));

    const tersediaPer = new Map<string, number>();
    const hasil: StokProduk[] = [];
    for (const p of produk.filter((x) => x.tipe === 'satuan')) {
      const fisik = stokPer.get(p.id)?.stok_ethix ?? 0;
      const pesan = dipesanPer.get(p.id) ?? 0;
      const tersedia = tersediaKomponen(fisik, pesan);
      const laku = terjualPer.get(p.id) ?? 0;
      const cover = hariCover(tersedia, laku);
      tersediaPer.set(p.id, tersedia);
      hasil.push({
        productId: p.id,
        sku: p.sku,
        nama: p.nama,
        tipe: p.tipe,
        entitas: p.entitas,
        stokEthix: fisik,
        dipesan: pesan,
        tersedia,
        terjual7Hari: laku,
        hariCover: cover,
        status: statusCover(tersedia, cover),
        diperbaruiAt: stokPer.get(p.id)?.disinkron_at ?? null,
      });
    }

    for (const p of produk.filter((x) => x.tipe === 'paket')) {
      const isi = p.bundleItems.map((b) => ({ componentId: b.componentProductId, qty: b.qty }));
      const tersedia = tersediaPaket(isi, tersediaPer);
      // Cover paket mengikuti komponen pembatasnya: penjualan komponen dibagi isi paket.
      const cover = Math.min(
        ...isi.map((k) => {
          const c = hariCover(tersedia, (terjualPer.get(k.componentId) ?? 0) / k.qty);
          return c ?? Number.POSITIVE_INFINITY;
        }),
      );
      const coverAkhir = Number.isFinite(cover) ? cover : null;
      const waktuKomponen = isi.map((k) => stokPer.get(k.componentId)?.disinkron_at ?? null);
      hasil.push({
        productId: p.id,
        sku: p.sku,
        nama: p.nama,
        tipe: p.tipe,
        entitas: p.entitas,
        stokEthix: null,
        dipesan: dipesanPer.get(p.id) ?? 0,
        tersedia,
        terjual7Hari: 0,
        hariCover: coverAkhir,
        status: statusCover(tersedia, coverAkhir),
        diperbaruiAt: waktuKomponen.includes(null)
          ? null
          : new Date(Math.min(...waktuKomponen.map((w) => w!.getTime()))),
      });
    }
    return hasil;
  }
}
