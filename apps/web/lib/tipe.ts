import type {
  Agen,
  Entitas,
  LeadStatus,
  MetodeBayar,
  OrderStatus,
  Periode,
  StatusCover,
  TandaSla,
  TipeProduk,
} from '@grason/shared';

// Bentuk respons API dashboard (/api/v1/app/*). Waktu = string ISO UTC.

export interface Daftar<T> {
  total: number;
  halaman: number;
  per: number;
  data: T[];
}

export interface Orang {
  id: string;
  nama: string;
}

export interface BarisLead {
  id: string;
  masukAt: string;
  nama: string | null;
  noWa: string;
  tandaRts: boolean;
  status: LeadStatus;
  agen: Agen;
  handover: boolean;
  cs: Orang | null;
  produkDitanya: string | null;
  kanal: string | null;
  adId: string | null;
  responMenit: number | null;
  jumlahOrder: number;
}

export interface Alamat {
  alamat: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kota: string | null;
  provinsi: string | null;
  kodePos: string | null;
}

export interface DetailLead {
  id: string;
  sumber: string;
  externalId: string | null;
  agen: Agen;
  status: LeadStatus;
  handover: boolean;
  handoverAt: string | null;
  handoverAlasan: string | null;
  masukAt: string;
  responPertamaAt: string | null;
  kanal: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  catatan: string | null;
  produkDitanya: { sku: string; nama: string } | null;
  cs: Orang | null;
  pelanggan: Alamat & { nama: string | null; noWa: string; tandaRts: boolean };
  orders?: { id: string; nomor: string; entitas: Entitas; status: OrderStatus; total: number }[];
}

export interface BarisOrder {
  id: string;
  nomor: string;
  orderGroupId: string;
  dibuatAt: string;
  status: OrderStatus;
  entitas: Entitas;
  metodeBayar: MetodeBayar;
  total: number;
  nilaiCod: number;
  agen: Agen;
  cs: Orang | null;
  penerimaNama: string;
  kota: string;
  items: { sku: string; qty: number }[];
  perluVerifikasiManusia: boolean;
  sla: TandaSla | null;
  tertahan: boolean;
}

export interface DetailOrder {
  id: string;
  nomor: string;
  status: OrderStatus;
  entitas: Entitas;
  sumber: string;
  agen: Agen;
  cs: Orang | null;
  metodeBayar: MetodeBayar;
  subtotal: number;
  diskon: number;
  ongkir: number;
  total: number;
  nilaiCod: number;
  perluVerifikasiManusia: boolean;
  pelangganTandaRts: boolean;
  catatan: string | null;
  alasanBatal: string | null;
  ethixRef: string | null;
  dibuatAt: string;
  terverifikasiAt: string | null;
  terkirimAt: string | null;
  dibatalkanAt: string | null;
  sla: TandaSla | null;
  penerima: Alamat & { nama: string; noWa: string };
  items: {
    sku: string;
    nama: string;
    tipe: TipeProduk;
    qty: number;
    hargaSatuan: number;
    subtotal: number;
  }[];
  pengiriman: {
    kurir: string;
    resi: string;
    statusKurir: string | null;
    percobaanAntar: number;
    dikirimAt: string | null;
    diterimaAt: string | null;
  }[];
  retur: {
    jenis: string;
    alasan: string;
    kondisiBarang: string | null;
    ongkirBalik: number;
    diterimaGudangAt: string | null;
  }[];
  lead: {
    id: string;
    status: LeadStatus;
    agen: Agen;
    adId: string | null;
    campaignId: string | null;
  } | null;
  grup: { id: string; nomor: string; entitas: Entitas; status: OrderStatus; total: number }[];
  riwayat: {
    dari: OrderStatus | null;
    ke: OrderStatus;
    waktu: string;
    catatan: string | null;
    oleh: string;
  }[];
  aksi: { verifikasi: boolean; batal: boolean; koreksiAlamat: boolean };
}

export interface Stok {
  productId: string;
  sku: string;
  nama: string;
  tipe: TipeProduk;
  entitas: Entitas;
  stokEthix: number | null;
  dipesan: number;
  tersedia: number;
  terjual7Hari: number;
  hariCover: number | null;
  status: StatusCover;
  diperbaruiAt: string | null;
}

export interface Produk {
  id: string;
  sku: string;
  nama: string;
  tipe: TipeProduk;
  entitas: Entitas;
  hargaJual: number;
}

export interface Banding {
  nilai: number;
  sebelumnya: number;
}

export type StatusAktif = 'baru' | 'terverifikasi' | 'di_gudang' | 'dikirim';

export interface Ringkasan {
  waktu: string;
  periode: {
    kode: Periode;
    label: string;
    labelSebelumnya: string;
    dari: string;
    sampai: string;
    leadMasuk: Banding | null;
    orderDibuat: Banding | null;
    orderTerkirim: Banding | null;
    gmvTerkirim: Banding | null;
  };
  tindakan: {
    leadBelumDirespon: { jumlah: number; umurTerlamaMenit: number | null } | null;
    antrianHandover: number | null;
    menungguVerifikasi: number | null;
    perluVerifikasiManusia: number | null;
    resiKuning: number | null;
    resiMerah: number | null;
  };
  posisi: Record<StatusAktif, number> | null;
  stok:
    | {
        sku: string;
        nama: string;
        tersedia: number;
        hariCover: number | null;
        status: StatusCover;
      }[]
    | null;
}

export interface PecahanPratinjau {
  entitas: Entitas;
  items: { sku: string; qty: number; hargaSatuan: number; subtotal: number }[];
  subtotal: number;
  diskon: number;
  ongkir: number;
  total: number;
  nilaiCod: number;
  beratGram: number;
}
