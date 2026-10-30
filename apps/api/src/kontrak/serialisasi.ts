import type { LeadLengkap } from '../leads/leads.service';
import type { OrderEthix } from '../ethix/ethix.service';
import type { OrderLengkap } from '../orders/orders.service';
import type { StokProduk } from '../stok/stok.service';

// Bentuk respons persis seperti docs/api-contract (snake_case). Dites terhadap file
// OpenAPI di test/kontrak.test.ts.

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Hapus key bernilai undefined (field opsional tanpa null di kontrak). */
function rapikan<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function leadKontrak(l: LeadLengkap) {
  return rapikan({
    id: l.id,
    external_id: l.externalId ?? '',
    no_wa: l.customer.noWa,
    nama: l.customer.nama,
    agen: l.agen,
    status: l.status,
    handover: l.handover,
    handover_at: iso(l.handoverAt),
    masuk_at: l.masukAt.toISOString(),
    respon_pertama_at: iso(l.responPertamaAt),
    kanal: l.kanal ?? undefined,
    campaign_id: l.campaignId,
    adset_id: l.adsetId,
    ad_id: l.adId,
  });
}

export function orderKontrak(o: OrderLengkap) {
  const kiriman = o.shipments[0];
  return {
    id: o.id,
    nomor: o.nomor,
    order_group_id: o.orderGroupId,
    external_id: o.externalId,
    lead_id: o.leadId,
    entitas: o.entitas,
    status: o.status,
    metode_bayar: o.metodeBayar,
    perlu_verifikasi_manusia: o.perluVerifikasiManusia,
    subtotal: o.subtotal,
    diskon: o.diskon,
    ongkir: o.ongkir,
    total: o.total,
    nilai_cod: o.nilaiCod,
    items: o.items.map((i) => ({
      sku: i.product.sku,
      nama: i.product.nama,
      qty: i.qty,
      harga_satuan: i.hargaSatuan,
      diskon: i.diskon,
      subtotal: i.subtotal,
    })),
    pengiriman: kiriman
      ? {
          kurir: kiriman.kurir,
          resi: kiriman.resi,
          status_kurir: kiriman.statusKurir,
          percobaan_antar: kiriman.percobaanAntar,
          dikirim_at: iso(kiriman.dikirimAt),
          diterima_at: iso(kiriman.diterimaAt),
        }
      : null,
    dibuat_at: o.createdAt.toISOString(),
    terverifikasi_at: iso(o.terverifikasiAt),
  };
}

export function checkoutKontrak(
  grup: { id: string; externalId: string | null },
  orders: OrderLengkap[],
) {
  return {
    order_group_id: grup.id,
    external_id: grup.externalId ?? '',
    orders: orders.map(orderKontrak),
  };
}

export function stokKontrak(s: StokProduk) {
  return {
    sku: s.sku,
    nama: s.nama,
    tipe: s.tipe,
    tersedia: s.tersedia,
    hari_cover: s.hariCover,
    // Belum pernah ada snapshot: pakai epoch supaya field wajib tetap terisi.
    diperbarui_at: (s.diperbaruiAt ?? new Date(0)).toISOString(),
  };
}

/** Order ke Ethix selalu dalam SKU komponen; paket diurai di sini. */
export function orderEthixKontrak(o: OrderEthix, denganStatus: boolean) {
  const komponen = new Map<string, number>();
  let berat = 0;
  for (const item of o.items) {
    const p = item.product;
    const isi =
      p.tipe === 'paket'
        ? p.bundleItems.map((b) => ({
            sku: b.komponen.sku,
            qty: b.qty,
            berat: b.komponen.beratGram,
          }))
        : [{ sku: p.sku, qty: 1, berat: p.beratGram }];
    for (const k of isi) {
      komponen.set(k.sku, (komponen.get(k.sku) ?? 0) + k.qty * item.qty);
      berat += k.berat * k.qty * item.qty;
    }
  }
  return rapikan({
    order_nomor: o.nomor,
    entitas: o.entitas,
    metode_bayar: o.metodeBayar,
    nilai_cod: o.nilaiCod,
    penerima: { nama: o.penerimaNama, no_hp: o.penerimaNoWa },
    alamat: {
      alamat: o.alamat,
      kelurahan: o.kelurahan,
      kecamatan: o.kecamatan,
      kota: o.kota,
      provinsi: o.provinsi,
      kode_pos: o.kodePos,
    },
    items: [...komponen].map(([sku, qty]) => ({ sku, qty })),
    berat_gram: Math.max(1, berat),
    catatan: o.catatan ? o.catatan.slice(0, 500) : null,
    dibuat_at: o.createdAt.toISOString(),
    status: denganStatus ? (o.status === 'batal' ? 'batal' : 'siap_kirim') : undefined,
  });
}
