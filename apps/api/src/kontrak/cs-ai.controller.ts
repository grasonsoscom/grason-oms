import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { LEAD_STATUS, METODE_BAYAR, SEGMEN } from '@grason/shared';
import { z } from 'zod';
import { PelakuSaatIni, PerluScope, VersiKontrak, WaktuSaatIni } from '../common/decorators';
import { galat, validasi } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { LeadsService } from '../leads/leads.service';
import { OrdersService, INCLUDE_ORDER } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { StokService } from '../stok/stok.service';
import { checkoutKontrak, leadKontrak, orderKontrak, stokKontrak } from './serialisasi';
import { LogMasukInterceptor } from './log-masuk.interceptor';

// Endpoint kontrak docs/api-contract/cs-ai.v1.yaml (/api/v1) dan cs-ai.v2.yaml (/api/v2).
// Hanya untuk API key sistem cs_ai. Beda v2: rincian harga COD dan segmen (keputusan 0006).

const waktu = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const rupiah = z.number().int().min(0);
const teks = (maks: number) => z.string().trim().min(1).max(maks);

const skemaLeadBaru = z.object({
  external_id: teks(100),
  no_wa: z.string().min(1),
  nama: z.string().max(100).optional(),
  sku_ditanya: z.string().optional(),
  masuk_at: waktu,
  catatan: z.string().max(2000).optional(),
  kanal: z.enum(['click_to_whatsapp', 'landing_page', 'organik', 'lainnya']).optional(),
  campaign_id: z.string().nullable().optional(),
  adset_id: z.string().nullable().optional(),
  ad_id: z.string().nullable().optional(),
  segmen: z.enum(SEGMEN).optional(),
});

