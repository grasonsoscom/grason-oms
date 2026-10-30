import { ROLE, type Role } from '@grason/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waktuPermintaan } from '../src/buat-app';
import {
  buatAppUji,
  buatUser,
  isiStok,
  kunciSistem,
  login,
  loginSebagai,
  resetData,
  type KonteksUji,
} from './bantuan';

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
  await isiStok(ctx, ethix, { 'VVG-01': 30, 'BSR-01': 30, 'KKT-01': 30, 'WUP-01': 30 });
});

const alamat = {
  alamat: 'Jl. Anggrek 3',
  kota: 'Medan',
  provinsi: 'Sumatera Utara',
  kodePos: '20111',
};

async function leadCsAi(externalId: string, noWa = '081311112222') {
  const res = await ctx
    .http()
    .post('/api/v1/leads')
    .set('X-Api-Key', csAi)
    .send({
      external_id: externalId,
      no_wa: noWa,
      nama: 'Rina',
      masuk_at: new Date().toISOString(),
    })
    .expect(201);
  return res.body.id as string;
}

describe('akses dashboard per role', () => {
  const matriks: [string, readonly Role[]][] = [
    ['/api/v1/app/leads', ['orkestrator', 'cs_leader', 'cs', 'pic_iklan']],
    ['/api/v1/app/orders', ['orkestrator', 'finance', 'sales_ops', 'cs_leader', 'cs', 'pic_iklan']],
    ['/api/v1/app/stok', ['orkestrator', 'sales_ops', 'cs_leader', 'cs']],
    ['/api/v1/app/cs', ['orkestrator', 'finance', 'sales_ops', 'cs_leader', 'pic_iklan']],
    ['/api/v1/app/ringkasan', ROLE],
  ];
  for (const [endpoint, boleh] of matriks) {
    for (const role of ROLE) {
      const diizinkan = boleh.includes(role);
      it(`${role} ${diizinkan ? 'boleh' : 'ditolak'} GET ${endpoint}`, async () => {
        const cookie = await loginSebagai(ctx, role);
        const res = await ctx.http().get(endpoint).set('Cookie', cookie);
        expect(res.status).toBe(diizinkan ? 200 : 403);
      });
    }
  }

  it('API key tidak bisa memakai API dashboard', async () => {
    await ctx.http().get('/api/v1/app/orders').set('X-Api-Key', csAi).expect(403);
  });
});

