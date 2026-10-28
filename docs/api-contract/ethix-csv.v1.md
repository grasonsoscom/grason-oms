# Format CSV cadangan Ethix – v1

Dipakai bila API Ethix belum siap. Isi dan nama kolom **sama persis** dengan field di
`ethix.v1.yaml`, supaya pindah ke API cukup mengganti cara kirim, bukan datanya.
Status: draft Fase 0, menunggu konfirmasi Ethix.

## Aturan umum

- UTF-8 tanpa BOM, pemisah koma, baris pertama = header, akhir baris `\n`.
- Nilai yang mengandung koma, kutip, atau baris baru diapit kutip ganda (RFC 4180).
- Uang = integer rupiah tanpa titik atau `Rp` (`42000`).
- Waktu = ISO-8601 UTC (`2026-10-28T07:05:00Z`). Tanggal = `YYYY-MM-DD` (WIB).
- Kolom kosong = null.
- Nama file: `<jenis>_<YYYYMMDD>_<HHmm>.csv` dalam WIB, mis. `orders_20261028_1400.csv`.
- Lokasi pertukaran (SFTP/bucket) dan jadwal disepakati dengan Ethix di Fase 0.
- File yang sudah diproses dipindah ke folder `processed/`; idempotensi tetap di
  `order_nomor`, `event_id`, dan `settlement_id`, jadi file yang terproses ulang aman.

## `orders_*.csv` (OMS → Ethix)

Satu baris per item. Order dengan beberapa SKU = beberapa baris dengan `order_nomor`
yang sama; kolom tingkat order diulang di tiap baris.

| Kolom          | Wajib | Contoh                |
| -------------- | ----- | --------------------- |
| order_nomor    | ya    | GRS-20261028-0001     |
| entitas        | ya    | FHI                   |
| metode_bayar   | ya    | cod                   |
| nilai_cod      | ya    | 190000                |
| penerima_nama  | ya    | Siti                  |
| penerima_no_hp | ya    | 6281234567890         |
| alamat         | ya    | Jl. Melati 2 RT 01/02 |
| kelurahan      |       | Sukajadi              |
| kecamatan      |       | Sukajadi              |
| kota           | ya    | Bandung               |
| provinsi       | ya    | Jawa Barat            |
| kode_pos       |       | 40162                 |
| sku            | ya    | BSR-01                |
| qty            | ya    | 2                     |
| berat_gram     | ya    | 500                   |
| catatan        |       |                       |
| dibuat_at      | ya    | 2026-10-28T07:05:00Z  |
| status         | ya    | siap_kirim atau batal |

## `shipment_events_*.csv` (Ethix → OMS)

| Kolom           | Wajib                      | Catatan                                                                         |
| --------------- | -------------------------- | ------------------------------------------------------------------------------- |
| event_id        | ya                         | unik                                                                            |
| order_nomor     | ya                         |                                                                                 |
| ethix_ref       |                            |                                                                                 |
| jenis           | ya                         | diterima_gudang, dikemas, dikirim, terkirim, gagal_antar, rts, diterima_kembali |
| terjadi_at      | ya                         |                                                                                 |
| kurir           | untuk `dikirim`            |                                                                                 |
| resi            | untuk `dikirim`            |                                                                                 |
| status_kurir    |                            |                                                                                 |
| percobaan_antar |                            |                                                                                 |
| alasan          | untuk `gagal_antar`, `rts` |                                                                                 |
| kondisi_barang  |                            | layak_jual, rusak, tidak_lengkap                                                |
| ongkir_balik    |                            |                                                                                 |

## `stock_*.csv` (Ethix → OMS)

| Kolom            | Wajib                                  |
| ---------------- | -------------------------------------- |
| snapshot_at      | ya (sama untuk semua baris dalam file) |
| sku              | ya                                     |
| stok_layak_jual  | ya                                     |
| stok_retur_layak |                                        |
| dialokasikan     |                                        |

## `cod_*.csv` (Ethix → OMS)

| Kolom           | Wajib                                  |
| --------------- | -------------------------------------- |
| laporan_id      | ya (sama untuk semua baris dalam file) |
| settlement_id   | ya                                     |
| resi            | ya                                     |
| order_nomor     |                                        |
| tanggal_cair    | ya                                     |
| nominal_cair    | ya                                     |
| potongan_cod    | ya                                     |
| potongan_ongkir | ya                                     |
