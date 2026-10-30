import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Prisma } from '@grason/db';
import {
  ALAMAT_DISAMARKAN,
  BATAS_UMUR_BARU_JAM,
  METODE_BAYAR,
  SLA_RESI_JAM,
  STATUS_BOLEH_BATAL,
  STATUS_BOLEH_KOREKSI_ALAMAT,
  tandaSlaResi,
} from '@grason/shared';
import { z } from 'zod';
import { PelakuSaatIni, Perlu, WaktuSaatIni } from '../common/decorators';
import { galat, validasi } from '../common/galat';
import { bolehLihatPii, type Pelaku } from '../common/pelaku';
import { pastikanLeadMilik } from '../leads/leads.service';
import { OrdersService, pastikanMilik } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { rentangWib, samarkan, skemaFilterOrder, whereOrderMilik } from './filter';

const teks = (maks: number) => z.string().trim().min(1).max(maks);
const opsional = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((s) => s || null);

const skemaAlamat = z.object({
  alamat: teks(500),
  kelurahan: opsional,
  kecamatan: opsional,
  kota: teks(100),
  provinsi: teks(100),
  kodePos: z
    .string()
    .trim()
    .regex(/^(\d{5})?$/, 'Kode pos 5 digit')
    .optional()
    .transform((s) => s || null),
});

const skemaItem = z
  .array(z.object({ sku: z.string().min(1), qty: z.number().int().min(1).max(100) }))
  .min(1)
  .max(20);

const skemaPratinjau = z.object({
  metodeBayar: z.enum(METODE_BAYAR),
  items: skemaItem,
  ongkir: z.number().int().min(0).default(0),
  diskon: z.number().int().min(0).default(0),
});

const skemaOrderBaru = skemaPratinjau.extend({
  leadId: z.uuid(),
  penerima: z.object({ nama: teks(100), noWa: teks(20) }),
  alamat: skemaAlamat,
  catatan: z.string().max(1000).optional(),
});

const skemaVerifikasi = z.object({
  nilaiCodDikonfirmasi: z.number().int().min(0),
  catatan: z.string().max(1000).optional(),
});

const skemaKoreksi = z.object({
  penerimaNama: teks(100).optional(),
  penerimaNoWa: teks(20).optional(),
  alamat: skemaAlamat,
});

const LIHAT_ORDER = ['order.lihat_semua', 'order.lihat_milik'] as const;