describe('CS manusia', () => {
  it('input lead dan order, pratinjau pemecahan, lalu verifikasi', async () => {
    const cs = await loginSebagai(ctx, 'cs');
    const lead = await ctx
      .http()
      .post('/api/v1/app/leads')
      .set('Cookie', cs)
      .send({ noWa: '0821 3333 4444', nama: 'Dewi', skuDitanya: 'VVG-01' })
      .expect(201);
    expect(lead.body).toMatchObject({ agen: 'cs_manusia', sumber: 'cs_manusia', status: 'baru' });

    const items = [
      { sku: 'VVG-01', qty: 1 },
      { sku: 'WUP-01', qty: 1 },
    ];
    const p = await ctx
      .http()
      .post('/api/v1/app/orders/pratinjau')
      .set('Cookie', cs)
      .send({ metodeBayar: 'cod', items, ongkir: 10_000 })
      .expect(200);
    expect(p.body.orders.map((o: { entitas: string }) => o.entitas)).toEqual(['SSR', 'FHI']);
    expect(p.body.kurang).toEqual([]);

    const o = await ctx
      .http()
      .post('/api/v1/app/orders')
      .set('Cookie', cs)
      .send({
        leadId: lead.body.id,
        metodeBayar: 'cod',
        penerima: { nama: 'Dewi', noWa: '082133334444' },
        alamat,
        items,
        ongkir: 10_000,
      })
      .expect(201);
    expect(o.body.orders).toHaveLength(2);

    const daftar = await ctx.http().get('/api/v1/app/orders').set('Cookie', cs).expect(200);
    expect(daftar.body.total).toBe(2);
    const detail = await ctx
      .http()
      .get(`/api/v1/app/orders/${o.body.orders[0].id}`)
      .set('Cookie', cs)
      .expect(200);
    expect(detail.body).toMatchObject({
      agen: 'cs_manusia',
      aksi: { verifikasi: true, batal: false },
    });
    expect(detail.body.penerima.noWa).toBe('6282133334444');
    expect(detail.body.grup).toHaveLength(1);

    await ctx
      .http()
      .post(`/api/v1/app/orders/${o.body.orders[0].id}/verifikasi`)
      .set('Cookie', cs)
      .send({ nilaiCodDikonfirmasi: detail.body.nilaiCod })
      .expect(200);
    const sesudah = await ctx
      .http()
      .get(`/api/v1/app/orders/${o.body.orders[0].id}`)
      .set('Cookie', cs)
      .expect(200);
    expect(sesudah.body.status).toBe('terverifikasi');
    expect(sesudah.body.riwayat.map((r: { ke: string; oleh: string }) => r.ke)).toEqual([
      'baru',
      'terverifikasi',
    ]);
  });

  it('CS hanya melihat lead dan order miliknya', async () => {
    const a = await buatUser(ctx.prisma, 'cs', 'cs-a@uji.local');
    await buatUser(ctx.prisma, 'cs', 'cs-b@uji.local');
    const csA = await login(ctx, 'cs-a@uji.local');
    const csB = await login(ctx, 'cs-b@uji.local');
    const lead = await ctx
      .http()
      .post('/api/v1/app/leads')
      .set('Cookie', csA)
      .send({ noWa: '081277778888' })
      .expect(201);
    expect(lead.body.cs.id).toBe(a.id);

    const b = await ctx.http().get('/api/v1/app/leads').set('Cookie', csB).expect(200);
    expect(b.body.total).toBe(0);
    await ctx.http().get(`/api/v1/app/leads/${lead.body.id}`).set('Cookie', csB).expect(403);
    await ctx
      .http()
      .post('/api/v1/app/orders')
      .set('Cookie', csB)
      .send({
        leadId: lead.body.id,
        metodeBayar: 'transfer',
        penerima: { nama: 'X', noWa: '081277778888' },
        alamat,
        items: [{ sku: 'BSR-01', qty: 1 }],
      })
      .expect(403);
  });

  it('handover: CS Leader membagi lead, CS memverifikasi order pelanggan RTS', async () => {
    const leadId = await leadCsAi('h-1');
    await ctx.prisma.customer.updateMany({ data: { tandaRts: true } });
    await ctx
      .http()
      .patch(`/api/v1/leads/${leadId}`)
      .set('X-Api-Key', csAi)
      .send({ handover: { alasan: 'Minta CS manusia' } })
      .expect(200);
    const checkout = await ctx
      .http()
      .post('/api/v1/orders')
      .set('X-Api-Key', csAi)
      .send({
        external_id: 'co-h-1',
        lead_id: leadId,
        metode_bayar: 'cod',
        penerima: { nama: 'Rina', no_wa: '081311112222' },
        alamat: { alamat: 'Jl. Mawar 1', kota: 'Medan', provinsi: 'Sumatera Utara' },
        items: [{ sku: 'KKT-01', qty: 1 }],
      })
      .expect(201);
    const order = checkout.body.orders[0];

    const leader = await loginSebagai(ctx, 'cs_leader');
    const antrian = await ctx
      .http()
      .get('/api/v1/app/leads?handover=antrian')
      .set('Cookie', leader);
    expect(antrian.body.data.map((l: { id: string }) => l.id)).toEqual([leadId]);
    const ring = await ctx.http().get('/api/v1/app/ringkasan').set('Cookie', leader).expect(200);
    expect(ring.body.tindakan.antrianHandover).toBe(1);
    expect(ring.body.tindakan.perluVerifikasiManusia).toBe(1);

    const cs = await buatUser(ctx.prisma, 'cs', 'cs-h@uji.local');
    const cookieCs = await login(ctx, 'cs-h@uji.local');
    await ctx.http().get(`/api/v1/app/orders/${order.id}`).set('Cookie', cookieCs).expect(403);
    await ctx
      .http()
      .post(`/api/v1/app/leads/${leadId}/bagi`)
      .set('Cookie', leader)
      .send({ csUserId: cs.id })
      .expect(200);

    const d = await ctx
      .http()
      .get(`/api/v1/app/orders/${order.id}`)
      .set('Cookie', cookieCs)
      .expect(200);
    expect(d.body).toMatchObject({ agen: 'cs_manusia', perluVerifikasiManusia: true });
    await ctx
      .http()
      .post(`/api/v1/app/orders/${order.id}/verifikasi`)
      .set('Cookie', cookieCs)
      .send({ nilaiCodDikonfirmasi: order.nilai_cod })
      .expect(200);
  });
});

