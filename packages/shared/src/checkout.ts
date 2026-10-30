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
  total: number;
  nilaiCod: number;
  beratGram: number;
}

export interface Checkout {
  items: readonly ItemCheckout[];
  metodeBayar: MetodeBayar;
  diskon: number;
  ongkir: number;
}

export class GalatCheckout extends Error {
  constructor(
    readonly kode: 'diskon_melebihi_subtotal',
    pesan: string,
  ) {
    super(pesan);
  }
}

/** Urutan tetap: SSR dulu, lalu FHI. */
const URUTAN_ENTITAS: readonly Entitas[] = ['SSR', 'FHI'];

/**
 * Pecah checkout menjadi satu order per entitas (keputusan 0004):
 * - diskon dibagi sebanding subtotal,
 * - ongkir dibagi sebanding berat,
 * - nilai COD = subtotal − diskon + ongkir; 0 untuk transfer.
 * SKU yang sama digabung menjadi satu baris item.
 */
export function pecahCheckout(checkout: Checkout): OrderPecahan[] {
  pastikanRupiah(checkout.diskon);
  pastikanRupiah(checkout.ongkir);

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

  return pecahan.map((p, i) => {
    const total = p.subtotal - diskon[i]! + ongkir[i]!;
    return {
      ...p,
      diskon: diskon[i]!,
      ongkir: ongkir[i]!,
      total,
      nilaiCod: checkout.metodeBayar === 'cod' ? total : 0,
    };
  });
}
