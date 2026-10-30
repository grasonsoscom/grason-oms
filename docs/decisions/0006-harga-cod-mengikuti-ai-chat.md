# 0006 – Harga COD mengikuti GrasOn AI Chat (cs-ai.v2)

Tanggal: 2026-10-30 · Status: disetujui

## Konteks

SaaS CS AI yang akan disambungkan adalah GrasOn AI Chat (repo `grasonsoscom/grason-ai-chat`).
Harga COD di sana (`src/lib/promo.ts`) memuat lebih dari yang dikenal `cs-ai.v1`:

- biaya COD 3% dari (harga paket + ongkir),
- subsidi ongkir per segmen (NC, RO, reseller) dan wilayah (Jawa / luar Jawa),
- subsidi admin COD 5.000,
- keduanya hanya bila harga + ongkir mencapai minimum order (120.000; reseller 200.000).

Di v1, nilai COD = subtotal − diskon + ongkir, sehingga angka yang disebut CS AI ke
pembeli bisa berbeda dengan nilai COD di OMS dan Ethix. Aturan promo ini juga sering
berubah (tiga commit pada 30 Oktober 2026 saja).

## Keputusan

- **Kontrak baru `cs-ai.v2`** di `/api/v2`; `cs-ai.v1` di `/api/v1` tidak diubah dan tetap
  berjalan. API memakai versi URI Nest: controller tanpa versi = v1, controller CS AI
  melayani keduanya.
- **Sumber aturan promo: GrasOn AI Chat.** OMS tidak menghitung subsidi. `POST /orders` v2
  wajib membawa `total` dan rinciannya (`subsidi_ongkir`, `biaya_cod`, `subsidi_admin_cod`,
  opsional `segmen`). OMS memeriksa:
  - `total = subtotal − diskon + ongkir − subsidi_ongkir + biaya_cod − subsidi_admin_cod`,
    dengan subtotal dari harga aktif OMS. Beda → 422 `total_tidak_cocok` beserta hitungan
    OMS; penyebab yang paling mungkin adalah harga di AI Chat tidak sama dengan `GET /prices`.
  - subsidi ongkir ≤ ongkir, subsidi admin ≤ biaya COD, biaya COD hanya untuk COD →
    selain itu 422 `rincian_tidak_valid`.
  - `nilai_cod` = `total`, jadi verifikasi dan Ethix memakai angka yang sama dengan yang
    disebut CS AI ke pembeli.
- **Checkout campur SSR + FHI:** ongkir dibagi sebanding berat (seperti v1); subsidi ongkir
  sebanding ongkir tiap order; biaya COD sebanding nilai order sebelum biaya COD; subsidi
  admin sebanding biaya COD. Subsidi dibagi sebanding pos yang disubsidi supaya tidak
  pernah melebihinya di order mana pun. Semua memakai metode sisa terbesar.
- **Segmen** (`nc`, `ro`, `reseller`) disimpan di lead dan order apa adanya dari CS AI.
  OMS tidak menurunkannya sendiri. Tim AI Chat akan menambahkan pengirimannya; sampai
  itu, field ini opsional.
- **Order dari dashboard (CS manusia):** biaya COD, subsidi, dan segmen diisi manual
  mengikuti aturan AI Chat. OMS tidak menyalin rumus promo supaya tidak ada dua sumber
  yang bisa berbeda.
- **Nomor WA:** format internasional (`+62…`) sudah diterima sejak v1; OMS menyimpan dan
  mengembalikan `628…`, yang lolos validasi AI Chat.
- **GMV terkirim = nilai barang setelah diskon (`subtotal − diskon`)**, tanpa ongkir dan
  biaya COD. Subsidi hanya mengurangi ongkir dan biaya COD, jadi tidak memengaruhi GMV.
  Ringkasan dashboard sudah memakai definisi ini. Arti `gmv_terkirim` di kontrak ADV AI
  berubah, jadi kontrak ADV AI naik ke `adv-ai.v2` (endpoint ADV AI belum dibangun).
- **Simulator:** CS AI palsu memakai `cs-ai.v2` dan salinan aturan promo AI Chat
  (`packages/simulator/src/data.ts`), hanya untuk data uji. CS manusia palsu mengisi rincian
  yang sama di dashboard.
- `cs-ai.v2` mencantumkan respons 429 dari rate limit (keputusan 0005).

## Belum diputuskan

- Kapan `cs-ai.v1` dimatikan: setelah AI Chat memakai v2 dan tidak ada lagi panggilan v1.
- Webhook `order.status_changed` belum memuat rincian harga; tidak dibutuhkan untuk
  follow-up CS AI.
