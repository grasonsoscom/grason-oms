import { describe, expect, it } from 'vitest';
import { GalatCheckout, hitungTotal, pecahCheckout, type ItemCheckout } from '../src';

// Rincian harga COD dari GrasOn AI Chat (cs-ai.v2, keputusan 0006).

const vvg: ItemCheckout = {
  productId: 'vvg',
  sku: 'VVG-01',
  entitas: 'SSR',
  qty: 2,
  hargaSatuan: 42_000,
  beratGram: 250,
};
const bsr: ItemCheckout = {
  productId: 'bsr',
  sku: 'BSR-01',
  entitas: 'FHI',
  qty: 1,
  hargaSatuan: 95_000,
  beratGram: 250,
};

describe('pecahCheckout dengan rincian COD', () => {
  it('satu entitas: total = subtotal − diskon + ongkir − subsidi ongkir + biaya COD − subsidi admin', () => {
    // Contoh AI Chat: harga 95.000, ongkir 30.000, NC Jawa → subsidi ongkir 25.000,
    // biaya COD 3% × 125.000 = 3.750, subsidi admin min(5.000, 3.750).
    const [o] = pecahCheckout({
      items: [bsr],
      metodeBayar: 'cod',
      diskon: 0,
      ongkir: 30_000,
      subsidiOngkir: 25_000,
      biayaCod: 3750,
      subsidiAdminCod: 3750,
    });
    expect(o).toMatchObject({
      subtotal: 95_000,
      ongkir: 30_000,
      subsidiOngkir: 25_000,
      biayaCod: 3750,
      subsidiAdminCod: 3750,
      total: 100_000,
      nilaiCod: 100_000,
    });
  });

  it('checkout campur: jumlah tiap pos tepat dan subsidi tidak melebihi posnya di order mana pun', () => {
    const hasil = pecahCheckout({
      items: [bsr, vvg],
      metodeBayar: 'cod',
      diskon: 10_000,
      ongkir: 20_001,
      subsidiOngkir: 19_999,
      biayaCod: 5_701,
      subsidiAdminCod: 5_000,
    });
    const jumlah = (k: 'subsidiOngkir' | 'biayaCod' | 'subsidiAdminCod') =>
      hasil.reduce((a, o) => a + o[k], 0);
    expect(jumlah('subsidiOngkir')).toBe(19_999);
    expect(jumlah('biayaCod')).toBe(5_701);
    expect(jumlah('subsidiAdminCod')).toBe(5_000);
    for (const o of hasil) {
      expect(o.subsidiOngkir).toBeLessThanOrEqual(o.ongkir);
      expect(o.subsidiAdminCod).toBeLessThanOrEqual(o.biayaCod);
      expect(o.total).toBe(hitungTotal(o));
      expect(o.nilaiCod).toBe(o.total);
    }
    expect(hasil.reduce((a, o) => a + o.total, 0)).toBe(
      179_000 - 10_000 + 20_001 - 19_999 + 5_701 - 5_000,
    );
  });

  it('tanpa rincian sama dengan cs-ai.v1', () => {
    const [o] = pecahCheckout({ items: [bsr], metodeBayar: 'cod', diskon: 5000, ongkir: 9000 });
    expect(o).toMatchObject({ subsidiOngkir: 0, biayaCod: 0, subsidiAdminCod: 0, total: 99_000 });
  });

  it('menolak rincian yang tidak masuk akal', () => {
    const coba =
      (r: object, metodeBayar: 'cod' | 'transfer' = 'cod') =>
      () =>
        pecahCheckout({ items: [bsr], metodeBayar, diskon: 0, ongkir: 10_000, ...r });
    expect(coba({ subsidiOngkir: 10_001 })).toThrow('Subsidi ongkir melebihi ongkir');
    expect(coba({ biayaCod: 3000, subsidiAdminCod: 3001 })).toThrow('Subsidi admin COD');
    expect(coba({ biayaCod: 3000 }, 'transfer')).toThrow('Biaya COD hanya untuk order COD');
    expect(coba({ subsidiAdminCod: 1 }, 'transfer')).toThrow(GalatCheckout);
    // Subsidi ongkir boleh untuk transfer (promo ongkir tidak terikat COD).
    expect(coba({ subsidiOngkir: 5000 }, 'transfer')()[0]).toMatchObject({
      total: 100_000,
      nilaiCod: 0,
    });
  });
});
