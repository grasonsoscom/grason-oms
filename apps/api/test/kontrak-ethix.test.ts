import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buatAppUji,
  eventEthix,
  isiStok,
  kunciSistem,
  loginSebagai,
  resetData,
  type KonteksUji,
} from './bantuan';
import { cocokKontrak } from './kontrak';

let ctx: KonteksUji;
let csAi: string;
let ethix: string;
let urut = 0;

beforeAll(async () => {
  ctx = await buatAppUji();
});

afterAll(async () => {
  await ctx.app.close();
});

beforeEach(async () => {
  await resetData(ctx.prisma);
  csAi = await kunciSistem(ctx, 'cs_ai');
  ethix = await kunciSistem(ctx, 'ethix');
  await isiStok(ctx, ethix, { 'VVG-01': 20, 'BSR-01': 20, 'KKT-01': 20, 'WUP-01': 20 });
});

/** Order COD terverifikasi dari CS AI; kembalikan id dan nomor. */
async function orderTerverifikasi(metode: 'cod' | 'transfer' = 'cod') {
  urut += 1;
  const lead = await ctx
    .http()
    .post('/api/v1/leads')
    .set('X-Api-Key', csAi)
    .send({
      external_id: `l-${urut}`,
      no_wa: `08123450${String(urut).padStart(4, '0')}`,
      masuk_at: new Date().toISOString(),
    })
    .expect(201);
  const c = await ctx
    .http()
    .post('/api/v1/orders')
    .set('X-Api-Key', csAi)
    .send({
      external_id: `c-${urut}`,
      lead_id: lead.body.id,
      metode_bayar: metode,
      penerima: { nama: 'Budi', no_wa: '081298765432' },
      alamat: { alamat: 'Jl. Kenanga 5', kota: 'Surabaya', provinsi: 'Jawa Timur' },
      items: [{ sku: 'VVG-01', qty: 1 }],
      ongkir: 9000,
    })
    .expect(201);
  const o = c.body.orders[0];
  await ctx
    .http()
    .post(`/api/v1/orders/${o.id}/verifikasi`)
    .set('X-Api-Key', csAi)
    .send({ dikonfirmasi_at: new Date().toISOString(), nilai_cod_dikonfirmasi: o.nilai_cod })
    .expect(200);
  return { id: o.id as string, nomor: o.nomor as string, customerId: '' };
}

const statusOrder = async (id: string) =>
  (await ctx.prisma.order.findUniqueOrThrow({ where: { id } })).status;

