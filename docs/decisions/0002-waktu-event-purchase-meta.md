# 0002 – Waktu pengiriman event Purchase ke Meta

Tanggal: 2026-10-29 · Status: terbuka (menunggu jawaban tim ADV AI, batas 5 November 2026)

## Konteks

Draft `GET /ads/purchases` di [adv-ai.v1.yaml](../api-contract/adv-ai.v1.yaml) membuat satu
event Purchase per order saat order **Selesai**. Untuk order COD, itu berarti saat COD cair
cocok dengan nilai order.

Masalahnya ada pada batas 7 hari Meta Conversions API:

- Meta menolak event dengan `event_time` lebih dari 7 hari sebelum waktu kirim.
- Jendela atribusi default Meta adalah 7 hari setelah klik iklan.

Waktu dari klik iklan sampai COD cair mencakup closing, kirim, antar, dan pencairan oleh
kurir, sehingga sering lebih dari 7 hari. Akibatnya, event Purchase saat COD cair berisiko
datang terlambat, tidak teratribusi ke iklan, dan tidak berguna untuk optimasi.

Kedua angka di atas mengikuti dokumentasi Meta dan perlu dikonfirmasi tim ADV AI untuk
akun dan `action_source` yang dipakai (misalnya click-to-WhatsApp).

## Opsi

| Opsi | Purchase dikirim saat               | Kelebihan                                            | Kekurangan                                                          |
| ---- | ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| A    | Terverifikasi                       | Paling cepat, hampir pasti dalam 7 hari              | Paling banyak koreksi; RTS dan batal ikut terhitung dulu            |
| B    | Terkirim                            | Order sudah diterima pembeli; RTS setelah ini jarang | Bergantung kecepatan status kurir dari Ethix; bisa mendekati 7 hari |
| C    | Selesai (COD cair) – draft saat ini | Sinyal paling bersih, sama dengan ROAS riil          | Sering lewat 7 hari; event ditolak atau tidak teratribusi           |

**Usulan: opsi A atau B, ditambah koreksi.** Bila order yang sudah dikirimi Purchase
berakhir RTS atau batal, OMS mengirim event koreksi. Meta tidak punya cara menarik event
Purchase yang sudah terkirim, jadi bentuk koreksinya (event kustom, nilai negatif, atau
cara lain yang sudah dipakai ADV AI) ditanyakan ke tim ADV AI (pertanyaan 7).

Apa pun pilihannya, ROAS riil di OMS (`GET /ads/performance`) tetap dihitung dari GMV cair.
Event ke Meta hanya sinyal optimasi, bukan angka keuangan.

## Dampak ke kontrak

`adv-ai.v1.yaml` belum dikirim ke tim ADV AI dan endpoint ini berstatus draft, jadi
penandaan keputusan terbuka ditulis di v1 tanpa mengubah skema. Setelah keputusan diambil,
field yang bergantung padanya disesuaikan: pemicu event, arti `terjadi_at`, arti `nilai`
(nilai order vs GMV cair), dan skema event koreksi. Bila v1 sudah dibagikan ke tim lain
saat itu, perubahan masuk ke v2.

Terkait: keputusan jalur event (OMS langsung atau lewat ADV AI) masih terbuka di
[0001](0001-fondasi-fase-0.md).
