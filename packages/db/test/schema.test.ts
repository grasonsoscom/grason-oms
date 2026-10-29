import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as shared from '@grason/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as db from '../src';
import { kosongkanDatabase, urlDatabaseTes } from '../src/testing';

const prisma = db.buatPrismaClient(urlDatabaseTes());

beforeEach(async () => {
  await kosongkanDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('enum Prisma sama dengan packages/shared', () => {
  it.each([
    ['Entitas', shared.ENTITAS],
    ['OrderStatus', shared.ORDER_STATUS],
    ['LeadStatus', shared.LEAD_STATUS],
    ['MetodeBayar', shared.METODE_BAYAR],
    ['Agen', shared.AGEN],
    ['Sumber', shared.SUMBER],
    ['Sistem', shared.SISTEM],
    ['TipeProduk', shared.TIPE_PRODUK],
    ['JenisReturn', shared.JENIS_RETURN],
    ['ArahIntegrasi', shared.ARAH_INTEGRASI],
    ['StatusIntegrasi', shared.STATUS_INTEGRASI],
    ['TipePelaku', shared.TIPE_PELAKU],
  ] as const)('%s', (nama, nilai) => {
    const prismaEnum = (db as unknown as Record<string, Record<string, string> | undefined>)[nama];
    expect(prismaEnum).toBeDefined();
    expect(Object.values(prismaEnum ?? {})).toEqual([...nilai]);
  });
});

describe('aturan skema', () => {
  const skema = readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

  it('tidak ada kolom Float/Decimal (uang = integer rupiah)', () => {
    expect(skema).not.toMatch(/\s(Float|Decimal)\??\s/);
  });

  it('semua DateTime disimpan sebagai timestamptz atau date', () => {
    const baris = skema.split('\n').filter((b) => /\sDateTime\??\s/.test(b));
    expect(baris.length).toBeGreaterThan(0);
    for (const b of baris) expect(b).toMatch(/@db\.(Timestamptz\(3\)|Date)/);
  });
});

async function buatPelanggan() {
  return prisma.customer.create({ data: { noWa: '6281234567890', nama: 'Uji' } });
}

describe('idempotensi data luar', () => {
  it('lead unik di (sumber, external_id)', async () => {
    const c = await buatPelanggan();
    const data = {
      sumber: 'cs_ai' as const,
      externalId: 'lead-1',
      customerId: c.id,
      agen: 'cs_ai' as const,
      masukAt: new Date(),
    };
    await prisma.lead.create({ data });
    await expect(prisma.lead.create({ data })).rejects.toThrow();
    // Sumber berbeda dengan external_id sama boleh.
    await prisma.lead.create({ data: { ...data, sumber: 'cs_manusia' } });
  });

  it('integration_events unik di (sistem, arah, idempotency_key)', async () => {
    const data = {
      sistem: 'ethix' as const,
      arah: 'masuk' as const,
      jenis: 'shipment.dikirim',
      idempotencyKey: 'evt-1',
      payload: { resi: 'X1' },
    };
    await prisma.integrationEvent.create({ data });
    await expect(prisma.integrationEvent.create({ data })).rejects.toThrow();
  });
});

describe('order group', () => {
  it('satu checkout bisa berisi order SSR dan FHI, tapi tidak dua order entitas yang sama', async () => {
    const c = await buatPelanggan();
    const group = await prisma.orderGroup.create({
      data: { sumber: 'cs_ai', externalId: 'checkout-1', customerId: c.id },
    });
    const dasar = {
      orderGroupId: group.id,
      sumber: 'cs_ai' as const,
      customerId: c.id,
      agen: 'cs_ai' as const,
      metodeBayar: 'cod' as const,
      subtotal: 42_000,
      total: 42_000,
      nilaiCod: 42_000,
      penerimaNama: 'Uji',
      penerimaNoWa: c.noWa,
      alamat: 'Jl. Uji 1',
      kota: 'Bandung',
      provinsi: 'Jawa Barat',
    };
    await prisma.order.create({
      data: { ...dasar, nomor: 'GRS-1', externalId: 'checkout-1:SSR', entitas: 'SSR' },
    });
    await prisma.order.create({
      data: { ...dasar, nomor: 'GRS-2', externalId: 'checkout-1:FHI', entitas: 'FHI' },
    });
    await expect(
      prisma.order.create({
        data: { ...dasar, nomor: 'GRS-3', externalId: 'checkout-1:SSR-b', entitas: 'SSR' },
      }),
    ).rejects.toThrow();

    const hasil = await prisma.orderGroup.findUniqueOrThrow({
      where: { id: group.id },
      include: { orders: true },
    });
    expect(hasil.orders.map((o) => o.entitas).sort()).toEqual(['FHI', 'SSR']);
  });
});

describe('seed', () => {
  it('membuat 4 produk GRASON dengan entitas dan harga yang benar', async () => {
    await db.seed(prisma);
    const satuan = await prisma.product.findMany({
      where: { tipe: 'satuan' },
      orderBy: { nama: 'asc' },
    });
    expect(satuan.map((p) => [p.nama, p.entitas, p.hargaJual])).toEqual([
      ['Bio Serea', 'FHI', 95_000],
      ['Kapsul Kutuk', 'FHI', 220_000],
      ['Vivagoat', 'SSR', 42_000],
      ['Wight Up', 'FHI', 90_000],
    ]);
  });

  it('paket membawa entitas yang sama dengan komponennya', async () => {
    await db.seed(prisma);
    const bundles = await prisma.bundle.findMany({ include: { paket: true, komponen: true } });
    expect(bundles).toHaveLength(db.PRODUK_SATUAN.length * db.ISI_PAKET.length);
    for (const b of bundles) {
      expect(b.paket.entitas).toBe(b.komponen.entitas);
      expect(b.paket.tipe).toBe('paket');
    }
  });

  it('membuat 6 role dan akun Orkestrator; aman dijalankan ulang', async () => {
    const admin = { email: 'Admin@Grason.Local', password: 'rahasia-panjang-123', nama: 'Admin' };
    await db.seed(prisma, { admin });
    await db.seed(prisma, { admin });

    expect(await prisma.role.count()).toBe(6);
    expect(await prisma.user.count()).toBe(1);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@grason.local' },
      include: { role: true },
    });
    expect(user.role.kode).toBe('orkestrator');
    expect(user.passwordHash).not.toContain(admin.password);
    expect(await db.cocokPassword(user.passwordHash, admin.password)).toBe(true);
  });
});