describe('event pengiriman Ethix', () => {
  it('alur lengkap sampai terkirim, dengan riwayat dan resi', async () => {
    const o = await orderTerverifikasi();
    await eventEthix(ctx, ethix, o.nomor, 'diterima_gudang', { ethix_ref: 'ETX-9' });
    await eventEthix(ctx, ethix, o.nomor, 'dikemas');
    await eventEthix(ctx, ethix, o.nomor, 'dikirim', { kurir: 'SiCepat', resi: 'SCP1' });
    await eventEthix(ctx, ethix, o.nomor, 'gagal_antar', {
      alasan: 'Rumah kosong',
      percobaan_antar: 1,
    });
    const r = await eventEthix(ctx, ethix, o.nomor, 'terkirim', { status_kurir: 'DELIVERED' });
    cocokKontrak('ethix', 'HasilBatch', r);

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { statusHistory: { orderBy: { waktu: 'asc' } }, shipments: true },
    });
    expect(order.status).toBe('terkirim');
    expect(order.ethixRef).toBe('ETX-9');
    expect(order.terkirimAt).not.toBeNull();
    expect(order.shipments[0]).toMatchObject({
      resi: 'SCP1',
      percobaanAntar: 1,
      statusKurir: 'DELIVERED',
    });
    expect(order.statusHistory.map((h) => [h.dariStatus, h.keStatus])).toEqual([
      [null, 'baru'],
      ['baru', 'terverifikasi'],
      ['terverifikasi', 'di_gudang'],
      ['di_gudang', 'di_gudang'], // dikemas
      ['di_gudang', 'dikirim'],
      ['dikirim', 'dikirim'], // gagal antar
      ['dikirim', 'terkirim'],
    ]);

    // Order yang sudah diterima Ethix tidak muncul lagi di polling siap_kirim.
    const siap = await ctx.http().get('/api/v1/ethix/orders').set('X-Api-Key', ethix).expect(200);
    expect(siap.body.data).toEqual([]);
  });

  it('event ganda dihitung duplikat, event terlewat diabaikan', async () => {
    const o = await orderTerverifikasi();
    const ev = {
      event_id: 'sama-1',
      order_nomor: o.nomor,
      jenis: 'dikirim',
      kurir: 'JNE',
      resi: 'JNE9',
      terjadi_at: new Date().toISOString(),
    };
    const kirim = () =>
      ctx
        .http()
        .post('/api/v1/ethix/shipment-events')
        .set('X-Api-Key', ethix)
        .send({ events: [ev] });
    expect((await kirim()).body).toEqual({ diterima: 1, duplikat: 0, gagal: [] });
    expect((await kirim()).body).toEqual({ diterima: 0, duplikat: 1, gagal: [] });

    // diterima_gudang datang belakangan: diabaikan, status tetap dikirim.
    const telat = await eventEthix(ctx, ethix, o.nomor, 'diterima_gudang');
    expect(telat).toEqual({ diterima: 1, duplikat: 0, gagal: [] });
    expect(await statusOrder(o.id)).toBe('dikirim');
  });

  it('RTS mencatat retur, menandai pelanggan, lalu barang diterima kembali', async () => {
    const o = await orderTerverifikasi();
    await eventEthix(ctx, ethix, o.nomor, 'dikirim', { kurir: 'JNE', resi: 'JNE7' });
    await eventEthix(ctx, ethix, o.nomor, 'rts', { alasan: 'COD ditolak', ongkir_balik: 8000 });
    await eventEthix(ctx, ethix, o.nomor, 'diterima_kembali', { kondisi_barang: 'layak_jual' });

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { returns: true, customer: true },
    });
    expect(order.status).toBe('rts');
    expect(order.customer.tandaRts).toBe(true);
    expect(order.returns[0]).toMatchObject({
      jenis: 'rts',
      alasan: 'COD ditolak',
      ongkirBalik: 8000,
      kondisiBarang: 'layak_jual',
    });
    expect(order.returns[0]!.diterimaGudangAt).not.toBeNull();

    const webhook = await ctx.prisma.integrationEvent.findFirst({
      where: { sistem: 'cs_ai', arah: 'keluar', jenis: 'order.status_changed' },
      orderBy: { createdAt: 'desc' },
    });
    expect((webhook!.payload as { data: { alasan: string } }).data.alasan).toBe('cod_ditolak');
  });

  it('menolak event tidak valid per event tanpa menggagalkan batch', async () => {
    const o = await orderTerverifikasi();
    const res = await ctx
      .http()
      .post('/api/v1/ethix/shipment-events')
      .set('X-Api-Key', ethix)
      .send({
        events: [
          {
            event_id: 'a',
            order_nomor: 'GRS-00000000-0000',
            jenis: 'diterima_gudang',
            terjadi_at: new Date().toISOString(),
          },
          {
            event_id: 'b',
            order_nomor: o.nomor,
            jenis: 'terkirim',
            terjadi_at: new Date().toISOString(),
          },
          {
            event_id: 'c',
            order_nomor: o.nomor,
            jenis: 'dikirim',
            terjadi_at: new Date().toISOString(),
          },
          {
            event_id: 'd',
            order_nomor: o.nomor,
            jenis: 'diterima_gudang',
            terjadi_at: new Date().toISOString(),
          },
        ],
      })
      .expect(200);
    cocokKontrak('ethix', 'HasilBatch', res.body);
    expect(res.body.diterima).toBe(1);
    expect(
      res.body.gagal.map((g: { id: string; error: { kode: string } }) => [g.id, g.error.kode]),
    ).toEqual([
      ['a', 'order_tidak_dikenal'],
      ['b', 'transisi_tidak_valid'],
      ['c', 'data_tidak_lengkap'],
    ]);
    expect(await statusOrder(o.id)).toBe('di_gudang');
  });

  it('order batal muncul di polling batal dan menolak event', async () => {
    const o = await orderTerverifikasi();
    const ops = await loginSebagai(ctx, 'sales_ops');
    await ctx
      .http()
      .post(`/api/v1/app/orders/${o.id}/batal`)
      .set('Cookie', ops)
      .send({ alasan: 'Pembeli membatalkan' })
      .expect(200);
    const batal = await ctx
      .http()
      .get('/api/v1/ethix/orders?status=batal')
      .set('X-Api-Key', ethix)
      .expect(200);
    expect(
      batal.body.data.map((x: { order_nomor: string; status: string }) => [
        x.order_nomor,
        x.status,
      ]),
    ).toEqual([[o.nomor, 'batal']]);
    const r = await eventEthix(ctx, ethix, o.nomor, 'diterima_gudang');
    expect(r.gagal[0]!.error.kode).toBe('order_batal');
  });

  it('polling memakai kursor', async () => {
    for (let i = 0; i < 3; i += 1) await orderTerverifikasi();
    const a = await ctx
      .http()
      .get('/api/v1/ethix/orders?batas=2')
      .set('X-Api-Key', ethix)
      .expect(200);
    expect(a.body.data).toHaveLength(2);
    const b = await ctx
      .http()
      .get(`/api/v1/ethix/orders?batas=2&kursor=${a.body.kursor_berikutnya}`)
      .set('X-Api-Key', ethix)
      .expect(200);
    expect(b.body.data).toHaveLength(1);
    expect(b.body.kursor_berikutnya).toBeNull();
    const nomor = [...a.body.data, ...b.body.data].map(
      (x: { order_nomor: string }) => x.order_nomor,
    );
    expect(new Set(nomor).size).toBe(3);
  });
});

describe('stok dari Ethix', () => {
  it('snapshot lama diabaikan; SKU paket dan tak dikenal ditolak', async () => {
    const lama = new Date(Date.now() - 3_600_000);
    const res = await ctx
      .http()
      .post('/api/v1/ethix/stock')
      .set('X-Api-Key', ethix)
      .send({
        snapshot_at: lama.toISOString(),
        items: [
          { sku: 'VVG-01', stok_layak_jual: 1 },
          { sku: 'VVG-P2', stok_layak_jual: 5 },
          { sku: 'ZZZ-01', stok_layak_jual: 5 },
        ],
      })
      .expect(200);
    cocokKontrak('ethix', 'HasilBatch', res.body);
    expect(res.body.duplikat).toBe(1);
    expect(res.body.gagal.map((g: { error: { kode: string } }) => g.error.kode)).toEqual([
      'bukan_sku_komponen',
      'sku_tidak_dikenal',
    ]);

    await isiStok(ctx, ethix, { 'VVG-01': 7 });
    const stok = await ctx
      .http()
      .get('/api/v1/stock?sku=VVG-01')
      .set('X-Api-Key', csAi)
      .expect(200);
    expect(stok.body.data[0].tersedia).toBe(7);
  });
});
