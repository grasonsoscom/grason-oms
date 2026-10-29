# 0002 – Waktu pengiriman event Purchase ke Meta

Tanggal: 2026-10-29 · Diperbarui: 2026-10-29 (mengikuti [0003](0003-oms-tanpa-uang.md)) ·
Status: terbuka (menunggu jawaban tim ADV AI, batas 5 November 2026)

## Konteks

Draft awal `GET /ads/purchases` di [adv-ai.v1.yaml](../api-contract/adv-ai.v1.yaml) membuat
event Purchase saat order Selesai, yaitu saat COD cair. Ada dua masalah:

- **Batas 7 hari Meta Conversions API.** Meta menolak event dengan `event_time` lebih dari
  7 hari sebelum waktu kirim, dan jendela atribusi default-nya 7 hari setelah klik iklan.
  Waktu dari klik sampai COD cair sering lebih dari 7 hari.
- **OMS tidak lagi mencatat pencairan COD** ([0003](0003-oms-tanpa-uang.md)). Status
  `selesai` dihapus; status akhir sukses adalah `terkirim`.

Kedua angka 7 hari di atas mengikuti dokumentasi Meta dan perlu dikonfirmasi tim ADV AI
untuk akun dan `action_source` yang dipakai (misalnya click-to-WhatsApp).

## Opsi

| Opsi | Purchase dikirim saat | Kelebihan                                              | Kekurangan                                          |
| ---- | --------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| A    | Terverifikasi         | Paling cepat                                           | Order yang nanti batal atau RTS ikut terhitung dulu |
| B    | Terkirim              | Paket sudah diterima pembeli; sama dengan GMV terkirim | Bergantung kecepatan status kurir dari Ethix        |

**Usulan: opsi B, saat terkirim.** Waktu dari klik sampai paket terkirim umumnya masih di
dalam batas 7 hari. Nilai event = `total` order, sama dengan GMV terkirim di
`GET /ads/performance`, jadi angka di Meta dan OMS bisa dicocokkan. Order RTS tidak pernah
terkirim, sehingga tidak membuat event.

Yang masih perlu dijawab tim ADV AI (pertanyaan 7 di pesan review):

- Apakah opsi B cukup cepat untuk optimasi, atau ADV AI lebih memilih opsi A dengan
  koreksi?
- Bentuk koreksi untuk retur setelah terkirim (event kustom, atau cara lain yang sudah
  dipakai ADV AI). Meta tidak punya cara menarik event Purchase yang sudah terkirim.
- Apakah batas 7 hari berlaku sama untuk iklan click-to-WhatsApp.

## Dampak ke kontrak

`adv-ai.v1.yaml` belum dikirim ke tim ADV AI dan endpoint ini berstatus draft, jadi
usulan dan penandaan keputusan terbuka ditulis langsung di v1: `terjadi_at` = waktu
terkirim, `nilai` = total order. Bila v1 sudah dibagikan saat keputusan diambil,
perubahan berikutnya masuk ke v2.

Terkait: keputusan jalur event (OMS langsung atau lewat ADV AI) masih terbuka di
[0001](0001-fondasi-fase-0.md).
