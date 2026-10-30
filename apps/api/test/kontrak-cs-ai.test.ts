import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  eventEthix,
  isiStok,
  kunciSistem,
  resetData,
  buatAppUji,
  type KonteksUji,
} from './bantuan';
import { cocokDaftar, cocokKontrak } from './kontrak';

let ctx: KonteksUji;
let csAi: string;
let ethix: string;

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
  await isiStok(ctx, ethix, { 'VVG-01': 50, 'BSR-01': 50, 'KKT-01': 50, 'WUP-01': 50 });
});

const http = () => ({
  post: (url: string, body: object) => ctx.http().post(url).set('X-Api-Key', csAi).send(body),
  patch: (url: string, body: object) => ctx.http().patch(url).set('X-Api-Key', csAi).send(body),
  get: (url: string) => ctx.http().get(url).set('X-Api-Key', csAi),
});

let urut = 0;
async function buatLead(tambahan: object = {}) {
  urut += 1;
  const res = await http()
    .post('/api/v1/leads', {
      external_id: `percakapan-${urut}`,
      no_wa: '0812-3456-7890',
      nama: 'Siti',
      kanal: 'click_to_whatsapp',
      campaign_id: '1202',
      ad_id: '1203',
      sku_ditanya: 'BSR-01',
      masuk_at: new Date(Date.now() - 60_000).toISOString(),
      ...tambahan,
    })
    .expect(201);
  cocokKontrak('cs-ai', 'Lead', res.body);
  return res.body as { id: string; external_id: string };
}

function checkout(leadId: string, items: { sku: string; qty: number }[], tambahan: object = {}) {
  urut += 1;
  return {
    external_id: `checkout-${urut}`,
    lead_id: leadId,
    metode_bayar: 'cod',
    penerima: { nama: 'Siti', no_wa: '081234567890' },
    alamat: {
      alamat: 'Jl. Melati 2 RT 01/02',
      kota: 'Bandung',
      provinsi: 'Jawa Barat',
      kode_pos: '40162',
    },
    items,
    ongkir: 12_000,
    ...tambahan,
  };
}

describe('lead dari CS AI', () => {
  it('dibuat dengan nomor WA dinormalisasi; kiriman ulang mengembalikan data yang sama', async () => {
    const lead = await buatLead();
    expect(lead).toMatchObject({ no_wa: '6281234567890', agen: 'cs_ai', status: 'baru' });
    const ulang = await http()
      .post('/api/v1/leads', {
        external_id: lead.external_id,
        no_wa: '081234567890',
        masuk_at: new Date().toISOString(),
      })
      .expect(200);
    expect(ulang.body.id).toBe(lead.id);
    expect(await ctx.prisma.lead.count()).toBe(1);
  });

  it('menolak nomor WA tidak valid', async () => {
    const res = await http()
      .post('/api/v1/leads', {
        external_id: 'x',
        no_wa: '12345',
        masuk_at: new Date().toISOString(),
      })
      .expect(400);
    expect(res.body.error.detail[0].field).toBe('no_wa');
  });

  it('respon pertama sekali saja, handover tidak bisa dibatalkan', async () => {
    const lead = await buatLead();
    const t1 = new Date(Date.now() - 30_000).toISOString();
    const a = await http().patch(`/api/v1/leads/${lead.id}`, { respon_pertama_at: t1 }).expect(200);
    expect(a.body).toMatchObject({
      respon_pertama_at: new Date(t1).toISOString(),
      status: 'direspon',
    });
    const b = await http()
      .patch(`/api/v1/leads/${lead.id}`, { respon_pertama_at: new Date().toISOString() })
      .expect(200);
    expect(b.body.respon_pertama_at).toBe(new Date(t1).toISOString());

    const h = await http()
      .patch(`/api/v1/leads/${lead.id}`, { handover: { alasan: 'Minta bicara dengan manusia' } })
      .expect(200);
    cocokKontrak('cs-ai', 'Lead', h.body);
    expect(h.body.handover).toBe(true);
  });

  it('status closing hanya lewat order', async () => {
    const lead = await buatLead();
    const res = await http().patch(`/api/v1/leads/${lead.id}`, { status: 'closing' }).expect(409);
    expect(res.body.error.kode).toBe('closing_lewat_order');
  });
});

