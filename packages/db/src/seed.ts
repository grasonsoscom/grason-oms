import { ROLE, ROLE_LABEL, type Entitas } from '@grason/shared';
import { hashPassword } from './password';
import type { PrismaClient } from './generated/prisma/client';

interface ProdukSatuan {
  sku: string;
  nama: string;
  entitas: Entitas;
  /** Harga jual resmi (keputusan 0001). */
  hargaJual: number;
  /** PLACEHOLDER sampai ada data resmi. */
  beratGram: number;
}

// SKU dan berat adalah PLACEHOLDER; harga jual resmi. HPP di luar OMS (keputusan 0003).
export const PRODUK_SATUAN: readonly ProdukSatuan[] = [
  {
    sku: 'VVG-01',
    nama: 'Vivagoat',
    entitas: 'SSR',
    hargaJual: 42_000,
    beratGram: 250,
  },
  {
    sku: 'BSR-01',
    nama: 'Bio Serea',
    entitas: 'FHI',
    hargaJual: 95_000,
    beratGram: 250,
  },
  {
    sku: 'KKT-01',
    nama: 'Kapsul Kutuk',
    entitas: 'FHI',
    hargaJual: 220_000,
    beratGram: 150,
  },
  {
    sku: 'WUP-01',
    nama: 'Wight Up',
    entitas: 'FHI',
    hargaJual: 90_000,
    beratGram: 250,
  },
];

/** Paket contoh isi 2 dan 3. Harga paket PLACEHOLDER = n × harga satuan. */
export const ISI_PAKET = [2, 3] as const;

export function skuPaket(skuSatuan: string, isi: number): string {
  return `${skuSatuan.replace(/-01$/, '')}-P${isi}`;
}

export interface OpsiSeed {
  admin?: { email: string; password: string; nama: string };
}

/** Seed idempoten: aman dijalankan berulang. */
export async function seed(prisma: PrismaClient, opsi: OpsiSeed = {}): Promise<void> {
  for (const kode of ROLE) {
    await prisma.role.upsert({
      where: { kode },
      update: { nama: ROLE_LABEL[kode] },
      create: { kode, nama: ROLE_LABEL[kode] },
    });
  }

  for (const p of PRODUK_SATUAN) {
    const satuan = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { nama: p.nama, entitas: p.entitas, hargaJual: p.hargaJual },
      create: {
        sku: p.sku,
        nama: p.nama,
        tipe: 'satuan',
        entitas: p.entitas,
        hargaJual: p.hargaJual,
        beratGram: p.beratGram,
      },
    });

    for (const isi of ISI_PAKET) {
      const paket = await prisma.product.upsert({
        where: { sku: skuPaket(p.sku, isi) },
        update: { entitas: p.entitas },
        create: {
          sku: skuPaket(p.sku, isi),
          nama: `${p.nama} Paket isi ${isi}`,
          tipe: 'paket',
          entitas: p.entitas,
          hargaJual: p.hargaJual * isi,
          beratGram: p.beratGram * isi,
        },
      });
      await prisma.bundle.upsert({
        where: {
          bundleProductId_componentProductId: {
            bundleProductId: paket.id,
            componentProductId: satuan.id,
          },
        },
        update: { qty: isi },
        create: { bundleProductId: paket.id, componentProductId: satuan.id, qty: isi },
      });
    }
  }

  if (opsi.admin) {
    const role = await prisma.role.findUniqueOrThrow({ where: { kode: 'orkestrator' } });
    const email = opsi.admin.email.trim().toLowerCase();
    const ada = await prisma.user.findUnique({ where: { email } });
    if (!ada) {
      await prisma.user.create({
        data: {
          email,
          nama: opsi.admin.nama,
          passwordHash: await hashPassword(opsi.admin.password),
          roleId: role.id,
        },
      });
    }
  }
}
