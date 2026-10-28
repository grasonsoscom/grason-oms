/**
 * Normalisasi nomor WA Indonesia ke format 628xxxxxxxxx.
 * Menerima 08xx, +628xx, 628xx, dan 8xx; spasi, titik, dan tanda hubung diabaikan.
 * Mengembalikan null bila bukan nomor seluler Indonesia yang valid.
 */
export function normalisasiNoWa(input: string): string | null {
  const digit = input.replace(/[\s.\-()]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digit)) return null;

  let nomor: string;
  if (digit.startsWith('62')) nomor = digit;
  else if (digit.startsWith('0')) nomor = `62${digit.slice(1)}`;
  else if (digit.startsWith('8')) nomor = `62${digit}`;
  else return null;

  // 62 + 8 + 8–11 digit
  return /^628\d{7,11}$/.test(nomor) ? nomor : null;
}

/** 6281234567890 → 62812****7890 */
export function samarkanNoWa(noWa: string): string {
  if (noWa.length <= 8) return '*'.repeat(noWa.length);
  return `${noWa.slice(0, 5)}${'*'.repeat(noWa.length - 9)}${noWa.slice(-4)}`;
}

export const ALAMAT_DISAMARKAN = '[disamarkan]';

export interface AlamatPelanggan {
  alamat: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kota: string | null;
  provinsi: string | null;
  kodePos: string | null;
}

/**
 * Samarkan data pribadi untuk role tanpa izin `pelanggan.pii.lihat`.
 * Kota dan provinsi tetap terlihat karena dipakai untuk analisis RTS per kota.
 */
export function samarkanPii<T extends { noWa: string } & Partial<AlamatPelanggan>>(data: T): T {
  return {
    ...data,
    noWa: samarkanNoWa(data.noWa),
    ...('alamat' in data ? { alamat: data.alamat ? ALAMAT_DISAMARKAN : null } : {}),
    ...('kelurahan' in data ? { kelurahan: data.kelurahan ? ALAMAT_DISAMARKAN : null } : {}),
    ...('kodePos' in data ? { kodePos: data.kodePos ? ALAMAT_DISAMARKAN : null } : {}),
  };
}
