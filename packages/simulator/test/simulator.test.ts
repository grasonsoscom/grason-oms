import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Acak } from '../src/acak';
import { promoCod } from '../src/data';
import { muatGudang, muatKonfigurasi, simpanGudang } from '../src/konfigurasi';
import type { KeadaanGudang } from '../src/simulasi';
import { buatTipeKontrak, SPEK_KONTRAK } from '../src/kontrak/buat';

describe('tipe kontrak', () => {
  it.each(SPEK_KONTRAK)('src/kontrak/%s.ts sesuai docs/api-contract', async (spek) => {
    const tersimpan = readFileSync(path.resolve(__dirname, `../src/kontrak/${spek}.ts`), 'utf8');
    // Gagal di sini: jalankan `pnpm --filter @grason/simulator gen:kontrak`.
    expect(tersimpan).toBe(await buatTipeKontrak(spek));
  });
});

describe('Acak', () => {
  it('seed sama = urutan sama', () => {
    const a = new Acak(42);
    const b = new Acak(42);
    const deretA = Array.from({ length: 5 }, () => a.antara(1, 100));
    expect(Array.from({ length: 5 }, () => b.antara(1, 100))).toEqual(deretA);
    expect(Array.from({ length: 5 }, () => new Acak(43).antara(1, 100))).not.toEqual(deretA);
  });

  it('antara inklusif dan pilihBobot menghormati bobot nol', () => {
    const a = new Acak(1);
    for (let i = 0; i < 200; i += 1) {
      const n = a.antara(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      expect(
        a.pilihBobot([
          ['x', 1],
          ['y', 0],
        ] as const),
      ).toBe('x');
    }
  });
});

describe('konfigurasi', () => {
  it('kunci dari env; akun hanya bila password demo ada', () => {
    const k = muatKonfigurasi({ SIM_CS_AI_KEY: 'gok_a', SIM_ETHIX_KEY: 'gok_b' });
    expect(k.kunci).toEqual({ csAi: 'gok_a', ethix: 'gok_b' });
  });
});

describe('gudang Ethix palsu', () => {
  it('disimpan dan dibaca ulang; versi lain diabaikan', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gudang-'));
    const file = path.join(dir, 'gudang-ethix.json');
    expect(muatGudang(file)).toBeNull();
    const k: KeadaanGudang = {
      versi: 1,
      stok: { 'VVG-01': 12 },
      snapshotTerakhir: 1,
      resi: 3,
      dilihat: ['GRS-20261030-0001'],
      tertunda: [
        {
          waktu: 2,
          event: { order_nomor: 'GRS-20261030-0001', jenis: 'terkirim' },
          stok: { arah: 'keluar', items: [{ sku: 'VVG-01', qty: 1 }] },
        },
      ],
    };
    simpanGudang(k, file);
    expect(muatGudang(file)).toEqual(k);
    writeFileSync(file, JSON.stringify({ ...k, versi: 2 }));
    expect(muatGudang(file)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('promo COD (tiruan GrasOn AI Chat)', () => {
  it('mengikuti codQuote: subsidi ongkir, biaya COD 3%, subsidi admin, minimum order', () => {
    // NC Jawa: 95.000 + 30.000 = 125.000 ≥ 120.000 → subsidi ongkir 25.000, admin 3.750.
    expect(
      promoCod({
        nilaiBarang: 95_000,
        ongkir: 30_000,
        segmen: 'nc',
        provinsi: 'Jawa Barat',
        cod: true,
      }),
    ).toEqual({ subsidiOngkir: 25_000, biayaCod: 3750, subsidiAdminCod: 3750 });
    // RO luar Jawa dengan ongkir 60.000: subsidi maks 50.000.
    expect(
      promoCod({ nilaiBarang: 200_000, ongkir: 60_000, segmen: 'ro', provinsi: 'Bali', cod: true }),
    ).toEqual({ subsidiOngkir: 50_000, biayaCod: 7800, subsidiAdminCod: 5000 });
    // Di bawah minimum: tanpa subsidi, biaya COD tetap.
    expect(
      promoCod({
        nilaiBarang: 42_000,
        ongkir: 10_000,
        segmen: 'nc',
        provinsi: 'DKI Jakarta',
        cod: true,
      }),
    ).toEqual({ subsidiOngkir: 0, biayaCod: 1560, subsidiAdminCod: 0 });
    // Reseller tanpa subsidi ongkir; transfer tanpa promo.
    expect(
      promoCod({
        nilaiBarang: 250_000,
        ongkir: 20_000,
        segmen: 'reseller',
        provinsi: 'Jawa Timur',
        cod: true,
      }).subsidiOngkir,
    ).toBe(0);
    expect(
      promoCod({
        nilaiBarang: 250_000,
        ongkir: 20_000,
        segmen: 'nc',
        provinsi: 'Jawa Timur',
        cod: false,
      }),
    ).toEqual({ subsidiOngkir: 0, biayaCod: 0, subsidiAdminCod: 0 });
  });
});