const skemaUbahLead = z
  .object({
    status: z.enum(LEAD_STATUS).optional(),
    respon_pertama_at: waktu.optional(),
    handover: z.object({ alasan: teks(500), terjadi_at: waktu.optional() }).optional(),
    catatan: z.string().max(2000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Minimal satu field');

export const skemaAlamat = z.object({
  alamat: teks(500),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  kota: teks(100),
  provinsi: teks(100),
  kode_pos: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
});

const skemaOrderBaru = z.object({
  external_id: teks(100),
  lead_id: z.uuid(),
  metode_bayar: z.enum(METODE_BAYAR),
  penerima: z.object({ nama: teks(100), no_wa: z.string().min(1) }),
  alamat: skemaAlamat,
  items: z
    .array(z.object({ sku: z.string().min(1), qty: z.number().int().min(1).max(100) }))
    .min(1)
    .max(20),
  ongkir: rupiah.default(0),
  diskon: rupiah.default(0),
  catatan: z.string().max(1000).optional(),
});

const skemaOrderBaruV2 = skemaOrderBaru.extend({
  subsidi_ongkir: rupiah.default(0),
  biaya_cod: rupiah.default(0),
  subsidi_admin_cod: rupiah.default(0),
  total: rupiah,
  segmen: z.enum(SEGMEN).optional(),
});

const skemaVerifikasi = z.object({
  dikonfirmasi_at: waktu,
  nilai_cod_dikonfirmasi: rupiah,
  catatan: z.string().max(1000).optional(),
});

@Controller({ version: ['1', '2'] })
@UseInterceptors(LogMasukInterceptor)
export class CsAiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly orders: OrdersService,
    private readonly stok: StokService,
  ) {}

  @PerluScope('lead.tulis')
  @Post('leads')
  async buatLead(
    @Body() body: unknown,
    @VersiKontrak() v: 1 | 2,
    @WaktuSaatIni() sekarang: Date,
    @Res({ passthrough: true }) res: Response,
  ) {
    const b = validasi(skemaLeadBaru, body);
    const { lead, baru } = await this.leads.buatDariCsAi(
      {
        externalId: b.external_id,
        noWa: b.no_wa,
        nama: b.nama,
        kanal: b.kanal,
        campaignId: b.campaign_id,
        adsetId: b.adset_id,
        adId: b.ad_id,
        skuDitanya: b.sku_ditanya,
        masukAt: b.masuk_at,
        catatan: b.catatan,
        segmen: v === 2 ? b.segmen : undefined,
      },
      sekarang,
    );
    res.status(baru ? 201 : 200);
    return leadKontrak(lead, v);
  }

  @PerluScope('lead.tulis')
  @Get('leads/:id')
  async ambilLead(@Param('id', ParseUUIDPipe) id: string, @VersiKontrak() v: 1 | 2) {
    return leadKontrak(await this.leadCsAi(id), v);
  }

  @PerluScope('lead.tulis')
  @Patch('leads/:id')
  async ubahLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @VersiKontrak() v: 1 | 2,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const b = validasi(skemaUbahLead, body);
    const lead = await this.leadCsAi(id);
    const hasil = await this.leads.ubah(
      lead,
      {
        status: b.status,
        responPertamaAt: b.respon_pertama_at,
        handover: b.handover
          ? { alasan: b.handover.alasan, terjadiAt: b.handover.terjadi_at }
          : undefined,
        catatan: b.catatan,
      },
      sekarang,
    );
    return leadKontrak(hasil, v);
  }

  @PerluScope('order.tulis')
  @Post('orders')
  async buatOrder(
    @Body() body: unknown,
    @VersiKontrak() v: 1 | 2,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
    @Res({ passthrough: true }) res: Response,
  ) {
    const b = validasi(skemaOrderBaru, body);
    const r = v === 2 ? validasi(skemaOrderBaruV2, body) : null;
    await this.leadCsAi(b.lead_id, 'lead_tidak_ditemukan');
    const hasil = await this.orders.buatCheckout(
      {
        sumber: 'cs_ai',
        externalId: b.external_id,
        leadId: b.lead_id,
        agen: 'cs_ai',
        metodeBayar: b.metode_bayar,
        penerima: { nama: b.penerima.nama, noWa: b.penerima.no_wa },
        alamat: { ...b.alamat, kodePos: b.alamat.kode_pos },
        items: b.items,
        ongkir: b.ongkir,
        diskon: b.diskon,
        ...(r && {
          subsidiOngkir: r.subsidi_ongkir,
          biayaCod: r.biaya_cod,
          subsidiAdminCod: r.subsidi_admin_cod,
          segmen: r.segmen,
          totalDiharapkan: r.total,
        }),
        catatan: b.catatan,
      },
      pelaku,
      sekarang,
    );
    res.status(hasil.baru ? 201 : 200);
    return checkoutKontrak(hasil.grup, hasil.orders, v);
  }

  @PerluScope('order.baca')
  @Get('orders/:id')
  async ambilOrder(@Param('id', ParseUUIDPipe) id: string, @VersiKontrak() v: 1 | 2) {
    const o = await this.prisma.client.order.findFirst({
      where: { id, sumber: 'cs_ai' },
      include: INCLUDE_ORDER,
    });
    if (!o) throw new NotFoundException(galat('tidak_ditemukan', 'Order tidak ditemukan'));
    return orderKontrak(o, v);
  }

  @PerluScope('order.tulis')
  @Post('orders/:id/verifikasi')
  @HttpCode(200)
  async verifikasi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @VersiKontrak() v: 1 | 2,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const b = validasi(skemaVerifikasi, body);
    const ada = await this.prisma.client.order.count({ where: { id, sumber: 'cs_ai' } });
    if (!ada) throw new NotFoundException(galat('tidak_ditemukan', 'Order tidak ditemukan'));
    const o = await this.orders.verifikasi(
      id,
      {
        dikonfirmasiAt: b.dikonfirmasi_at,
        nilaiCodDikonfirmasi: b.nilai_cod_dikonfirmasi,
        catatan: b.catatan,
      },
      pelaku,
      sekarang,
    );
    return orderKontrak(o, v);
  }

  @PerluScope('stok.baca')
  @Get('stock')
  async daftarStok(@Query('sku') sku: string | undefined, @WaktuSaatIni() sekarang: Date) {
    const filter = sku
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const stok = await this.stok.hitung(sekarang);
    return {
      data: stok.filter((s) => !filter?.length || filter.includes(s.sku)).map(stokKontrak),
    };
  }

  @PerluScope('harga.baca')
  @Get('prices')
  async daftarHarga() {
    const produk = await this.prisma.client.product.findMany({
      where: { aktif: true },
      include: { bundleItems: { include: { komponen: { select: { sku: true } } } } },
      orderBy: [{ tipe: 'asc' }, { sku: 'asc' }],
    });
    return {
      data: produk.map((p) => ({
        sku: p.sku,
        nama: p.nama,
        tipe: p.tipe,
        entitas: p.entitas,
        harga_jual: p.hargaJual,
        komponen: p.bundleItems.map((b) => ({ sku: b.komponen.sku, qty: b.qty })),
      })),
    };
  }

  /** CS AI hanya melihat lead yang ia buat. */
  private async leadCsAi(id: string, kode = 'tidak_ditemukan') {
    const lead = await this.leads.ambil(id).catch(() => null);
    if (!lead || lead.sumber !== 'cs_ai') {
      throw new NotFoundException(galat(kode, 'Lead tidak ditemukan'));
    }
    return lead;
  }
}
