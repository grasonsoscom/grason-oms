import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isiStok, kunciSistem, resetData, buatAppUji, type KonteksUji } from './bantuan';
import { cocokDaftar, cocokKontrak } from './kontrak';

// cs-ai.v2 (/api/v2): rincian harga COD dan segmen mengikuti GrasOn AI Chat (keputusan 0006).

let ctx: KonteksUji;
let csAi: string;

beforeAll(async () => {
  ctx = await buatAppUji();
});

afterAll(async () => {
  await ctx.app.close();
});

beforeEach(async () => {
  await resetData(ctx.prisma);
  csAi = await kunciSistem(ctx, 'cs_ai');
  const ethix = await kunciSistem(ctx, 'ethix');
  await isiStok(ctx, ethix, { 'VVG-01': 50, 'BSR-01': 50, 'KKT-01': 50, 'WUP-01': 50 });
});

const post = (url: string, body: object) => ctx.http().post(url).set('X-Api-Key', csAi).send(body);
const get = (url: string) => ctx.http().get(url).set('X-Api-Key', csAi);

let urut = 0;
async function buatLead(versi: 1 | 2 = 2, tambahan: object = {}) {
  urut += 1;
  const res = await post(`/api/v${versi}/leads`, {
    external_id: `v2-lead-${urut}`,
    no_wa: '+6281234567890',
    nama: 'Siti',
    sku_ditanya: 'BSR-01',
    masuk_at: new Date(Date.now() - 60_000).toISOString(),
    ...tambahan,
  }).expect(201);
  return res.body as { id: string; segmen?: string | null };
}

/** Checkout BSR-01 (95.000) + ongkir 30.000 dengan promo NC Jawa, seperti codQuote AI Chat. */
function checkout(leadId: string, tambahan: object = {}) {
  urut += 1;
  return {
    external_id: `v2-checkout-${urut}`,
    lead_id: leadId,
    metode_bayar: 'cod',
    penerima: { nama: 'Siti', no_wa: '+6281234567890' },
    alamat: { alamat: 'Jl. Melati 2', kota: 'Bandung', provinsi: 'Jawa Barat' },
    items: [{ sku: 'BSR-01', qty: 1 }],
    ongkir: 30_000,
    subsidi_ongkir: 25_000,
    biaya_cod: 3750,
    subsidi_admin_cod: 3750,
    total: 100_000,
    segmen: 'nc',
    ...tambahan,
  };
}

