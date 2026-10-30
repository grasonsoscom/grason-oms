import { Controller, Get } from '@nestjs/common';
import type { OrderStatus } from '@grason/db';
import { ORDER_STATUS, SLA_RESI_JAM, awalHariWib } from '@grason/shared';
import { PelakuSaatIni, Perlu, WaktuSaatIni } from '../common/decorators';
import type { Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';
import { StokService } from '../stok/stok.service';
import { whereLeadMilik, whereOrderMilik } from './filter';

@Controller('app')
export class AppUmumController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stok: StokService,
  ) {}

  @Perlu('stok.lihat')
  @Get('stok')
  async daftarStok(@WaktuSaatIni() sekarang: Date) {
    return { data: await this.stok.hitung(sekarang) };
  }

  /** Daftar CS aktif untuk filter dan pembagian lead. */
  @Perlu('lead.bagi', 'lead.lihat_semua', 'order.lihat_semua')
  @Get('cs')
  async daftarCs() {
    return {
      data: await this.prisma.client.user.findMany({
        where: { aktif: true, role: { kode: 'cs' } },
        select: { id: true, nama: true },
        orderBy: { nama: 'asc' },
      }),
    };
  }

  /** Ringkasan beranda. Isi menyesuaikan izin pelaku; CS hanya datanya sendiri. */
  @Perlu()
  @Get('ringkasan')
  async ringkasan(@PelakuSaatIni() pelaku: Pelaku, @WaktuSaatIni() sekarang: Date) {
    const izin = pelaku.tipe === 'user' ? pelaku.izin : [];
    const hariIni = { gte: awalHariWib(sekarang), lte: sekarang };
    const bolehLead = izin.includes('lead.lihat_semua') || izin.includes('lead.lihat_milik');
    const bolehOrder = izin.includes('order.lihat_semua') || izin.includes('order.lihat_milik');
    const milikOrder = whereOrderMilik(pelaku);
    const milikLead = whereLeadMilik(pelaku);

    const lead = bolehLead
      ? {
          hariIni: await this.prisma.client.lead.count({
            where: { AND: [milikLead, { masukAt: hariIni }] },
          }),
          antrianHandover: izin.includes('lead.bagi')
            ? await this.prisma.client.lead.count({ where: { handover: true, csUserId: null } })
            : null,
          belumDirespon: await this.prisma.client.lead.count({
            where: { AND: [milikLead, { status: 'baru' }] },
          }),
        }
      : null;

    let order = null;
    if (bolehOrder) {
      const perStatus = await this.prisma.client.order.groupBy({
        by: ['status'],
        where: { AND: [milikOrder, { createdAt: hariIni }] },
        _count: true,
      });
      const terkirimHariIni = await this.prisma.client.order.aggregate({
        where: { AND: [milikOrder, { status: 'terkirim', terkirimAt: hariIni }] },
        _count: true,
        _sum: { total: true },
      });
      order = {
        hariIniPerStatus: Object.fromEntries(
          ORDER_STATUS.map((s) => [
            s,
            perStatus.find((p) => p.status === (s as OrderStatus))?._count ?? 0,
          ]),
        ),
        terkirimHariIni: terkirimHariIni._count,
        gmvTerkirimHariIni: terkirimHariIni._sum.total ?? 0,
        slaTerlambat: await this.prisma.client.order.count({
          where: {
            AND: [
              milikOrder,
              {
                status: { in: ['terverifikasi', 'di_gudang'] },
                terverifikasiAt: {
                  lt: new Date(sekarang.getTime() - SLA_RESI_JAM.kuning * 3_600_000),
                },
              },
            ],
          },
        }),
        perluVerifikasiManusia: await this.prisma.client.order.count({
          where: { AND: [milikOrder, { status: 'baru', perluVerifikasiManusia: true }] },
        }),
        menungguVerifikasi: await this.prisma.client.order.count({
          where: { AND: [milikOrder, { status: 'baru' }] },
        }),
      };
    }

    const stok = izin.includes('stok.lihat')
      ? (await this.stok.hitung(sekarang))
          .filter((s) => s.tipe === 'satuan' && ['kritis', 'habis', 'waspada'].includes(s.status))
          .map((s) => ({
            sku: s.sku,
            nama: s.nama,
            tersedia: s.tersedia,
            hariCover: s.hariCover,
            status: s.status,
          }))
      : null;

    return { waktu: sekarang, lead, order, stok };
  }
}
