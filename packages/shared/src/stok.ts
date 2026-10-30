/**
 * Stok tersedia (blueprint: Stok).
 * Tersedia per komponen = stok Ethix terbaru − qty komponen di order yang masih
 * memegang stok (STATUS_PEGANG_STOK). Paket = min(tersedia komponen ÷ isi), dibulatkan ke bawah.
 */

export interface IsiPaket {
  componentId: string;
  qty: number;
}

export function tersediaKomponen(stokEthix: number, dipesan: number): number {
  return Math.max(0, stokEthix - dipesan);
}

export function tersediaPaket(
  isi: readonly IsiPaket[],
  tersediaPerKomponen: ReadonlyMap<string, number>,
): number {
  if (isi.length === 0) return 0;
  return Math.min(
    ...isi.map((k) => Math.floor((tersediaPerKomponen.get(k.componentId) ?? 0) / k.qty)),
  );
}

/** Hari cover = tersedia ÷ rata-rata terjual per hari. null bila belum ada penjualan. */
export function hariCover(tersedia: number, terjual7Hari: number): number | null {
  if (terjual7Hari <= 0) return null;
  return Math.round((tersedia / (terjual7Hari / 7)) * 10) / 10;
}

export const BATAS_COVER = { waspada: 7, kritis: 4 } as const;

export type StatusCover = 'aman' | 'waspada' | 'kritis' | 'habis' | 'belum_ada_penjualan';

export function statusCover(tersedia: number, cover: number | null): StatusCover {
  if (tersedia <= 0) return 'habis';
  if (cover === null) return 'belum_ada_penjualan';
  if (cover < BATAS_COVER.kritis) return 'kritis';
  if (cover < BATAS_COVER.waspada) return 'waspada';
  return 'aman';
}