describe('Sales & Ops', () => {
  async function orderBaru() {
    const leadId = await leadCsAi(`so-${Math.random()}`);
    const c = await ctx
      .http()
      .post('/api/v1/orders')
      .set('X-Api-Key', csAi)
      .send({
        external_id: `co-${Math.random()}`,
        lead_id: leadId,
        metode_bayar: 'cod',
        penerima: { nama: 'Rina', no_wa: '081311112222' },
        alamat: { alamat: 'Jl. Mawar 1', kota: 'Medan', provinsi: 'Sumatera Utara' },
        items: [{ sku: 'BSR-01', qty: 1 }],
      })
      .expect(201);
    return c.body.orders[0] as { id: string; nomor: string };
  }

  it('koreksi alamat dan batal sebelum Ethix menerima order', async () => {
    const o = await orderBaru();
    const ops = await loginSebagai(ctx, 'sales_ops');
    await ctx
      .http()
      .patch(`/api/v1/app/orders/${o.id}/alamat`)
      .set('Cookie', ops)
      .send({ alamat: { alamat: 'Jl. Mawar 10', kota: 'Binjai', provinsi: 'Sumatera Utara' } })
      .expect(200);
    const d = await ctx.http().get(`/api/v1/app/orders/${o.id}`).set('Cookie', ops).expect(200);
    expect(d.body.penerima).toMatchObject({ alamat: 'Jl. Mawar 10', kota: 'Binjai' });

    await ctx
      .http()
      .post(`/api/v1/app/orders/${o.id}/batal`)
      .set('Cookie', ops)
      .send({ alasan: 'Duplikat' })
      .expect(200);
    const b = await ctx.http().get(`/api/v1/app/orders/${o.id}`).set('Cookie', ops).expect(200);
    expect(b.body).toMatchObject({ status: 'batal', alasanBatal: 'Duplikat' });

    const lagi = await ctx
      .http()
      .post(`/api/v1/app/orders/${o.id}/batal`)
      .set('Cookie', ops)
      .send({ alasan: 'Lagi' })
      .expect(409);
    expect(lagi.body.error.kode).toBe('tidak_bisa_dibatalkan');
  });

  it('Finance melihat order tanpa nomor WA dan alamat', async () => {
    const o = await orderBaru();
    const fin = await loginSebagai(ctx, 'finance');
    const d = await ctx.http().get(`/api/v1/app/orders/${o.id}`).set('Cookie', fin).expect(200);
    expect(d.body.penerima.noWa).toBe('62813****2222');
    expect(d.body.penerima.alamat).toBe('[disamarkan]');
    expect(d.body.penerima.kota).toBe('Medan');
    expect(d.body.aksi).toEqual({ verifikasi: false, batal: false, koreksiAlamat: false });
  });

  it('filter daftar order per status, produk, dan CS AI', async () => {
    await orderBaru();
    const ops = await loginSebagai(ctx, 'sales_ops');
    const bsr = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'BSR-01' } });
    const vvg = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'VVG-01' } });
    const q = (s: string) => ctx.http().get(`/api/v1/app/orders?${s}`).set('Cookie', ops);
    expect((await q(`produk=${bsr.id}`)).body.total).toBe(1);
    expect((await q(`produk=${vvg.id}`)).body.total).toBe(0);
    expect((await q('status=baru,terverifikasi')).body.total).toBe(1);
    expect((await q('status=dikirim')).body.total).toBe(0);
    expect((await q('cs=cs_ai')).body.total).toBe(1);
    expect((await q('status=selesai')).status).toBe(400);
  });
});

describe('X-Sim-Waktu', () => {
  it('hanya berlaku di mode demo dan tidak boleh di masa depan', () => {
    const sekarang = new Date('2026-10-29T10:00:00Z');
    const lalu = '2026-10-25T03:00:00Z';
    expect(waktuPermintaan(lalu, false, sekarang)).toBe(sekarang);
    expect(waktuPermintaan(lalu, true, sekarang).toISOString()).toBe('2026-10-25T03:00:00.000Z');
    expect(waktuPermintaan('2026-11-01T00:00:00Z', true, sekarang)).toBe(sekarang);
    expect(waktuPermintaan('bukan-waktu', true, sekarang)).toBe(sekarang);
  });
});