describe('cs-ai.v2', () => {
  it('lead membawa segmen; nomor internasional disimpan 628…', async () => {
    const lead = await buatLead(2, { segmen: 'ro' });
    const res = await get(`/api/v2/leads/${lead.id}`).expect(200);
    cocokKontrak('cs-ai.v2', 'Lead', res.body);
    expect(res.body).toMatchObject({ segmen: 'ro', no_wa: '6281234567890' });
  });

  it('order menyimpan rincian COD; nilai COD = total dari CS AI', async () => {
    const lead = await buatLead();
    const res = await post('/api/v2/orders', checkout(lead.id)).expect(201);
    cocokKontrak('cs-ai.v2', 'Checkout', res.body);
    const [o] = res.body.orders;
    expect(o).toMatchObject({
      subtotal: 95_000,
      ongkir: 30_000,
      subsidi_ongkir: 25_000,
      biaya_cod: 3750,
      subsidi_admin_cod: 3750,
      total: 100_000,
      nilai_cod: 100_000,
      segmen: 'nc',
    });
    // Verifikasi memakai nilai COD yang sama dengan yang disebut CS AI ke pembeli.
    const v = await post(`/api/v2/orders/${o.id}/verifikasi`, {
      dikonfirmasi_at: new Date().toISOString(),
      nilai_cod_dikonfirmasi: 100_000,
    }).expect(200);
    cocokKontrak('cs-ai.v2', 'Order', v.body);
    expect(v.body.status).toBe('terverifikasi');

    const grup = await ctx.prisma.orderGroup.findUniqueOrThrow({ where: { id: o.order_group_id } });
    expect(grup).toMatchObject({ subsidiOngkir: 25_000, biayaCod: 3750, total: 100_000 });
  });

  it('total berbeda dengan hitungan OMS ditolak 422 dengan hitungan OMS', async () => {
    const lead = await buatLead();
    // Harga di AI Chat 99.000, padahal harga aktif OMS 95.000.
    const res = await post('/api/v2/orders', checkout(lead.id, { total: 104_000 })).expect(422);
    expect(res.body.error).toMatchObject({
      kode: 'total_tidak_cocok',
      detail: { total_dikirim: 104_000, total_oms: 100_000, subtotal_oms: 95_000 },
    });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it('rincian tidak masuk akal ditolak; total wajib', async () => {
    const lead = await buatLead();
    const tolak = async (tambahan: object) =>
      (await post('/api/v2/orders', checkout(lead.id, tambahan)).expect(422)).body.error.kode;
    expect(await tolak({ subsidi_ongkir: 30_001, total: 74_999 })).toBe('rincian_tidak_valid');
    expect(
      await tolak({
        metode_bayar: 'transfer',
        subsidi_admin_cod: 0,
        biaya_cod: 3750,
        total: 103_750,
      }),
    ).toBe('rincian_tidak_valid');
    const tanpaTotal: Record<string, unknown> = checkout(lead.id);
    delete tanpaTotal.total;
    await post('/api/v2/orders', tanpaTotal).expect(400);
  });

  it('checkout campur: rincian dibagi per entitas dan jumlahnya tetap', async () => {
    const lead = await buatLead();
    const res = await post(
      '/api/v2/orders',
      checkout(lead.id, {
        items: [
          { sku: 'VVG-01', qty: 1 },
          { sku: 'BSR-01', qty: 1 },
        ],
        // VVG-01 + BSR-01 = 137.000; + 30.000 − 25.000 + 5.010 − 5.000
        biaya_cod: 5010,
        subsidi_admin_cod: 5000,
        total: 142_010,
      }),
    ).expect(201);
    const orders = res.body.orders as Record<string, number>[];
    expect(orders).toHaveLength(2);
    const jumlah = (k: string) => orders.reduce((a, o) => a + o[k]!, 0);
    expect(jumlah('subsidi_ongkir')).toBe(25_000);
    expect(jumlah('biaya_cod')).toBe(5010);
    expect(jumlah('subsidi_admin_cod')).toBe(5000);
    expect(jumlah('nilai_cod')).toBe(142_010);
  });

  it('v1 tidak berubah: tanpa rincian di respons, segmen diabaikan', async () => {
    const lead = await buatLead(1, { segmen: 'ro' });
    expect(lead).not.toHaveProperty('segmen');
    const res = await post('/api/v1/orders', {
      ...checkout(lead.id),
      ongkir: 12_000,
    }).expect(201);
    cocokKontrak('cs-ai', 'Checkout', res.body);
    const [o] = res.body.orders;
    expect(o).not.toHaveProperty('biaya_cod');
    expect(o).not.toHaveProperty('segmen');
    // v1 menghitung tanpa subsidi dan biaya COD meskipun dikirim.
    expect(o).toMatchObject({ total: 107_000, nilai_cod: 107_000 });
    // Order v1 dibaca lewat v2: rincian 0, segmen kosong.
    const v2 = await get(`/api/v2/orders/${o.id}`).expect(200);
    cocokKontrak('cs-ai.v2', 'Order', v2.body);
    expect(v2.body).toMatchObject({ biaya_cod: 0, subsidi_ongkir: 0, segmen: null });
  });

  it('stok dan harga tersedia di v2', async () => {
    cocokDaftar('cs-ai.v2', 'Harga', (await get('/api/v2/prices').expect(200)).body);
    cocokDaftar('cs-ai.v2', 'Stok', (await get('/api/v2/stock').expect(200)).body);
  });

  it('endpoint lain tidak punya v2', async () => {
    await ctx.http().get('/api/v2/health').expect(404);
    await ctx.http().get('/api/v1/health').expect(200);
  });
});
