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

export const PERIODE = ['hari_ini', 'kemarin', '7_hari', 'bulan_ini'] as const;
export type Periode = (typeof PERIODE)[number];

export const LABEL_PERIODE: Record<Periode, { ini: string; sebelumnya: string }> = {
  hari_ini: { ini: 'Hari ini', sebelumnya: 'kemarin di jam yang sama' },
  kemarin: { ini: 'Kemarin', sebelumnya: 'hari sebelumnya' },
  '7_hari': { ini: '7 hari', sebelumnya: '7 hari sebelumnya' },
  bulan_ini: { ini: 'Bulan ini', sebelumnya: 'bulan lalu di tanggal yang sama' },
};

export interface Rentang {
  /** Inklusif. */
  dari: Date;
  /** Eksklusif. */
  sampai: Date;
}

const HARI_MS = 86_400_000;

/**
 * Rentang periode dalam WIB dan periode pembandingnya dengan panjang yang sama, supaya
 * "hari ini sampai jam 14.00" dibandingkan dengan "kemarin sampai jam 14.00".
 */
export function rentangPeriode(
  periode: Periode,
  sekarang: Date,
): { ini: Rentang; sebelumnya: Rentang } {
  const awalHari = awalHariWib(sekarang).getTime();
  const kini = sekarang.getTime() + 1; // sampai eksklusif: termasuk detik ini
  const geser = (r: Rentang, ms: number): Rentang => ({
    dari: new Date(r.dari.getTime() - ms),
    sampai: new Date(r.sampai.getTime() - ms),
  });
  switch (periode) {
    case 'hari_ini': {
      const ini = { dari: new Date(awalHari), sampai: new Date(kini) };
      return { ini, sebelumnya: geser(ini, HARI_MS) };
    }
    case 'kemarin': {
      const ini = { dari: new Date(awalHari - HARI_MS), sampai: new Date(awalHari) };
      return { ini, sebelumnya: geser(ini, HARI_MS) };
    }
    case '7_hari': {
      const ini = { dari: new Date(awalHari - 6 * HARI_MS), sampai: new Date(kini) };
      return { ini, sebelumnya: geser(ini, 7 * HARI_MS) };
    }
    case 'bulan_ini': {
      const [th, bl] = tanggalWib(sekarang).split('-').map(Number) as [number, number];
      const awalBulan = (t: number, b: number) =>
        new Date(`${t}-${String(b).padStart(2, '0')}-01T00:00:00+07:00`).getTime();
      const awalIni = awalBulan(th, bl);
      const awalLalu = bl === 1 ? awalBulan(th - 1, 12) : awalBulan(th, bl - 1);
      // Bulan lalu sampai tanggal & jam yang sama, tidak melewati akhir bulan lalu.
      const sampaiLalu = Math.min(awalLalu + (kini - awalIni), awalIni);
      return {
        ini: { dari: new Date(awalIni), sampai: new Date(kini) },
        sebelumnya: { dari: new Date(awalLalu), sampai: new Date(sampaiLalu) },
      };
    }
  }
}
