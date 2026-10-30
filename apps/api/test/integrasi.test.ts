import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { samarkanPayload } from '../src/app/app-integrasi.controller';
import {
  buatAppUji,
  isiStok,
  kunciSistem,
  loginSebagai,
  resetData,
  type KonteksUji,
} from './bantuan';

// Fase 3 (keputusan 0007): log panggilan masuk CS AI, halaman Integrasi, rekonsiliasi.

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
  await isiStok(ctx, await kunciSistem(ctx, 'ethix'), { 'BSR-01': 50 });
});

const post = (url: string, body: object) => ctx.http().post(url).set('X-Api-Key', csAi).send(body);

function lead(externalId = 'chat-1') {
  return post('/api/v2/leads', {
    external_id: externalId,
    no_wa: '+6281234567890',
    masuk_at: new Date().toISOString(),
  });
}

function checkout(leadId: string, total: number) {
  return {
    external_id: 'co-1',
    lead_id: leadId,
    metode_bayar: 'cod',
    penerima: { nama: 'Siti', no_wa: '081234567890' },
    alamat: { alamat: 'Jl. Melati 2', kota: 'Bandung', provinsi: 'Jawa Barat' },
    items: [{ sku: 'BSR-01', qty: 1 }],
    ongkir: 10_000,
    total,
  };
}

describe('log panggilan masuk CS AI', () => {
  it('mencatat berhasil, duplikat, dan ditolak beserta alasannya', async () => {
    const l = (await lead()).body as { id: string };
    await lead().expect(200);
    await post('/api/v2/orders', checkout(l.id, 999)).expect(422);
    await post('/api/v2/orders', checkout(l.id, 105_000)).expect(201);
    await ctx.http().get(`/api/v2/leads/${l.id}`).set('X-Api-Key', csAi).expect(200);

    const ev = await ctx.prisma.integrationEvent.findMany({
      where: { sistem: 'cs_ai', arah: 'masuk' },
      orderBy: { createdAt: 'asc' },
    });
    // GET tidak dicatat.
    expect(ev.map((e) => [e.jenis, e.status, e.externalId])).toEqual([
      ['lead.buat', 'berhasil', 'chat-1'],
      ['lead.buat', 'duplikat', 'chat-1'],
      ['order.buat', 'gagal', 'co-1'],
      ['order.buat', 'berhasil', 'co-1'],
    ]);
    expect(ev[2]!.error).toMatch(/^total_tidak_cocok: /);
    expect(ev[2]!.payload).toMatchObject({ status_http: 422, body: { total: 999 } });
    expect(ev[0]!.apiKeyId).not.toBeNull();
    expect((ev[3]!.payload as { id_oms: string }).id_oms).toBeTruthy();
  });
});

describe('halaman Integrasi', () => {
  it('hanya Orkestrator; daftar bisa difilter', async () => {
    await lead();
    const ops = await loginSebagai(ctx, 'sales_ops');
    await ctx.http().get('/api/v1/app/integrasi').set('Cookie', ops).expect(403);
    const ork = await loginSebagai(ctx, 'orkestrator');
    const res = await ctx
      .http()
      .get('/api/v1/app/integrasi?sistem=cs_ai&arah=masuk')
      .set('Cookie', ork)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ jenis: 'lead.buat', status: 'berhasil' });
    expect(res.body.data[0].apiKey.nama).toBe('Uji cs_ai');
  });

  it('payload disamarkan untuk role tanpa izin PII', () => {
    expect(
      samarkanPayload({
        body: {
          no_wa: '6281234567890',
          penerima: { nama: 'Siti', no_wa: '081234567890' },
          alamat: { alamat: 'Jl. Melati 2', kota: 'Bandung' },
        },
      }),
    ).toEqual({
      body: {
        no_wa: '62812****7890',
        penerima: { nama: 'Siti', no_wa: '08123***7890' },
        alamat: { alamat: '[disamarkan]', kota: 'Bandung' },
      },
    });
  });

  it('rekap per hari dan ekspor CSV untuk rekonsiliasi, tanpa nomor WA', async () => {
    const l = (await lead()).body as { id: string };
    await post('/api/v2/orders', checkout(l.id, 105_000)).expect(201);
    const ork = await loginSebagai(ctx, 'orkestrator');
    const rekap = await ctx
      .http()
      .get('/api/v1/app/integrasi/rekap')
      .set('Cookie', ork)
      .expect(200);
    expect(rekap.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          arah: 'masuk',
          jenis: 'lead.buat',
          status: 'berhasil',
          jumlah: 1,
        }),
        expect.objectContaining({ arah: 'masuk', jenis: 'order.buat', jumlah: 1 }),
      ]),
    );

    const csv = await ctx
      .http()
      .get('/api/v1/app/integrasi/ekspor.csv')
      .set('Cookie', ork)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const baris = (csv.text as string).trim().split('\n');
    expect(baris[0]).toBe(
      'jenis,external_id,id_oms,lead_external_id,nomor_order,status,segmen,metode_bayar,total,dibuat_at',
    );
    expect(baris[1]).toMatch(/^lead,chat-1,/);
    expect(baris[2]).toMatch(/^checkout,co-1,[^,]+,chat-1,GRS-\d{8}-0001,baru,,cod,105000,/);
    expect(csv.text).not.toContain('81234567890');
  });

  it('webhook keluar yang gagal bisa dikirim ulang', async () => {
    const e = await ctx.prisma.integrationEvent.create({
      data: {
        sistem: 'cs_ai',
        arah: 'keluar',
        jenis: 'order.status_changed',
        idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
        payload: {},
        status: 'gagal',
        percobaan: 9,
        error: 'HTTP 500',
      },
    });
    const ork = await loginSebagai(ctx, 'orkestrator');
    await ctx
      .http()
      .post(`/api/v1/app/integrasi/${e.id}/kirim-ulang`)
      .set('Cookie', ork)
      .expect(200);
    expect(
      await ctx.prisma.integrationEvent.findUniqueOrThrow({ where: { id: e.id } }),
    ).toMatchObject({ status: 'diterima', percobaan: 0, error: null });
    // Sudah antre lagi: tidak bisa dikirim ulang dua kali.
    await ctx
      .http()
      .post(`/api/v1/app/integrasi/${e.id}/kirim-ulang`)
      .set('Cookie', ork)
      .expect(409);
    expect(await ctx.prisma.auditLog.count({ where: { aksi: 'integrasi.kirim_ulang' } })).toBe(1);
  });
});