@Controller('app/orders')
export class AppOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Perlu(...LIHAT_ORDER)
  @Get()
  async daftar(
    @Query() query: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const f = validasi(skemaFilterOrder, query);
    const where: Prisma.OrderWhereInput = { AND: [whereOrderMilik(pelaku)] };
    const and = where.AND as Prisma.OrderWhereInput[];
    if (f.status.length) and.push({ status: { in: f.status } });
    if (f.entitas) and.push({ entitas: f.entitas });
    if (f.metode) and.push({ metodeBayar: f.metode });
    if (f.cs === 'cs_ai') and.push({ agen: 'cs_ai' });
    else if (f.cs) and.push({ csUserId: f.cs });
    if (f.produk) {
      and.push({
        items: {
          some: {
            OR: [
              { productId: f.produk },
              { product: { bundleItems: { some: { componentProductId: f.produk } } } },
            ],
          },
        },
      });
    }
    const rentang = rentangWib(f.dari, f.sampai);
    if (rentang) and.push({ createdAt: rentang });
    if (f.sla === 'terlambat') {
      and.push({
        status: { in: ['terverifikasi', 'di_gudang'] },
        terverifikasiAt: { lt: new Date(sekarang.getTime() - SLA_RESI_JAM.kuning * 3_600_000) },
      });
    }
    if (f.verifikasi_manusia) and.push({ status: 'baru', perluVerifikasiManusia: true });
    if (f.cari) {
      and.push({
        OR: [
          { nomor: { contains: f.cari, mode: 'insensitive' } },
          { penerimaNama: { contains: f.cari, mode: 'insensitive' } },
        ],
      });
    }

    const [total, data] = await Promise.all([
      this.prisma.client.order.count({ where }),
      this.prisma.client.order.findMany({
        where,
        include: {
          items: { include: { product: { select: { sku: true } } } },
          csUser: { select: { id: true, nama: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (f.halaman - 1) * f.per,
        take: f.per,
      }),
    ]);
    return {
      total,
      halaman: f.halaman,
      per: f.per,
      data: data.map((o) => ({
        id: o.id,
        nomor: o.nomor,
        orderGroupId: o.orderGroupId,
        dibuatAt: o.createdAt,
        status: o.status,
        entitas: o.entitas,
        metodeBayar: o.metodeBayar,
        total: o.total,
        nilaiCod: o.nilaiCod,
        agen: o.agen,
        cs: o.csUser,
        penerimaNama: o.penerimaNama,
        kota: o.kota,
        items: o.items.map((i) => ({ sku: i.product.sku, qty: i.qty })),
        perluVerifikasiManusia: o.perluVerifikasiManusia,
        sla:
          o.terverifikasiAt && (o.status === 'terverifikasi' || o.status === 'di_gudang')
            ? tandaSlaResi(o.terverifikasiAt, sekarang)
            : null,
        tertahan:
          o.status === 'baru' &&
          sekarang.getTime() - o.createdAt.getTime() > BATAS_UMUR_BARU_JAM * 3_600_000,
      })),
    };
  }

  @Perlu(...LIHAT_ORDER)
  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const o = await this.prisma.client.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { sku: true, nama: true, tipe: true } } } },
        shipments: { orderBy: { createdAt: 'asc' } },
        returns: true,
        csUser: { select: { id: true, nama: true } },
        lead: {
          select: {
            id: true,
            status: true,
            agen: true,
            adId: true,
            campaignId: true,
            csUserId: true,
          },
        },
        customer: { select: { tandaRts: true } },
        orderGroup: {
          include: {
            orders: { select: { id: true, nomor: true, entitas: true, status: true, total: true } },
          },
        },
        statusHistory: {
          orderBy: { waktu: 'asc' },
          include: {
            olehUser: { select: { nama: true } },
            olehApiKey: { select: { nama: true, sistem: true } },
          },
        },
      },
    });
    if (!o) throw new NotFoundException(galat('tidak_ditemukan', 'Order tidak ditemukan'));
    pastikanMilik(pelaku, o, o.lead?.csUserId);

    const pii = bolehLihatPii(pelaku);
    const izin = pelaku.tipe === 'user' ? pelaku.izin : [];
    return {
      id: o.id,
      nomor: o.nomor,
      status: o.status,
      entitas: o.entitas,
      sumber: o.sumber,
      agen: o.agen,
      cs: o.csUser,
      metodeBayar: o.metodeBayar,
      subtotal: o.subtotal,
      diskon: o.diskon,
      ongkir: o.ongkir,
      total: o.total,
      nilaiCod: o.nilaiCod,
      perluVerifikasiManusia: o.perluVerifikasiManusia,
      pelangganTandaRts: o.customer.tandaRts,
      catatan: o.catatan,
      alasanBatal: o.alasanBatal,
      ethixRef: o.ethixRef,
      dibuatAt: o.createdAt,
      terverifikasiAt: o.terverifikasiAt,
      terkirimAt: o.terkirimAt,
      dibatalkanAt: o.dibatalkanAt,
      sla:
        o.terverifikasiAt && (o.status === 'terverifikasi' || o.status === 'di_gudang')
          ? tandaSlaResi(o.terverifikasiAt, sekarang)
          : null,
      penerima: {
        nama: o.penerimaNama,
        noWa: samarkan(o.penerimaNoWa, pii),
        alamat: pii ? o.alamat : ALAMAT_DISAMARKAN,
        kelurahan: pii ? o.kelurahan : o.kelurahan && ALAMAT_DISAMARKAN,
        kecamatan: o.kecamatan,
        kota: o.kota,
        provinsi: o.provinsi,
        kodePos: pii ? o.kodePos : o.kodePos && ALAMAT_DISAMARKAN,
      },
      items: o.items.map((i) => ({
        sku: i.product.sku,
        nama: i.product.nama,
        tipe: i.product.tipe,
        qty: i.qty,
        hargaSatuan: i.hargaSatuan,
        subtotal: i.subtotal,
      })),
      pengiriman: o.shipments.map((s) => ({
        kurir: s.kurir,
        resi: s.resi,
        statusKurir: s.statusKurir,
        percobaanAntar: s.percobaanAntar,
        dikirimAt: s.dikirimAt,
        diterimaAt: s.diterimaAt,
      })),
      retur: o.returns.map((r) => ({
        jenis: r.jenis,
        alasan: r.alasan,
        kondisiBarang: r.kondisiBarang,
        ongkirBalik: r.ongkirBalik,
        diterimaGudangAt: r.diterimaGudangAt,
      })),
      lead: o.lead,
      grup: o.orderGroup.orders.filter((x) => x.id !== o.id),
      riwayat: o.statusHistory.map((h) => ({
        dari: h.dariStatus,
        ke: h.keStatus,
        waktu: h.waktu,
        catatan: h.catatan,
        oleh:
          h.olehUser?.nama ??
          (h.olehApiKey ? `${h.olehApiKey.nama} (${h.olehApiKey.sistem})` : 'Sistem'),
      })),
      aksi: {
        verifikasi: o.status === 'baru' && izin.includes('order.verifikasi'),
        batal: STATUS_BOLEH_BATAL.includes(o.status) && izin.includes('order.batal'),
        koreksiAlamat:
          STATUS_BOLEH_KOREKSI_ALAMAT.includes(o.status) && izin.includes('order.koreksi_alamat'),
      },
    };
  }

  @Perlu('order.buat')
  @Post('pratinjau')
  @HttpCode(200)
  async pratinjau(@Body() body: unknown, @WaktuSaatIni() sekarang: Date) {
    return this.orders.pratinjau(validasi(skemaPratinjau, body), sekarang);
  }

  @Perlu('order.buat')
  @Post()
  async buat(
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const b = validasi(skemaOrderBaru, body);
    const lead = await this.prisma.client.lead.findUnique({ where: { id: b.leadId } });
    if (!lead) throw new NotFoundException(galat('lead_tidak_ditemukan', 'Lead tidak ditemukan'));
    pastikanLeadMilik(pelaku, lead);
    const csUserId = pelaku.tipe === 'user' && pelaku.role === 'cs' ? pelaku.userId : lead.csUserId;
    const hasil = await this.orders.buatCheckout(
      {
        sumber: 'cs_manusia',
        leadId: b.leadId,
        agen: 'cs_manusia',
        csUserId,
        metodeBayar: b.metodeBayar,
        penerima: b.penerima,
        alamat: b.alamat,
        items: b.items,
        ongkir: b.ongkir,
        diskon: b.diskon,
        catatan: b.catatan,
      },
      pelaku,
      sekarang,
    );
    return {
      orderGroupId: hasil.grup.id,
      orders: hasil.orders.map((o) => ({
        id: o.id,
        nomor: o.nomor,
        entitas: o.entitas,
        total: o.total,
      })),
    };
  }

  @Perlu('order.verifikasi')
  @Post(':id/verifikasi')
  @HttpCode(200)
  async verifikasi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const b = validasi(skemaVerifikasi, body);
    await this.cekMilik(id, pelaku);
    const o = await this.orders.verifikasi(
      id,
      {
        dikonfirmasiAt: sekarang,
        nilaiCodDikonfirmasi: b.nilaiCodDikonfirmasi,
        catatan: b.catatan,
      },
      pelaku,
      sekarang,
    );
    return { id: o.id, status: o.status };
  }

  @Perlu('order.batal')
  @Post(':id/batal')
  @HttpCode(200)
  async batal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const { alasan } = validasi(z.object({ alasan: teks(500) }), body);
    const o = await this.orders.batal(id, alasan, pelaku, sekarang);
    return { id: o.id, status: o.status };
  }

  @Perlu('order.koreksi_alamat')
  @Patch(':id/alamat')
  async koreksiAlamat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
  ) {
    const b = validasi(skemaKoreksi, body);
    const o = await this.orders.koreksiAlamat(id, b, pelaku);
    return { id: o.id, status: o.status };
  }

  private async cekMilik(id: string, pelaku: Pelaku) {
    const o = await this.prisma.client.order.findUnique({
      where: { id },
      select: { csUserId: true, lead: { select: { csUserId: true } } },
    });
    if (!o) throw new NotFoundException(galat('tidak_ditemukan', 'Order tidak ditemukan'));
    if (pelaku.tipe !== 'user') throw new ForbiddenException();
    pastikanMilik(pelaku, o, o.lead?.csUserId);
  }
}
