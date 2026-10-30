// Nilai enum di sini harus sama persis dengan enum di packages/db/prisma/schema.prisma.
// Tes di packages/db memastikan keduanya tidak menyimpang.

export const ENTITAS = ['SSR', 'FHI'] as const;
export type Entitas = (typeof ENTITAS)[number];

export const ORDER_STATUS = [
  'baru',
  'terverifikasi',
  'di_gudang',
  'dikirim',
  'terkirim',
  'batal',
  'rts',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

/** Status akhir sukses. OMS tidak mencatat pencairan COD (keputusan 0003). */
export const STATUS_AKHIR_SUKSES = 'terkirim' satisfies OrderStatus;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  baru: 'Baru',
  terverifikasi: 'Terverifikasi',
  di_gudang: 'Di gudang',
  dikirim: 'Dikirim',
  terkirim: 'Terkirim',
  batal: 'Batal',
  rts: 'RTS',
};

export const LEAD_STATUS = ['baru', 'direspon', 'follow_up', 'closing', 'gagal'] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  baru: 'Baru',
  direspon: 'Direspon',
  follow_up: 'Follow-up',
  closing: 'Closing',
  gagal: 'Gagal',
};

export const METODE_BAYAR = ['cod', 'transfer'] as const;
export type MetodeBayar = (typeof METODE_BAYAR)[number];

/** Segmen pelanggan menurut CS AI (keputusan 0006). nc = new customer, ro = repeat order. */
export const SEGMEN = ['nc', 'ro', 'reseller'] as const;
export type Segmen = (typeof SEGMEN)[number];

/** Siapa yang menangani lead/order. */
export const AGEN = ['cs_ai', 'cs_manusia'] as const;
export type Agen = (typeof AGEN)[number];

/** Asal data. Bersama external_id menjadi kunci idempotensi. */
export const SUMBER = ['cs_ai', 'cs_manusia', 'ethix', 'adv_ai'] as const;
export type Sumber = (typeof SUMBER)[number];

/** Sistem luar yang memakai API key. */
export const SISTEM = ['cs_ai', 'ethix', 'adv_ai'] as const;
export type Sistem = (typeof SISTEM)[number];

export const TIPE_PRODUK = ['satuan', 'paket'] as const;
export type TipeProduk = (typeof TIPE_PRODUK)[number];

export const JENIS_RETURN = ['rts', 'retur'] as const;
export type JenisReturn = (typeof JENIS_RETURN)[number];

export const ARAH_INTEGRASI = ['masuk', 'keluar'] as const;
export type ArahIntegrasi = (typeof ARAH_INTEGRASI)[number];

export const STATUS_INTEGRASI = ['diterima', 'diproses', 'berhasil', 'gagal', 'duplikat'] as const;
export type StatusIntegrasi = (typeof STATUS_INTEGRASI)[number];

/** Pelaku sebuah perubahan (riwayat status, audit). */
export const TIPE_PELAKU = ['user', 'api_key', 'sistem'] as const;
export type TipePelaku = (typeof TIPE_PELAKU)[number];
