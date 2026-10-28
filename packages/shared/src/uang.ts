/** Uang selalu integer rupiah. Menolak pecahan, NaN, dan nilai di luar batas aman. */
export function pastikanRupiah(nilai: number): number {
  if (!Number.isSafeInteger(nilai)) {
    throw new RangeError(`Nilai uang harus integer rupiah, diterima: ${nilai}`);
  }
  return nilai;
}

const formatRupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** 95000 → "Rp 95.000" (non-breaking space diganti spasi biasa agar mudah dites). */
export function tampilkanRupiah(nilai: number): string {
  return formatRupiah.format(pastikanRupiah(nilai)).replace(/\s/g, ' ');
}

export const ZONA_WAKTU_TAMPIL = 'Asia/Jakarta';

/** Tampilkan waktu UTC dalam WIB, mis. "28 Okt 2026, 14.05". */
export function tampilkanWaktu(waktu: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: ZONA_WAKTU_TAMPIL,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(waktu);
}
