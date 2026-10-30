import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { JENIS_EVENT_ETHIX } from '@grason/shared';
import { z } from 'zod';
import { PelakuSaatIni, PerluScope, WaktuSaatIni } from '../common/decorators';
import { galat, validasi } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { EthixService } from '../ethix/ethix.service';
import { orderEthixKontrak } from './serialisasi';

// Endpoint sisi OMS di docs/api-contract/ethix.v1.yaml. Hanya untuk API key sistem ethix.

const waktu = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const nullable = <T extends z.ZodType>(s: T) => s.nullable().optional();

const skemaEvent = z.object({
  event_id: z.string().min(1).max(100),
  order_nomor: z.string().min(1),
  ethix_ref: nullable(z.string()),
  jenis: z.enum(JENIS_EVENT_ETHIX),
  terjadi_at: waktu,
  kurir: nullable(z.string()),
  resi: nullable(z.string()),
  status_kurir: nullable(z.string()),
  percobaan_antar: nullable(z.number().int().min(0)),
  alasan: nullable(z.string()),
  kondisi_barang: nullable(z.enum(['layak_jual', 'rusak', 'tidak_lengkap'])),
  ongkir_balik: nullable(z.number().int().min(0)),
});

const skemaBatchEvent = z.object({ events: z.array(skemaEvent).min(1).max(500) });

const skemaStok = z.object({
  snapshot_at: waktu,
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        stok_layak_jual: z.number().int().min(0),
        stok_retur_layak: nullable(z.number().int().min(0)),
        dialokasikan: nullable(z.number().int().min(0)),
      }),
    )
    .min(1),
});

const skemaDaftar = z.object({
  status: z.enum(['siap_kirim', 'batal']).default('siap_kirim'),
  sejak: waktu.optional(),
  kursor: z.string().optional(),
  batas: z.coerce.number().int().min(1).max(500).default(100),
});

@Controller('ethix')
export class EthixController {
  constructor(private readonly ethix: EthixService) {}

  @PerluScope('pengiriman.tulis')
  @Post('shipment-events')
  @HttpCode(200)
  async events(
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
    @WaktuSaatIni() sekarang: Date,
  ) {
    const { events } = validasi(skemaBatchEvent, body);
    return this.ethix.terimaEvent(
      events.map((e) => ({
        eventId: e.event_id,
        orderNomor: e.order_nomor,
        ethixRef: e.ethix_ref,
        jenis: e.jenis,
        terjadiAt: e.terjadi_at,
        kurir: e.kurir,
        resi: e.resi,
        statusKurir: e.status_kurir,
        percobaanAntar: e.percobaan_antar,
        alasan: e.alasan,
        kondisiBarang: e.kondisi_barang,
        ongkirBalik: e.ongkir_balik,
      })),
      pelaku,
      sekarang,
    );
  }

  @PerluScope('stok.tulis')
  @Post('stock')
  @HttpCode(200)
  async stok(@Body() body: unknown, @WaktuSaatIni() sekarang: Date) {
    const b = validasi(skemaStok, body);
    return this.ethix.terimaStok(
      b.snapshot_at,
      b.items.map((i) => ({
        sku: i.sku,
        stokLayakJual: i.stok_layak_jual,
        stokReturLayak: i.stok_retur_layak,
      })),
      sekarang,
    );
  }

  @PerluScope('order_ethix.baca')
  @Get('orders')
  async daftar(@Query() query: unknown) {
    const q = validasi(skemaDaftar, query);
    const hasil = await this.ethix.daftarOrder(q);
    return {
      data: hasil.data.map((o) => orderEthixKontrak(o, true)),
      kursor_berikutnya: hasil.kursorBerikutnya,
    };
  }

  @PerluScope('order_ethix.baca')
  @Get('orders/:nomor')
  async ambil(@Param('nomor') nomor: string) {
    const o = await this.ethix.ambilOrder(nomor);
    // Order yang belum terverifikasi belum ditujukan ke Ethix.
    if (!o || !o.terverifikasiAt) {
      throw new NotFoundException(galat('tidak_ditemukan', 'Order tidak ditemukan'));
    }
    return orderEthixKontrak(o, false);
  }
}
