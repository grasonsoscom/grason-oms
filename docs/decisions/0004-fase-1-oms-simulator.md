# 0004 – Fase 1: OMS dan simulator

Tanggal: 2026-10-29 · Status: disetujui (rencana Fase 1, bagian B)

## Konteks

Target Fase 1: tim GRASON bisa mencoba OMS dengan data dummy. Modul lead, order (termasuk
pemecahan checkout campur SSR/FHI), verifikasi COD, alur status sampai terkirim/RTS, stok
tersedia, dashboard web, simulator, `pnpm demo:reset`, dan akun demo per role. OMS tidak
memegang uang ([0003](0003-oms-tanpa-uang.md)).

## Keputusan

### Alur status

- Tabel transisi tunggal di `packages/shared/src/alur-status.ts`; API dan web memakainya.
  Semua perubahan status lewat `StatusService.ubah`, yang mencatat `order_status_history`.
- Transisi: baru → terverifikasi | batal; terverifikasi → di_gudang | dikirim | batal;
  di_gudang → dikirim; dikirim → terkirim | rts. Status akhir: terkirim, batal, rts.
- Batal hanya dari baru/terverifikasi. Batal dari di_gudang butuh API pembatalan Ethix
  (Fase 3).
- Event Ethix hanya memajukan status dan boleh melompat (mis. `dikirim` sebelum
  `diterima_gudang`). Event yang sudah terlewati diabaikan; event mustahil atau untuk order
  batal ditolak per event. Semua tercatat di `integration_events`, idempoten di `event_id`.
- `dikemas`, `gagal_antar`, dan `diterima_kembali` dicatat sebagai baris riwayat dengan
  status sama (dari = ke) beserta catatan.
- RTS membuat baris `returns` (unik per order + jenis) dan menandai pelanggan `tanda_rts`.
  Order berikutnya dari pelanggan itu `perlu_verifikasi_manusia`; CS AI ditolak 422.

### Pemecahan checkout campur

- Satu checkout = satu `order_groups` dengan 1–2 order (SSR dulu, lalu FHI).
- Diskon dibagi sebanding subtotal, ongkir sebanding berat, dengan metode sisa terbesar
  sehingga jumlahnya selalu tepat. Nilai COD = subtotal − diskon + ongkir; 0 untuk transfer.
- `orders.external_id = <external_id checkout>:<entitas>`, jadi aturan (sumber,
  external_id) tetap berlaku di level order.
- Nomor order `GRS-YYYYMMDD-NNNN` per tanggal WIB, dari tabel `order_number_counters`
  (upsert atomik).

### Stok

- Tersedia per komponen = snapshot Ethix terbaru − qty komponen di order berstatus baru,
  terverifikasi, atau di_gudang. Asumsi sampai Ethix menjawab soal alokasi: stok Ethix baru
  berkurang saat barang dikirim. Aturannya satu konstanta, `STATUS_PEGANG_STOK`.
- Paket = min(tersedia komponen ÷ isi), dibulatkan ke bawah. Pengecekan stok seluruh
  checkout dilakukan di level komponen, di dalam transaksi dengan satu advisory lock,
  supaya dua checkout bersamaan tidak memakai stok yang sama.
- Hari cover memakai qty yang mencapai status dikirim dalam 7 hari terakhir.

### API

- Endpoint kontrak (`cs-ai.v1`, `ethix.v1`) hanya untuk API key dan memakai snake_case.
  Respons divalidasi terhadap file OpenAPI di tes (`apps/api/test/kontrak.ts`, ajv).
- Dashboard memakai `/api/v1/app/*` dengan sesi login dan camelCase. CS hanya melihat lead
  miliknya dan order miliknya atau dari lead yang dibagi kepadanya. Nomor WA dan alamat
  disamarkan untuk role tanpa `pelanggan.pii.lihat`.
- CS Leader membagi lead; order lead yang masih baru ikut pindah ke CS tujuan supaya bisa
  diverifikasi (termasuk order pelanggan bertanda RTS).
- Webhook `order.status_changed` ke CS AI di Fase 1 hanya dicatat sebagai outbox di
  `integration_events` (arah keluar), sesuai payload kontrak. Pengiriman nyata dengan HMAC
  dan retry dibangun di Fase 3.
- OMS belum memanggil sistem luar: order terverifikasi tersedia lewat polling
  `GET /ethix/orders`. Push ke Ethix menyusul di Fase 3.

### Simulator dan demo

- `packages/simulator` hanya memanggil API OMS: CS AI dan Ethix palsu memakai API key dan
  endpoint kontrak; CS manusia palsu login dan memakai API dashboard yang sama dengan web.
  Tipe request/response dibuat dari OpenAPI (`openapi-typescript`); tes gagal bila tipe
  tertinggal dari file kontrak.
- Data 7 hari ke belakang: header `X-Sim-Waktu` menjadi "sekarang" untuk satu permintaan,
  hanya bila `DEMO_MODE=true` dan tidak di masa depan. `DEMO_MODE` ditolak di produksi.
  Langkah yang jatuh setelah sekarang tidak dijalankan, jadi sebagian order masih di tengah
  jalan seperti data sungguhan.
- Simulator deterministik per `--seed`. Mode `--langsung` berjalan dengan jam nyata dan
  durasi dipercepat untuk percobaan seminggu.
- `pnpm demo:reset` hanya jalan dengan `DEMO_MODE=true` dan `DEMO_PASSWORD`; mengosongkan
  tabel transaksi, menghapus user `*@demo.grason.local` dan API key `Simulator …`, membuat
  ulang 8 akun demo (6 role, 3 di antaranya CS), menulis API key simulator ke
  `.demo/kunci-simulator.json` (gitignored), lalu menjalankan simulator bila API hidup.
  User dan API key lain tidak disentuh.
- Order baru yang belum diverifikasi lebih dari 24 jam hanya ditandai di daftar; tidak ada
  pembatalan otomatis di Fase 1.

### Ringkasan (tambahan 2026-10-30)

- Periode Hari ini, Kemarin, 7 hari, Bulan ini (WIB). Pembanding = periode sebelumnya
  dengan panjang yang sama: hari ini sampai jam sekarang vs kemarin sampai jam yang sama;
  bulan ini vs bulan lalu sampai tanggal dan jam yang sama, tidak melewati akhir bulan.
- Angka periode (lead masuk, order dibuat, order terkirim, GMV terkirim) memakai
  perbandingan. Kartu tindakan (lead belum direspon, antrian handover, verifikasi, SLA resi)
  dan posisi order aktif adalah keadaan saat ini, jadi tidak dibandingkan dan tidak
  bergantung periode.
- SLA resi dipecah kuning (lewat 18 jam, belum 24 jam) dan merah (lewat 24 jam); daftar
  order memakai filter yang sama (`sla=kuning|merah|terlambat`).
- Filter produk: lead menurut produk yang ditanyakan; order yang memuat produk itu,
  langsung atau di dalam paket; stok produk itu.

## Belum dikerjakan (fase berikutnya)

- Webhook nyata ke SaaS CS AI dan push order ke Ethix (Fase 3).
- Spend iklan di simulator, ROAS, funnel, analisis RTS, dan kinerja CS (Fase 2).
- Tindak lanjut RTS oleh Sales & Ops dan ekspor per entitas.
