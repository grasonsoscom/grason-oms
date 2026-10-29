# 0003 – OMS tidak memegang uang

Tanggal: 2026-10-29 · Status: disetujui · Menggantikan sebagian [0001](0001-fondasi-fase-0.md)

## Konteks

Blueprint awal menjadikan OMS tempat rekonsiliasi COD cair, HPP, dan profit per order.
Koreksi scope dari Orkestrator: alur uang tetap antara Finance dan Ethix, di luar OMS.
OMS mencatat order dan pengirimannya, bukan uangnya.

## Keputusan

1. **Pencairan COD, HPP, dan profit di luar OMS.** Finance tetap menerima laporan COD cair
   langsung dari Ethix.
2. **Nilai order dan nilai COD tetap disimpan.** `subtotal`, `diskon`, `ongkir`, `total`,
   dan `nilai_cod` dikirim ke Ethix supaya kurir menagih jumlah yang benar, dan dipakai
   untuk GMV.
3. **Status akhir sukses = `terkirim`.** Status `selesai` dihapus. Status OMS menjadi:
   `baru`, `terverifikasi`, `di_gudang`, `dikirim`, `terkirim`, `batal`, `rts`.
4. **GMV terkirim** = total nilai order berstatus `terkirim`, tanpa batal dan RTS.
   Menggantikan GMV cair di performa iklan: ROAS riil = GMV terkirim ÷ spend.
5. **Spend iklan harian tetap disimpan** (`ad_spend_daily`). Itu data iklan untuk ROAS,
   bukan uang yang dipegang OMS.

## Perubahan

- **Skema** (migrasi `20261029120000_oms_tanpa_uang`; migrasi `init` tidak diubah):
  - Enum `OrderStatus` dibuat ulang tanpa `selesai`. Data `selesai` diubah menjadi
    `terkirim` lebih dulu, dan riwayat `terkirim → selesai` yang tidak bermakna dihapus.
  - `orders.selesai_at` diganti nama menjadi `terkirim_at`, lalu diisi dari
    `shipments.diterima_at` bila ada.
  - Tabel `cod_settlements`, `product_costs`, dan `order_costs` dihapus.
- **Izin dan scope:** `cod.lihat`, `cod.rekonsiliasi`, `profit.lihat`, `hpp.ubah`,
  `asumsi_biaya.ubah`, dan scope Ethix `cod.tulis` dihapus. Finance tinggal
  `produk.lihat`, `order.lihat_semua`, dan `ekspor.entitas`.
- **Seed:** tidak lagi membuat HPP placeholder.
- **Kontrak** (ditulis di v1 karena v1 belum dikirim ke tim mana pun):
  - `ethix.v1.yaml`: `POST /ethix/cod-settlements` dan skema `LaporanCod` dihapus, dan
    ada kalimat bahwa pencairan COD tetap antara Ethix dan Finance.
  - `ethix-csv.v1.md`: file `cod_*.csv` dihapus.
  - `adv-ai.v1.yaml`: `gmv_cair` → `gmv_terkirim`, `order_selesai` dihapus,
    `dasar_tanggal=cair` → `terkirim`. Event Purchase diusulkan saat terkirim
    ([0002](0002-waktu-event-purchase-meta.md)).
  - `cs-ai.v1.yaml`: `selesai` dihapus dari `StatusOrder`.
- **Pesan review kontrak:** pertanyaan Ethix soal laporan COD dihapus, dan ada kalimat
  bahwa pencairan COD tetap antara Ethix dan Finance.

## Akibat

- Order COD yang terkirim tetap bisa gagal dibayar (misalnya selisih setoran kurir). OMS
  tidak melihatnya; selisih seperti itu ditangani Finance dengan Ethix.
- GMV dan ROAS di OMS adalah angka operasional berdasarkan paket terkirim, bukan uang
  yang sudah diterima. Finance tetap memegang angka uang per entitas.
- Roadmap Fase 2 di blueprint perlu menyesuaikan: tidak ada rekonsiliasi COD, HPP, atau
  GP per order di OMS.
