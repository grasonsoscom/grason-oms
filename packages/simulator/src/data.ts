import type { Acak } from './acak';

// Data palsu untuk simulator. Semua nama, nomor, dan alamat fiktif.

const NAMA_DEPAN = [
  'Siti',
  'Dewi',
  'Rina',
  'Ayu',
  'Putri',
  'Wulan',
  'Nur',
  'Fitri',
  'Indah',
  'Lestari',
  'Budi',
  'Agus',
  'Andi',
  'Rizki',
  'Dimas',
  'Fajar',
  'Hendra',
  'Joko',
  'Yusuf',
  'Arif',
];
const NAMA_BELAKANG = [
  'Rahayu',
  'Wati',
  'Sari',
  'Lestari',
  'Pratama',
  'Saputra',
  'Hidayat',
  'Nugroho',
  'Kurniawan',
  'Wijaya',
  'Santoso',
  'Hasanah',
  'Permata',
  'Utami',
  'Setiawan',
];
const JALAN = [
  'Jl. Melati',
  'Jl. Kenanga',
  'Jl. Mawar',
  'Jl. Anggrek',
  'Jl. Flamboyan',
  'Jl. Cempaka',
  'Jl. Dahlia',
  'Jl. Merpati',
  'Jl. Kutilang',
  'Jl. Sudirman',
  'Jl. Diponegoro',
  'Jl. Gatot Subroto',
];
export const KOTA: readonly {
  kota: string;
  kecamatan: string;
  provinsi: string;
  kodePos: string;
}[] = [
  { kota: 'Bandung', kecamatan: 'Sukajadi', provinsi: 'Jawa Barat', kodePos: '40162' },
  { kota: 'Bekasi', kecamatan: 'Bekasi Selatan', provinsi: 'Jawa Barat', kodePos: '17141' },
  { kota: 'Bogor', kecamatan: 'Bogor Tengah', provinsi: 'Jawa Barat', kodePos: '16151' },
  { kota: 'Jakarta Timur', kecamatan: 'Duren Sawit', provinsi: 'DKI Jakarta', kodePos: '13440' },
  { kota: 'Jakarta Selatan', kecamatan: 'Tebet', provinsi: 'DKI Jakarta', kodePos: '12430' },
  { kota: 'Surabaya', kecamatan: 'Gubeng', provinsi: 'Jawa Timur', kodePos: '60241' },
  { kota: 'Malang', kecamatan: 'Klojen', provinsi: 'Jawa Timur', kodePos: '65141' },
  { kota: 'Semarang', kecamatan: 'Semarang Tengah', provinsi: 'Jawa Tengah', kodePos: '50241' },
  { kota: 'Yogyakarta', kecamatan: 'Gondokusuman', provinsi: 'DI Yogyakarta', kodePos: '55221' },
  { kota: 'Medan', kecamatan: 'Medan Baru', provinsi: 'Sumatera Utara', kodePos: '20111' },
  { kota: 'Makassar', kecamatan: 'Panakkukang', provinsi: 'Sulawesi Selatan', kodePos: '90111' },
  { kota: 'Palembang', kecamatan: 'Ilir Timur I', provinsi: 'Sumatera Selatan', kodePos: '30111' },
  { kota: 'Denpasar', kecamatan: 'Denpasar Barat', provinsi: 'Bali', kodePos: '80111' },
];

export const KURIR = ['JNE', 'J&T', 'SiCepat', 'AnterAja', 'Ninja Xpress'] as const;

export const ALASAN_GAGAL_ANTAR = [
  'Penerima tidak di tempat',
  'Alamat tidak ditemukan',
  'Nomor tidak bisa dihubungi',
  'Penerima minta dikirim ulang',
] as const;

export const ALASAN_RTS = [
  'COD ditolak penerima',
  'Alamat tidak ditemukan',
  'Penerima tidak bisa dihubungi',
  'Penerima membatalkan pesanan',
] as const;

export const ALASAN_HANDOVER = [
  'Pembeli minta bicara dengan manusia',
  'Pertanyaan kesehatan di luar skrip',
  'Komplain pesanan sebelumnya',
  'Minta harga khusus untuk jumlah banyak',
] as const;

export function namaAcak(a: Acak): string {
  return `${a.pilih(NAMA_DEPAN)} ${a.pilih(NAMA_BELAKANG)}`;
}

/** Nomor 08xx fiktif dengan format bervariasi, seperti input asli. */
export function noWaAcak(a: Acak): string {
  const inti = `8${a.pilih(['12', '13', '21', '22', '52', '53', '57', '77', '78', '95'])}${a.digit(7)}`;
  return a.pilihBobot<string>([
    [`0${inti}`, 6],
    [`+62${inti}`, 2],
    [`62${inti}`, 1],
    [`0${inti.slice(0, 3)}-${inti.slice(3, 7)}-${inti.slice(7)}`, 1],
  ]);
}

export function alamatAcak(a: Acak) {
  const k = a.pilih(KOTA);
  return {
    alamat: `${a.pilih(JALAN)} No. ${a.antara(1, 120)} RT ${String(a.antara(1, 12)).padStart(2, '0')}/${String(a.antara(1, 9)).padStart(2, '0')}`,
    kecamatan: k.kecamatan,
    kota: k.kota,
    provinsi: k.provinsi,
    kode_pos: k.kodePos,
  };
}

/** Iklan palsu per produk: 2 campaign × 2 iklan. ID 18 digit seperti Meta. */
export interface Iklan {
  campaignId: string;
  adsetId: string;
  adId: string;
  sku: string;
}

export function buatIklan(a: Acak, skus: readonly string[]): Iklan[] {
  const hasil: Iklan[] = [];
  for (const sku of skus) {
    for (let c = 0; c < 2; c += 1) {
      const campaignId = `1202${a.digit(14)}`;
      const adsetId = `1203${a.digit(14)}`;
      for (let i = 0; i < 2; i += 1)
        hasil.push({ campaignId, adsetId, adId: `1204${a.digit(14)}`, sku });
    }
  }
  return hasil;
}
