import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buatPrismaClient, type PrismaClient } from '@grason/db';
import { kosongkanDatabase, urlDatabaseTes } from '@grason/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  JADWAL_ULANG_MS,
  kirimWebhook,
  sapuOutbox,
  tandaTangan,
  verifikasiTandaTangan,
} from '../src';

const SECRET = 'rahasia-bersama-uji';

/** Server webhook palsu GrasOn AI Chat: menyimpan permintaan dan membalas sesuai `balas`. */
let server: Server;
let url: string;
let diterima: { headers: IncomingMessage['headers']; body: string }[] = [];
let balas: (n: number) => number | 'diam' = () => 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c));
    req.on('end', () => {
      diterima.push({ headers: req.headers, body });
      const kode = balas(diterima.length);
      if (kode === 'diam') return; // tidak pernah membalas
      res.writeHead(kode).end(kode === 200 ? 'ok' : 'tidak');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/oms`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  diterima = [];
  balas = () => 200;
});

describe('tanda tangan', () => {
  it('HMAC-SHA256 dari `<timestamp>.<body>`; penerima menolak tanda tangan salah atau kedaluwarsa', () => {
    const body = '{"a":1}';
    // Vektor uji yang sama dicantumkan di docs/integrasi/cs-ai.md.
    expect(tandaTangan('k', 1793170000, body)).toBe(
      'sha256=cf240dd54798699c0c9fb379a4d91e84b9c06d20bc1d399ba612925dbe60a6b4',
    );
    const sekarang = new Date(1793170000 * 1000);
    const ttd = tandaTangan(SECRET, 1793170000, body);
    const cek = (o: object) =>
      verifikasiTandaTangan({
        secret: SECRET,
        tandaTangan: ttd,
        timestamp: 1793170000,
        body,
        sekarang,
        ...o,
      });
    expect(cek({})).toBe(true);
    expect(cek({ body: '{"a":2}' })).toBe(false);
    expect(cek({ secret: 'lain' })).toBe(false);
    expect(cek({ sekarang: new Date((1793170000 + 301) * 1000) })).toBe(false);
  });
});

describe('kirimWebhook', () => {
  it('mengirim header kontrak dan body yang bisa diverifikasi penerima', async () => {
    const hasil = await kirimWebhook({
      url,
      secret: SECRET,
      eventId: 'b3c1a2d4-0000-4000-8000-000000000001',
      payload: { event_id: 'b3c1a2d4-0000-4000-8000-000000000001', jenis: 'order.status_changed' },
    });
    expect(hasil).toEqual({ ok: true, status: 200 });
    const [r] = diterima;
    expect(r!.headers['idempotency-key']).toBe('b3c1a2d4-0000-4000-8000-000000000001');
    expect(r!.headers['content-type']).toBe('application/json');
    expect(
      verifikasiTandaTangan({
        secret: SECRET,
        tandaTangan: r!.headers['x-oms-signature'] as string,
        timestamp: r!.headers['x-oms-timestamp'] as string,
        body: r!.body,
      }),
    ).toBe(true);
  });

  it('400 tidak diulang; 5xx dan koneksi gagal diulang', async () => {
    const kirim = () => kirimWebhook({ url, secret: SECRET, eventId: 'x', payload: {} });
    balas = () => 400;
    expect(await kirim()).toMatchObject({ ok: false, ulang: false, status: 400 });
    balas = () => 503;
    expect(await kirim()).toMatchObject({ ok: false, ulang: true, status: 503 });
    expect(
      await kirimWebhook({
        url: 'http://127.0.0.1:1/x',
        secret: SECRET,
        eventId: 'x',
        payload: {},
      }),
    ).toMatchObject({ ok: false, ulang: true, status: null });
  });
});

describe('sapuOutbox', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = buatPrismaClient(urlDatabaseTes());
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await kosongkanDatabase(prisma);
  });

  let n = 0;
  async function event() {
    n += 1;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    return prisma.integrationEvent.create({
      data: {
        sistem: 'cs_ai',
        arah: 'keluar',
        jenis: 'order.status_changed',
        idempotencyKey: id,
        payload: { event_id: id, jenis: 'order.status_changed', data: { status: 'terverifikasi' } },
      },
    });
  }

  it('mengirim event tertunda sekali; yang sudah berhasil tidak dikirim lagi', async () => {
    const ev = await event();
    expect(await sapuOutbox(prisma, { url, secret: SECRET })).toEqual({
      berhasil: 1,
      diulang: 0,
      gagal: 0,
    });
    expect(await sapuOutbox(prisma, { url, secret: SECRET })).toEqual({
      berhasil: 0,
      diulang: 0,
      gagal: 0,
    });
    expect(diterima).toHaveLength(1);
    expect(JSON.parse(diterima[0]!.body)).toEqual(ev.payload);
    expect(await prisma.integrationEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject(
      { status: 'berhasil', percobaan: 1, error: null },
    );
  });

  it('gagal sementara dijadwalkan ulang bertahap, berhenti setelah 8 kali ulang', async () => {
    const ev = await event();
    balas = () => 500;
    let jam = new Date('2026-11-01T00:00:00Z').getTime();
    const sekarang = () => new Date(jam);
    for (let i = 0; i < JADWAL_ULANG_MS.length; i += 1) {
      expect((await sapuOutbox(prisma, { url, secret: SECRET, sekarang })).diulang).toBe(1);
      const e = await prisma.integrationEvent.findUniqueOrThrow({ where: { id: ev.id } });
      expect(e.cobaLagiAt!.getTime() - jam).toBe(JADWAL_ULANG_MS[i]);
      // Belum jatuh tempo: tidak dikirim.
      expect((await sapuOutbox(prisma, { url, secret: SECRET, sekarang })).diulang).toBe(0);
      jam = e.cobaLagiAt!.getTime();
    }
    expect((await sapuOutbox(prisma, { url, secret: SECRET, sekarang })).gagal).toBe(1);
    const akhir = await prisma.integrationEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(akhir).toMatchObject({ status: 'gagal', percobaan: 9 });
    expect(akhir.error).toContain('HTTP 500');
    expect(diterima).toHaveLength(9);
  });

  it('400 langsung gagal tanpa diulang', async () => {
    const ev = await event();
    balas = () => 400;
    expect((await sapuOutbox(prisma, { url, secret: SECRET })).gagal).toBe(1);
    expect(await prisma.integrationEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject(
      { status: 'gagal', percobaan: 1 },
    );
  });

  it('event masuk dan sistem lain tidak disentuh; sewa yang habis diambil lagi', async () => {
    await prisma.integrationEvent.create({
      data: {
        sistem: 'ethix',
        arah: 'masuk',
        jenis: 'pengiriman',
        idempotencyKey: 'e-1',
        payload: {},
      },
    });
    const tertahan = await event();
    await prisma.integrationEvent.update({
      where: { id: tertahan.id },
      data: { status: 'diproses', cobaLagiAt: new Date(Date.now() - 1000) },
    });
    expect((await sapuOutbox(prisma, { url, secret: SECRET })).berhasil).toBe(1);
    expect(diterima).toHaveLength(1);
  });
});
