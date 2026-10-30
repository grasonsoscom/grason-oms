import { Controller, Get, Query } from '@nestjs/common';
import type { Prisma } from '@grason/db';
import { LABEL_PERIODE, PERIODE, rentangPeriode, type Rentang } from '@grason/shared';
import { z } from 'zod';
import { PelakuSaatIni, Perlu, WaktuSaatIni } from '../common/decorators';
import { validasi } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';
import { StokService } from '../stok/stok.service';
import { whereLeadMilik, whereOrderMilik, whereOrderProduk, whereSlaResi } from './filter';

const skemaQuery = z.object({
  periode: z.enum(PERIODE).default('hari_ini'),
  produk: z.uuid().optional(),
});

/** Status yang dihitung di "Posisi order aktif saat ini". */
const STATUS_AKTIF = ['baru', 'terverifikasi', 'di_gudang', 'dikirim'] as const;

export interface Banding {
  nilai: number;
  sebelumnya: number;
}

const antara = (r: Rentang) => ({ gte: r.dari, lt: r.sampai });

/**
 * Ringkasan beranda. Isi menyesuaikan izin pelaku; CS hanya datanya sendiri.
 * - periode: angka dalam periode terpilih + periode sebelumnya yang sama panjang.
 * - tindakan dan posisi: keadaan saat ini, tidak bergantung periode.
 */
@Controller('app/ringkasan')
export class AppRingkasanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stok: StokService,
  ) {}

  @Perlu()
  @Get()
  async ringkasan(
    @Query() query: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const q = validasi(skemaQuery, query);
    const izin = pelaku.tipe === 'user' ? pelaku.izin : [];
    const rentang = rentangPeriode(q.periode, sekarang);
    const bolehLead = izin.includes('lead.lihat_semua') || izin.includes('lead.lihat_milik');
    const bolehOrder = izin.includes('order.lihat_semua') || izin.includes('order.lihat_milik');

    const whereLead: Prisma.LeadWhereInput = {
      AND: [whereLeadMilik(pelaku), q.produk ? { produkDitanyaId: q.produk } : {}],
    };
    const whereOrder: Prisma.OrderWhereInput = {
      AND: [whereOrderMilik(pelaku), q.produk ? whereOrderProduk(q.produk) : {}],
    };
    const lead = (w: Prisma.LeadWhereInput) =>
      this.prisma.client.lead.count({ where: { AND: [whereLead, w] } });
    const order = (w: Prisma.OrderWhereInput) =>
      this.prisma.client.order.count({ where: { AND: [whereOrder, w] } });
    const banding = async (hitung: (r: Rentang) => Promise<number>): Promise<Banding> => {
      const [nilai, sebelumnya] = await Promise.all([
        hitung(rentang.ini),
        hitung(rentang.sebelumnya),
      ]);
      return { nilai, sebelumnya };
    };
    const gmvTerkirim = async (r: Rentang) =>
      (
        await this.prisma.client.order.aggregate({
          where: { AND: [whereOrder, { status: 'terkirim', terkirimAt: antara(r) }] },
          _sum: { total: true },
        })
      )._sum.total ?? 0;

    const periode = {
      leadMasuk: bolehLead ? await banding((r) => lead({ masukAt: antara(r) })) : null,
      orderDibuat: bolehOrder ? await banding((r) => order({ createdAt: antara(r) })) : null,
      orderTerkirim: bolehOrder
        ? await banding((r) => order({ status: 'terkirim', terkirimAt: antara(r) }))
        : null,
      gmvTerkirim: bolehOrder ? await banding(gmvTerkirim) : null,
    };

    let leadBelumDirespon = null;
    if (bolehLead) {
      const terlama = await this.prisma.client.lead.findFirst({
        where: { AND: [whereLead, { status: 'baru' }] },
        orderBy: { masukAt: 'asc' },
        select: { masukAt: true },
      });
      leadBelumDirespon = {
        jumlah: await lead({ status: 'baru' }),
        umurTerlamaMenit: terlama
          ? Math.max(0, Math.floor((sekarang.getTime() - terlama.masukAt.getTime()) / 60_000))
          : null,
      };
    }

    const tindakan = {
      leadBelumDirespon,
      antrianHandover: izin.includes('lead.bagi')
        ? await lead({ handover: true, csUserId: null })
        : null,
      menungguVerifikasi: bolehOrder ? await order({ status: 'baru' }) : null,
      perluVerifikasiManusia: bolehOrder
        ? await order({ status: 'baru', perluVerifikasiManusia: true })
        : null,
      resiKuning: bolehOrder ? await order(whereSlaResi('kuning', sekarang)) : null,
      resiMerah: bolehOrder ? await order(whereSlaResi('merah', sekarang)) : null,
    };

    let posisi = null;
    if (bolehOrder) {
      const perStatus = await this.prisma.client.order.groupBy({
        by: ['status'],
        where: { AND: [whereOrder, { status: { in: [...STATUS_AKTIF] } }] },
        _count: true,
      });
      posisi = Object.fromEntries(
        STATUS_AKTIF.map((s) => [s, perStatus.find((p) => p.status === s)?._count ?? 0]),
      ) as Record<(typeof STATUS_AKTIF)[number], number>;
    }

    const stok = izin.includes('stok.lihat')
      ? (await this.stok.hitung(sekarang))
          .filter((s) => s.tipe === 'satuan' && (!q.produk || s.productId === q.produk))
          .filter((s) => ['kritis', 'habis', 'waspada'].includes(s.status))
          .map((s) => ({
            sku: s.sku,
            nama: s.nama,
            tersedia: s.tersedia,
            hariCover: s.hariCover,
            status: s.status,
          }))
      : null;

    return {
      waktu: sekarang,
      periode: {
        kode: q.periode,
        label: LABEL_PERIODE[q.periode].ini,
        labelSebelumnya: LABEL_PERIODE[q.periode].sebelumnya,
        dari: rentang.ini.dari,
        sampai: rentang.ini.sampai,
        ...periode,
      },
      tindakan,
      posisi,
      stok,
    };
  }
}
