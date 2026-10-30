import {
  LEAD_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  tampilkanRupiah,
  tampilkanWaktu,
  type LeadStatus,
  type OrderStatus,
  type StatusCover,
  type TandaSla,
} from '@grason/shared';

export const rupiah = (n: number) => tampilkanRupiah(n);

/** Waktu ISO dari API → tampilan WIB. */
export const waktu = (iso: string | null | undefined) =>
  iso ? tampilkanWaktu(new Date(iso)) : '–';

export const labelStatusOrder = (s: OrderStatus) => ORDER_STATUS_LABEL[s];
export const labelStatusLead = (s: LeadStatus) => LEAD_STATUS_LABEL[s];

export const WARNA_STATUS_ORDER: Record<OrderStatus, string> = {
  baru: 'bg-slate-100 text-slate-700',
  terverifikasi: 'bg-blue-100 text-blue-800',
  di_gudang: 'bg-indigo-100 text-indigo-800',
  dikirim: 'bg-amber-100 text-amber-800',
  terkirim: 'bg-emerald-100 text-emerald-800',
  batal: 'bg-slate-200 text-slate-500',
  rts: 'bg-red-100 text-red-800',
};

export const WARNA_STATUS_LEAD: Record<LeadStatus, string> = {
  baru: 'bg-slate-100 text-slate-700',
  direspon: 'bg-blue-100 text-blue-800',
  follow_up: 'bg-amber-100 text-amber-800',
  closing: 'bg-emerald-100 text-emerald-800',
  gagal: 'bg-slate-200 text-slate-500',
};

export const LABEL_COVER: Record<StatusCover, string> = {
  aman: 'Aman',
  waspada: 'Waspada',
  kritis: 'Kritis',
  habis: 'Habis',
  belum_ada_penjualan: 'Belum ada penjualan',
};

export const WARNA_COVER: Record<StatusCover, string> = {
  aman: 'bg-emerald-100 text-emerald-800',
  waspada: 'bg-amber-100 text-amber-800',
  kritis: 'bg-red-100 text-red-800',
  habis: 'bg-red-600 text-white',
  belum_ada_penjualan: 'bg-slate-100 text-slate-600',
};

export const LABEL_SLA: Record<TandaSla, string> = {
  aman: 'Dalam SLA',
  kuning: 'Resi > 18 jam',
  merah: 'Resi > 24 jam',
};

export const WARNA_SLA: Record<TandaSla, string> = {
  aman: 'bg-emerald-50 text-emerald-700',
  kuning: 'bg-amber-100 text-amber-800',
  merah: 'bg-red-600 text-white',
};

export const LABEL_AGEN = { cs_ai: 'CS AI', cs_manusia: 'CS manusia' } as const;

export const LABEL_KANAL: Record<string, string> = {
  click_to_whatsapp: 'Click-to-WhatsApp',
  landing_page: 'Landing page',
  organik: 'Organik',
  lainnya: 'Lainnya',
};

/** Ringkas item order: "VVG-P2 ×1, BSR-01 ×2". */
export const ringkasItem = (items: { sku: string; qty: number }[]) =>
  items.map((i) => `${i.sku} ×${i.qty}`).join(', ');

/** Query string dari objek filter; nilai kosong dibuang. */
export function queryString(f: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export type Arah = 'naik' | 'turun' | 'sama' | 'baru' | 'kosong';

/** Perubahan terhadap periode sebelumnya, mis. "▲ 25%". */
export function perbandingan(nilai: number, sebelumnya: number): { arah: Arah; teks: string } {
  if (sebelumnya === 0) {
    return nilai === 0 ? { arah: 'kosong', teks: '–' } : { arah: 'baru', teks: 'baru' };
  }
  const persen = Math.round(((nilai - sebelumnya) / sebelumnya) * 100);
  if (persen === 0) return { arah: 'sama', teks: '= 0%' };
  return persen > 0
    ? { arah: 'naik', teks: `▲ ${persen}%` }
    : { arah: 'turun', teks: `▼ ${Math.abs(persen)}%` };
}

/** 200 → "3 jam 20 mnt"; 3000 → "2 hari 2 jam". */
export function umur(menit: number): string {
  if (menit < 60) return `${menit} mnt`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return menit % 60 ? `${jam} jam ${menit % 60} mnt` : `${jam} jam`;
  const hari = Math.floor(jam / 24);
  return jam % 24 ? `${hari} hari ${jam % 24} jam` : `${hari} hari`;
}
