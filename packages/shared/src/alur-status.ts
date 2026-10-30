import type { OrderStatus } from './enums';

/**
 * Alur status order (blueprint: Modul & alur; keputusan 0003 dan 0004).
 * Satu-satunya sumber aturan transisi; API dan web sama-sama memakai tabel ini.
 */

export type PemicuTransisi =
  | 'verifikasi' // CS AI / CS manusia
  | 'batal' // Sales & Ops / Orkestrator
  | 'ethix'; // event pengiriman dari WMS Ethix

export const TRANSISI: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  baru: ['terverifikasi', 'batal'],
  terverifikasi: ['di_gudang', 'dikirim', 'batal'],
  di_gudang: ['dikirim'],
  dikirim: ['terkirim', 'rts'],
  terkirim: [],
  batal: [],
  rts: [],
};

export function bolehTransisi(dari: OrderStatus, ke: OrderStatus): boolean {
  return TRANSISI[dari].includes(ke);
}

/** Status akhir: tidak ada transisi keluar. */
export function statusAkhir(status: OrderStatus): boolean {
  return TRANSISI[status].length === 0;
}

/**
 * Batal hanya sebelum Ethix menerima order. Batal dari di_gudang butuh API pembatalan
 * Ethix (Fase 3).
 */
export const STATUS_BOLEH_BATAL: readonly OrderStatus[] = ['baru', 'terverifikasi'];

/** Alamat masih bisa dikoreksi selama order belum diterima Ethix. */
export const STATUS_BOLEH_KOREKSI_ALAMAT: readonly OrderStatus[] = ['baru', 'terverifikasi'];

/**
 * Order yang masih memegang stok: sudah dibuat tapi barangnya belum keluar gudang.
 * Asumsi sampai Ethix menjawab soal alokasi: stok Ethix baru berkurang saat dikirim
 * (keputusan 0004).
 */
export const STATUS_PEGANG_STOK: readonly OrderStatus[] = ['baru', 'terverifikasi', 'di_gudang'];

export const JENIS_EVENT_ETHIX = [
  'diterima_gudang',
  'dikemas',
  'dikirim',
  'terkirim',
  'gagal_antar',
  'rts',
  'diterima_kembali',
] as const;
export type JenisEventEthix = (typeof JENIS_EVENT_ETHIX)[number];

/**
 * Status tujuan tiap event Ethix (kontrak ethix.v1). null = event dicatat tanpa
 * mengubah status (gagal_antar, diterima_kembali). `dikemas` membawa order ke di_gudang
 * bila diterima_gudang terlewat, dan hanya dicatat bila order sudah di gudang.
 */
export const STATUS_DARI_EVENT: Readonly<Record<JenisEventEthix, OrderStatus | null>> = {
  diterima_gudang: 'di_gudang',
  dikemas: 'di_gudang',
  dikirim: 'dikirim',
  terkirim: 'terkirim',
  gagal_antar: null,
  rts: 'rts',
  diterima_kembali: null,
};

/** Status yang wajib sudah dicapai order agar event tanpa perubahan status masuk akal. */
export const STATUS_SYARAT_EVENT: Readonly<
  Record<'gagal_antar' | 'diterima_kembali', readonly OrderStatus[]>
> = {
  gagal_antar: ['dikirim'],
  diterima_kembali: ['rts'],
};

export type HasilEventEthix =
  | { jenis: 'ubah'; ke: OrderStatus }
  | { jenis: 'catat' }
  | { jenis: 'abaikan'; kode: 'status_sudah_lewat' }
  | { jenis: 'tolak'; kode: 'order_batal' | 'transisi_tidak_valid' };

/**
 * Putuskan akibat satu event Ethix pada order berstatus `status`.
 * Event hanya boleh membawa order maju; event yang sudah terlewati diabaikan
 * (urutan kiriman Ethix tidak dijamin), event yang mustahil ditolak.
 */
export function akibatEventEthix(status: OrderStatus, jenis: JenisEventEthix): HasilEventEthix {
  if (status === 'batal') return { jenis: 'tolak', kode: 'order_batal' };

  const ke = STATUS_DARI_EVENT[jenis];
  if (ke === null) {
    const syarat = STATUS_SYARAT_EVENT[jenis as keyof typeof STATUS_SYARAT_EVENT];
    if (syarat.includes(status)) return { jenis: 'catat' };
    return lebihMaju(status, syarat[0]!)
      ? { jenis: 'abaikan', kode: 'status_sudah_lewat' }
      : { jenis: 'tolak', kode: 'transisi_tidak_valid' };
  }
  if (status === ke) {
    return jenis === 'dikemas'
      ? { jenis: 'catat' }
      : { jenis: 'abaikan', kode: 'status_sudah_lewat' };
  }
  if (bolehTransisi(status, ke)) return { jenis: 'ubah', ke };
  if (lebihMaju(status, ke)) return { jenis: 'abaikan', kode: 'status_sudah_lewat' };
  return { jenis: 'tolak', kode: 'transisi_tidak_valid' };
}

/** Urutan jalur maju. terkirim dan rts sama-sama setelah dikirim. */
const PERINGKAT: Readonly<Record<OrderStatus, number>> = {
  baru: 0,
  terverifikasi: 1,
  di_gudang: 2,
  dikirim: 3,
  terkirim: 4,
  rts: 4,
  batal: -1,
};

function lebihMaju(status: OrderStatus, pembanding: OrderStatus): boolean {
  return PERINGKAT[status] > PERINGKAT[pembanding];
}