describe('order dari CS AI', () => {
  it('checkout campur SSR dan FHI dipecah jadi dua order dalam satu grup', async () => {
    const lead = await buatLead();
    const res = await http()
      .post(
        '/api/v1/orders',
        checkout(
          lead.id,
          [
            { sku: 'VVG-P2', qty: 1 },
            { sku: 'BSR-01', qty: 1 },
          ],
          { diskon: 10_000, ongkir: 20_000 },
        ),
      )
      .expect(201);
    cocokKontrak('cs-ai', 'Checkout', res.body);
    const [ssr, fhi] = res.body.orders;
    expect(ssr).toMatchObject({ entitas: 'SSR', subtotal: 84_000, status: 'baru' });
    expect(fhi).toMatchObject({ entitas: 'FHI', subtotal: 95_000 });
    expect(ssr.diskon + fhi.diskon).toBe(10_000);
    expect(ssr.ongkir + fhi.ongkir).toBe(20_000);
    expect(ssr.nilai_cod).toBe(ssr.total);
    expect(ssr.order_group_id).toBe(fhi.order_group_id);
    expect(ssr.nomor).toMatch(/^GRS-\d{8}-0001$/);
    expect(fhi.nomor).toMatch(/^GRS-\d{8}-0002$/);

    const l = await http().get(`/api/v1/leads/${lead.id}`).expect(200);
    expect(l.body.status).toBe('closing');
  });

  it('idempoten di external_id checkout', async () => {
    const lead = await buatLead();
    const body = checkout(lead.id, [{ sku: 'BSR-01', qty: 1 }]);
    const a = await http().post('/api/v1/orders', body).expect(201);
    const b = await http().post('/api/v1/orders', body).expect(200);
    expect(b.body.order_group_id).toBe(a.body.order_group_id);
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it('ditolak bila stok tidak cukup, dihitung di level komponen', async () => {
    const lead = await buatLead();
    // VVG-01 stok 50: paket isi 3 × 10 = 30 + satuan 25 = 55 > 50
    const res = await http()
      .post(
        '/api/v1/orders',
        checkout(lead.id, [
          { sku: 'VVG-P3', qty: 10 },
          { sku: 'VVG-01', qty: 25 },
        ]),
      )
      .expect(422);
    expect(res.body.error.kode).toBe('stok_tidak_cukup');
    expect(res.body.error.detail).toEqual([
      { sku: 'VVG-P3', diminta: 10, tersedia: 16 },
      { sku: 'VVG-01', diminta: 25, tersedia: 50 },
    ]);
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it('SKU tidak dikenal = 422', async () => {
    const lead = await buatLead();
    const res = await http()
      .post('/api/v1/orders', checkout(lead.id, [{ sku: 'XXX-01', qty: 1 }]))
      .expect(422);
    expect(res.body.error.kode).toBe('sku_tidak_dikenal');
  });

  it('order mengurangi stok tersedia sampai barang dikirim', async () => {
    const lead = await buatLead();
    const res = await http()
      .post('/api/v1/orders', checkout(lead.id, [{ sku: 'KKT-P2', qty: 2 }]))
      .expect(201);
    const stok = await http().get('/api/v1/stock?sku=KKT-01,KKT-P2').expect(200);
    cocokDaftar('cs-ai', 'Stok', stok.body);
    expect(
      stok.body.data.map((s: { sku: string; tersedia: number }) => [s.sku, s.tersedia]),
    ).toEqual([
      ['KKT-01', 46],
      ['KKT-P2', 23],
    ]);

    // Setelah dikirim, stok Ethix yang berkurang; OMS tidak menahan lagi.
    const nomor = res.body.orders[0].nomor;
    const id = res.body.orders[0].id;
    await http()
      .post(`/api/v1/orders/${id}/verifikasi`, {
        dikonfirmasi_at: new Date().toISOString(),
        nilai_cod_dikonfirmasi: res.body.orders[0].nilai_cod,
      })
      .expect(200);
    await eventEthix(ctx, ethix, nomor, 'dikirim', { kurir: 'JNE', resi: 'JNE001' });
    const sesudah = await http().get('/api/v1/stock?sku=KKT-01').expect(200);
    expect(sesudah.body.data[0].tersedia).toBe(50);
  });

  it('verifikasi: nilai COD harus cocok, idempoten, lalu siap kirim ke Ethix', async () => {
    const lead = await buatLead();
    const c = await http()
      .post('/api/v1/orders', checkout(lead.id, [{ sku: 'BSR-01', qty: 2 }]))
      .expect(201);
    const o = c.body.orders[0];
    const salah = await http()
      .post(`/api/v1/orders/${o.id}/verifikasi`, {
        dikonfirmasi_at: new Date().toISOString(),
        nilai_cod_dikonfirmasi: o.nilai_cod - 1,
      })
      .expect(422);
    expect(salah.body.error.kode).toBe('nilai_cod_tidak_cocok');

    const body = { dikonfirmasi_at: new Date().toISOString(), nilai_cod_dikonfirmasi: o.nilai_cod };
    const v = await http().post(`/api/v1/orders/${o.id}/verifikasi`, body).expect(200);
    cocokKontrak('cs-ai', 'Order', v.body);
    expect(v.body.status).toBe('terverifikasi');
    await http().post(`/api/v1/orders/${o.id}/verifikasi`, body).expect(200);

    const siap = await ctx.http().get('/api/v1/ethix/orders').set('X-Api-Key', ethix).expect(200);
    cocokDaftar('ethix', 'OrderEthix', siap.body);
    expect(siap.body.data).toHaveLength(1);
    expect(siap.body.data[0]).toMatchObject({
      order_nomor: o.nomor,
      status: 'siap_kirim',
      items: [{ sku: 'BSR-01', qty: 2 }],
      berat_gram: 500,
      nilai_cod: o.nilai_cod,
    });
  });

  it('pelanggan dengan riwayat RTS wajib diverifikasi CS manusia', async () => {
    const lead = await buatLead();
    await ctx.prisma.customer.updateMany({ data: { tandaRts: true } });
    const c = await http()
      .post('/api/v1/orders', checkout(lead.id, [{ sku: 'BSR-01', qty: 1 }]))
      .expect(201);
    const o = c.body.orders[0];
    expect(o.perlu_verifikasi_manusia).toBe(true);
    const res = await http()
      .post(`/api/v1/orders/${o.id}/verifikasi`, {
        dikonfirmasi_at: new Date().toISOString(),
        nilai_cod_dikonfirmasi: o.nilai_cod,
      })
      .expect(422);
    expect(res.body.error.kode).toBe('perlu_verifikasi_manusia');
  });

  it('GET /orders/{id} membawa resi setelah dikirim', async () => {
    const lead = await buatLead();
    const c = await http()
      .post('/api/v1/orders', checkout(lead.id, [{ sku: 'WUP-01', qty: 1 }]))
      .expect(201);
    const o = c.body.orders[0];
    await http()
      .post(`/api/v1/orders/${o.id}/verifikasi`, {
        dikonfirmasi_at: new Date().toISOString(),
        nilai_cod_dikonfirmasi: o.nilai_cod,
      })
      .expect(200);
    await eventEthix(ctx, ethix, o.nomor, 'diterima_gudang', { ethix_ref: 'ETX-1' });
    await eventEthix(ctx, ethix, o.nomor, 'dikirim', { kurir: 'JNE', resi: 'JNE123' });
    const res = await http().get(`/api/v1/orders/${o.id}`).expect(200);
    cocokKontrak('cs-ai', 'Order', res.body);
    expect(res.body).toMatchObject({
      status: 'dikirim',
      pengiriman: { kurir: 'JNE', resi: 'JNE123' },
    });

    // Webhook ke CS AI diantrekan untuk setiap perubahan status.
    const outbox = await ctx.prisma.integrationEvent.findMany({
      where: { sistem: 'cs_ai', arah: 'keluar' },
      orderBy: { createdAt: 'asc' },
    });
    expect(outbox.map((e) => (e.payload as { data: { status: string } }).data.status)).toEqual([
      'terverifikasi',
      'di_gudang',
      'dikirim',
    ]);
    for (const e of outbox) cocokKontrak('cs-ai', 'EventStatusOrder', e.payload);
  });

  it('API key Ethix tidak bisa memakai endpoint CS AI, user login juga tidak', async () => {
    await ctx.http().get('/api/v1/stock').set('X-Api-Key', ethix).expect(403);
  });
});
