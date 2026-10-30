import type { Entitas, MetodeBayar } from './enums';
import { pastikanRupiah } from './uang';

/**
 * Bagi `total` sebanding `bobot` dengan metode sisa terbesar: hasil selalu integer,
 * jumlahnya tepat `total`. Sisa pembulatan jatuh ke bobot terbesar lebih dulu;
 * seri dipecah menurut urutan masukan supaya hasilnya deterministik.
 */
export function bagiSebanding(total: number, bobot: readonly number[]): number[] {
  pastikanRupiah(total);
  if (bobot.length === 0) return [];
  const jumlahBobot = bobot.reduce((a, b) => a + b, 0);
  if (jumlahBobot <= 0) {
    // Tanpa bobot (mis. semua berat 0): taruh semuanya di bagian pertama.
    return bobot.map((_, i) => (i === 0 ? total : 0));
  }
  const dasar = bobot.map((b) => Math.floor((total * b) / jumlahBobot));
  let sisa = total - dasar.reduce((a, b) => a + b, 0);
  const urutan = bobot
    .map((b, i) => ({ i, pecahan: (total * b) / jumlahBobot - dasar[i]!, b }))
    .sort((x, y) => y.pecahan - x.pecahan || y.b - x.b || x.i - y.i);
  for (const { i } of urutan) {
    if (sisa === 0) break;
    dasar[i]! += 1;
    sisa -= 1;
  }
  return dasar;
}

export interface ItemCheckout {
  productId: string;
  sku: string;
  entitas: Entitas;
  qty: number;
  hargaSatuan: number;
  beratGram: number;
}

export interface OrderPecahan {
  entitas: Entitas;
  items: (ItemCheckout & { subtotal: number })[];
  subtotal: number;
  diskon: number;
  ongkir: number;
  subsidiOngkir: number;
  biayaCod: number;
  subsidiAdminCod: number;
  total: number;
  nilaiCod: number;
  beratGram: number;
}

export interface Checkout {
  items: readonly ItemCheckout[];
  metodeBayar: MetodeBayar;
  diskon: number;
  ongkir: number;
  /** Rincian promo COD dari CS AI (keputusan 0006); default 0. */
  subsidiOngkir?: number;
  biayaCod?: number;
  subsidiAdminCod?: number;
}

export class GalatCheckout extends Error {
  constructor(
    readonly kode: 'diskon_melebihi_subtotal' | 'rincian_tidak_valid',
    pesan: string,
  ) {
    super(pesan);
  }
}

/** Urutan tetap: SSR dulu, lalu FHI. */
const URUTAN_ENTITAS: readonly Entitas[] = ['SSR', 'FHI'];

/** Total yang dibayar pembeli (keputusan 0006). */
export function hitungTotal(r: {
  subtotal: number;
  diskon: number;
  ongkir: number;
  subsidiOngkir: number;
  biayaCod: number;
  subsidiAdminCod: number;
}): number {
  return r.subtotal - r.diskon + r.ongkir - r.subsidiOngkir + r.biayaCod - r.subsidiAdminCod;
}

/**
 * Pecah checkout menjadi satu order per entitas (keputusan 0004 dan 0006):
 * - diskon dibagi sebanding subtotal,
 * - ongkir dibagi sebanding berat; subsidi ongkir sebanding ongkir tiap order,
 * - biaya COD sebanding nilai order sebelum biaya COD; subsidi admin sebanding biaya COD,
 * - total = subtotal − diskon + ongkir − subsidi ongkir + biaya COD − subsidi admin,
 * - nilai COD = total; 0 untuk transfer.
 * Subsidi dibagi sebanding pos yang disubsidi, jadi tidak pernah melebihinya di order mana pun.
 * SKU yang sama digabung menjadi satu baris item.
 */
export function pecahCheckout(checkout: Checkout): OrderPecahan[] {
  const subsidiOngkir = checkout.subsidiOngkir ?? 0;
  const biayaCod = checkout.biayaCod ?? 0;
  const subsidiAdminCod = checkout.subsidiAdminCod ?? 0;
  for (const n of [checkout.diskon, checkout.ongkir, subsidiOngkir, biayaCod, subsidiAdminCod])
    pastikanRupiah(n);
  if (subsidiOngkir > checkout.ongkir) {
    throw new GalatCheckout('rincian_tidak_valid', 'Subsidi ongkir melebihi ongkir');
  }
  if (subsidiAdminCod > biayaCod) {
    throw new GalatCheckout('rincian_tidak_valid', 'Subsidi admin COD melebihi biaya COD');
  }
  if (checkout.metodeBayar !== 'cod' && biayaCod > 0) {
    throw new GalatCheckout('rincian_tidak_valid', 'Biaya COD hanya untuk order COD');
  }

  const perEntitas = new Map<Entitas, Map<string, ItemCheckout>>();
  for (const item of checkout.items) {
    const grup = perEntitas.get(item.entitas) ?? new Map<string, ItemCheckout>();
    const ada = grup.get(item.productId);
    grup.set(item.productId, ada ? { ...ada, qty: ada.qty + item.qty } : { ...item });
    perEntitas.set(item.entitas, grup);
  }

  const pecahan = URUTAN_ENTITAS.filter((e) => perEntitas.has(e)).map((entitas) => {
    const items = [...perEntitas.get(entitas)!.values()].map((i) => ({
      ...i,
      subtotal: pastikanRupiah(i.qty * i.hargaSatuan),
    }));
    return {
      entitas,
      items,
      subtotal: items.reduce((a, i) => a + i.subtotal, 0),
      beratGram: items.reduce((a, i) => a + i.qty * i.beratGram, 0),
    };
  });

  const subtotalTotal = pecahan.reduce((a, p) => a + p.subtotal, 0);
  if (checkout.diskon > subtotalTotal) {
    throw new GalatCheckout('diskon_melebihi_subtotal', 'Diskon melebihi subtotal checkout');
  }

  const diskon = bagiSebanding(
    checkout.diskon,
    pecahan.map((p) => p.subtotal),
  );
  const ongkir = bagiSebanding(
    checkout.ongkir,
    pecahan.map((p) => p.beratGram),
  );
  const subsidi = bagiSebanding(subsidiOngkir, ongkir);
  const cod = bagiSebanding(
    biayaCod,
    pecahan.map((p, i) => p.subtotal - diskon[i]! + ongkir[i]! - subsidi[i]!),
  );
  const subsidiAdmin = bagiSebanding(subsidiAdminCod, cod);

  return pecahan.map((p, i) => {
    const rincian = {
      subtotal: p.subtotal,
      diskon: diskon[i]!,
      ongkir: ongkir[i]!,
      subsidiOngkir: subsidi[i]!,
      biayaCod: cod[i]!,
      subsidiAdminCod: subsidiAdmin[i]!,
    };
    const total = hitungTotal(rincian);
    return {
      ...p,
      ...rincian,
      total,
      nilaiCod: checkout.metodeBayar === 'cod' ? total : 0,
    };
  });
}
