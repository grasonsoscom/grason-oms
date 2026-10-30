import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Prisma } from '@grason/db';
import { ALAMAT_DISAMARKAN } from '@grason/shared';
import { z } from 'zod';
import { PelakuSaatIni, Perlu, WaktuSaatIni } from '../common/decorators';
import { validasi } from '../common/galat';
import { bolehLihatPii, type Pelaku } from '../common/pelaku';
import { LeadsService, pastikanLeadMilik, type LeadLengkap } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { rentangWib, samarkan, skemaFilterLead, whereLeadMilik, whereOrderMilik } from './filter';

const opsional = (maks: number) =>
  z
    .string()
    .trim()
    .max(maks)
    .optional()
    .transform((s) => s || null);

const skemaLeadBaru = z.object({
  noWa: z.string().trim().min(1).max(20),
  nama: opsional(100),
  skuDitanya: opsional(20),
  kanal: z.enum(['click_to_whatsapp', 'landing_page', 'organik', 'lainnya']).default('organik'),
  campaignId: opsional(50),
  adId: opsional(50),
  catatan: opsional(2000),
});

const skemaUbah = z
  .object({
    status: z.enum(['direspon', 'follow_up', 'gagal']).optional(),
    catatan: z.string().max(2000).optional(),
  })
  .refine((o) => o.status !== undefined || o.catatan !== undefined, 'Minimal satu field');

const LIHAT_LEAD = ['lead.lihat_semua', 'lead.lihat_milik'] as const;

@Controller('app/leads')
export class AppLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
  ) {}

  @Perlu(...LIHAT_LEAD)
  @Get()
  async daftar(@Query() query: unknown, @PelakuSaatIni() pelaku: Pelaku) {
    const f = validasi(skemaFilterLead, query);
    const and: Prisma.LeadWhereInput[] = [whereLeadMilik(pelaku)];
    if (f.status.length) and.push({ status: { in: f.status } });
    if (f.agen) and.push({ agen: f.agen });
    if (f.cs) and.push({ csUserId: f.cs });
    if (f.handover === 'ya') and.push({ handover: true });
    if (f.handover === 'antrian') and.push({ handover: true, csUserId: null });
    if (f.produk) and.push({ produkDitanyaId: f.produk });
    const rentang = rentangWib(f.dari, f.sampai);
    if (rentang) and.push({ masukAt: rentang });
    if (f.cari) {
      const digit = f.cari.replace(/\D/g, '');
      and.push({
        customer: {
          OR: [
            { nama: { contains: f.cari, mode: 'insensitive' } },
            ...(digit.length >= 4 ? [{ noWa: { contains: digit } }] : []),
          ],
        },
      });
    }
    const where = { AND: and };
    const [total, data] = await Promise.all([
      this.prisma.client.lead.count({ where }),
      this.prisma.client.lead.findMany({
        where,
        include: {
          customer: { select: { nama: true, noWa: true, tandaRts: true } },
          produkDitanya: { select: { sku: true } },
          csUser: { select: { id: true, nama: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { masukAt: 'desc' },
        skip: (f.halaman - 1) * f.per,
        take: f.per,
      }),
    ]);
    const pii = bolehLihatPii(pelaku);
    return {
      total,
      halaman: f.halaman,
      per: f.per,
      data: data.map((l) => ({
        id: l.id,
        masukAt: l.masukAt,
        nama: l.customer.nama,
        noWa: samarkan(l.customer.noWa, pii),
        tandaRts: l.customer.tandaRts,
        status: l.status,
        agen: l.agen,
        handover: l.handover,
        cs: l.csUser,
        produkDitanya: l.produkDitanya?.sku ?? null,
        kanal: l.kanal,
        adId: l.adId,
        responMenit: l.responPertamaAt
          ? Math.round((l.responPertamaAt.getTime() - l.masukAt.getTime()) / 60_000)
          : null,
        jumlahOrder: l._count.orders,
      })),
    };
  }

  @Perlu(...LIHAT_LEAD)
  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string, @PelakuSaatIni() pelaku: Pelaku) {
    const lead = await this.leads.ambil(id);
    pastikanLeadMilik(pelaku, lead);
    const orders = await this.prisma.client.order.findMany({
      where: { AND: [{ leadId: id }, whereOrderMilik(pelaku)] },
      select: { id: true, nomor: true, entitas: true, status: true, total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return { ...this.tampil(lead, pelaku), orders };
  }

  @Perlu('lead.buat')
  @Post()
  async buat(
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const b = validasi(skemaLeadBaru, body);
    const lead = await this.leads.buatManual({ ...b, masukAt: sekarang }, pelaku, sekarang);
    return this.tampil(lead, pelaku);
  }

  @Perlu('lead.ubah')
  @Patch(':id')
  async ubah(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const b = validasi(skemaUbah, body);
    const lead = await this.leads.ambil(id);
    pastikanLeadMilik(pelaku, lead);
    // Lead CS manusia: perubahan pertama dari baru dianggap respon pertama.
    const responPertamaAt = lead.responPertamaAt ? undefined : sekarang;
    return this.tampil(
      await this.leads.ubah(
        lead,
        { status: b.status, catatan: b.catatan, responPertamaAt },
        sekarang,
      ),
      pelaku,
    );
  }

  @Perlu('lead.bagi')
  @Post(':id/bagi')
  @HttpCode(200)
  async bagi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
  ) {
    const { csUserId } = validasi(z.object({ csUserId: z.uuid() }), body);
    return this.tampil(await this.leads.bagi(id, csUserId), pelaku);
  }

  @Perlu('handover.ambil_alih')
  @Post(':id/ambil-alih')
  @HttpCode(200)
  async ambilAlih(@Param('id', ParseUUIDPipe) id: string, @PelakuSaatIni() pelaku: Pelaku) {
    return this.tampil(await this.leads.ambilAlih(id, pelaku), pelaku);
  }

  private tampil(l: LeadLengkap, pelaku: Pelaku) {
    const pii = bolehLihatPii(pelaku);
    const c = l.customer;
    return {
      id: l.id,
      sumber: l.sumber,
      externalId: l.externalId,
      agen: l.agen,
      status: l.status,
      handover: l.handover,
      handoverAt: l.handoverAt,
      handoverAlasan: l.handoverAlasan,
      masukAt: l.masukAt,
      responPertamaAt: l.responPertamaAt,
      kanal: l.kanal,
      segmen: l.segmen,
      campaignId: l.campaignId,
      adsetId: l.adsetId,
      adId: l.adId,
      catatan: l.catatan,
      produkDitanya: l.produkDitanya,
      cs: l.csUser,
      pelanggan: {
        nama: c.nama,
        noWa: samarkan(c.noWa, pii),
        tandaRts: c.tandaRts,
        alamat: pii ? c.alamat : c.alamat && ALAMAT_DISAMARKAN,
        kelurahan: pii ? c.kelurahan : c.kelurahan && ALAMAT_DISAMARKAN,
        kecamatan: c.kecamatan,
        kota: c.kota,
        provinsi: c.provinsi,
        kodePos: pii ? c.kodePos : c.kodePos && ALAMAT_DISAMARKAN,
      },
    };
  }
}
