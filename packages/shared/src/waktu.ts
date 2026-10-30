import { ZONA_WAKTU_TAMPIL } from './uang';

const formatTanggalWib = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_WAKTU_TAMPIL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Tanggal kalender WIB, format YYYY-MM-DD. */
export function tanggalWib(waktu: Date): string {
  return formatTanggalWib.format(waktu);
}

/** Awal hari WIB (00.00 WIB) dalam UTC. WIB tidak punya DST: selalu UTC+7. */
export function awalHariWib(waktu: Date): Date {
  return new Date(`${tanggalWib(waktu)}T00:00:00+07:00`);
}

/** GRS-20261028-0001: tanggal WIB + nomor urut harian. */
export function nomorOrder(waktu: Date, urut: number): string {
  return `GRS-${tanggalWib(waktu).replaceAll('-', '')}-${String(urut).padStart(4, '0')}`;
}

/** SLA resi (blueprint: Pengiriman & RTS): kuning lewat 18 jam, merah lewat 24 jam. */
export const SLA_RESI_JAM = { kuning: 18, merah: 24 } as const;

export type TandaSla = 'aman' | 'kuning' | 'merah';

export function tandaSlaResi(terverifikasiAt: Date, sekarang: Date): TandaSla {
  const jam = (sekarang.getTime() - terverifikasiAt.getTime()) / 3_600_000;
  if (jam > SLA_RESI_JAM.merah) return 'merah';
  if (jam > SLA_RESI_JAM.kuning) return 'kuning';
  return 'aman';
}

/** Order baru yang belum diverifikasi lewat batas ini ditandai di daftar (keputusan 0004). */
export const BATAS_UMUR_BARU_JAM = 24;
