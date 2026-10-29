import type { Sistem } from './enums';

/** Role login tim GRASON (blueprint: Role & hak akses). */
export const ROLE = [
  'orkestrator',
  'finance',
  'sales_ops',
  'cs_leader',
  'cs',
  'pic_iklan',
] as const;
export type Role = (typeof ROLE)[number];

export const ROLE_LABEL: Record<Role, string> = {
  orkestrator: 'Orkestrator',
  finance: 'Finance',
  sales_ops: 'Sales & Operations',
  cs_leader: 'CS Leader',
  cs: 'CS',
  pic_iklan: 'PIC Iklan',
};

/** Izin untuk user login. Dicek dengan decorator @Perlu() di API. */
export const IZIN = [
  'produk.lihat',
  'stok.lihat',
  'lead.lihat_semua',
  'lead.lihat_milik',
  'lead.buat',
  'lead.ubah',
  'lead.bagi',
  'handover.ambil_alih',
  'order.lihat_semua',
  'order.lihat_milik',
  'order.buat',
  'order.verifikasi',
  'order.batal',
  'order.koreksi_alamat',
  'pengiriman.lihat',
  'rts.lihat',
  'rts.tindak_lanjut',
  'ekspor.entitas',
  'iklan.lihat',
  'dashboard_cs.lihat',
  'pelanggan.pii.lihat',
  'user.kelola',
  'apikey.kelola',
  'audit.lihat',
] as const;
export type Izin = (typeof IZIN)[number];

export const IZIN_ROLE: Record<Role, readonly Izin[]> = {
  orkestrator: IZIN,
  // Pencairan COD, HPP, dan profit di luar OMS (keputusan 0003).
  finance: ['produk.lihat', 'order.lihat_semua', 'ekspor.entitas'],
  sales_ops: [
    'produk.lihat',
    'stok.lihat',
    'order.lihat_semua',
    'order.batal',
    'order.koreksi_alamat',
    'pengiriman.lihat',
    'rts.lihat',
    'rts.tindak_lanjut',
    'pelanggan.pii.lihat',
  ],
  cs_leader: [
    'produk.lihat',
    'stok.lihat',
    'lead.lihat_semua',
    'lead.bagi',
    'handover.ambil_alih',
    'order.lihat_semua',
    'dashboard_cs.lihat',
    'pelanggan.pii.lihat',
  ],
  cs: [
    'produk.lihat',
    'stok.lihat',
    'lead.lihat_milik',
    'lead.buat',
    'lead.ubah',
    'order.lihat_milik',
    'order.buat',
    'order.verifikasi',
    'pelanggan.pii.lihat',
  ],
  pic_iklan: ['produk.lihat', 'lead.lihat_semua', 'order.lihat_semua', 'iklan.lihat'],
};

export function punyaIzin(role: Role, izin: Izin): boolean {
  return IZIN_ROLE[role].includes(izin);
}

/** Scope untuk API key sistem luar (blueprint: tabel izin API). */
export const SCOPE = [
  'lead.tulis',
  'order.tulis',
  'order.baca',
  'stok.baca',
  'harga.baca',
  'pengiriman.tulis',
  'stok.tulis',
  'order_ethix.baca',
  'spend_iklan.tulis',
  'performa_iklan.baca',
] as const;
export type Scope = (typeof SCOPE)[number];

export const SCOPE_SISTEM: Record<Sistem, readonly Scope[]> = {
  cs_ai: ['lead.tulis', 'order.tulis', 'order.baca', 'stok.baca', 'harga.baca'],
  ethix: ['pengiriman.tulis', 'stok.tulis', 'order_ethix.baca'],
  adv_ai: ['spend_iklan.tulis', 'performa_iklan.baca'],
};

/** Scope yang diminta harus bagian dari scope sistem tersebut. */
export function scopeValidUntukSistem(sistem: Sistem, scopes: readonly string[]): boolean {
  const izinkan: readonly string[] = SCOPE_SISTEM[sistem];
  return scopes.every((s) => izinkan.includes(s));
}
