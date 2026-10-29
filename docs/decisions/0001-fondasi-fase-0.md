# 0001 – Fondasi Fase 0

Tanggal: 2026-10-28 · Status: disetujui

## Konteks

Fase 0 membangun fondasi OMS GRASON: monorepo, infrastruktur lokal, skema data,
auth, dan kontrak API untuk SaaS CS AI, ADV AI, dan WMS Ethix. Rencana disetujui
dengan lima jawaban atas pertanyaan terbuka (bagian "Jawaban rencana").

## Jawaban rencana

1. **Produk.** SKU dan berat memakai placeholder. Harga jual satuan resmi:
   Bio Serea 95.000, Vivagoat 42.000, Kapsul Kutuk 220.000, Wight Up 90.000.
   HPP placeholder sampai Finance memberi angka resmi.
2. **Status lead:** `baru`, `direspon`, `follow_up`, `closing`, `gagal`,
   ditambah flag `handover` terpisah (bukan status).
3. **`audit_logs` ditambahkan** di luar daftar Model data blueprint, untuk
   mencatat perubahan asumsi biaya/HPP, ekspor, login, user, dan API key.
4. **Order campur entitas tidak ditolak.** Satu checkout boleh berisi produk SSR
   dan FHI. Checkout dicatat sebagai `order_groups`, lalu dipecah menjadi satu
   order per entitas dengan `order_group_id` yang sama. Aturan pemecahan dibangun
   di Fase 1; Fase 0 hanya menyiapkan tabel, kolom, dan relasi.
5. **Sesi login disimpan di database** (tabel `sessions`, cookie httpOnly), bukan
   JWT, supaya sesi bisa dicabut seketika saat user dinonaktifkan.

## Keputusan

### Monorepo & tooling

- pnpm workspaces tanpa Turborepo; skrip root memakai `pnpm -r`.
- TypeScript 5.9 strict. TypeScript 7 (native) dan NestJS 12 sudah rilis, tetapi
  belum dipakai: dukungan decorator metadata dan ekosistemnya belum terbukti.
  Dievaluasi ulang setelah Fase 1.
- NestJS 11 untuk API, Next.js 16 + Tailwind 4 untuk web, BullMQ 6 + ioredis untuk
  worker (BullMQ 6 tidak lagi membawa ioredis). Web meneruskan `/api/v1/*` ke API
  lewat rewrite Next.js, sehingga cookie sesi berlaku satu origin.
- Prisma 7.10 (versi stabil; tag `latest` di npm adalah 8.0 RC) dengan driver
  adapter `@prisma/adapter-pg`.
- Vitest + SWC untuk semua tes. Package internal mengekspor kondisi `source`
  (TypeScript mentah) untuk tes dan `default` (hasil build `dist/`) untuk runtime.

### Infrastruktur lokal

- `docker-compose.yml` hanya berisi Postgres 16 dan Redis 7. Container aplikasi
  dibuat di Fase 4.
- Port host default 5433 (Postgres) dan 6380 (Redis) agar tidak bentrok dengan
  instans lain; bisa diubah di `.env`.
- Dua database: `grason_oms` (dev) dan `grason_oms_test` (tes, dikosongkan
  sebelum tiap tes).

### Skema data

- Nama tabel & kolom snake_case lewat `@@map`/`@map`; nama model PascalCase.
- Uang `Int` rupiah (batas ±2,1 miliar per baris, cukup per order atau per
  hari per iklan). Penjumlahan dilakukan di query.
- Semua waktu `timestamptz` UTC. Tanggal tanpa jam (tanggal cair COD, tanggal
  spend) memakai `date` dan dimaknai sebagai tanggal WIB.
- Idempotensi data luar: `@@unique([sumber, externalId])` di `leads`,
  `order_groups`, `orders`, `cod_settlements`, `ad_spend_daily`.
  `integration_events` unik di `(sistem, arah, idempotency_key)`.
- Order hasil pecahan checkout: `orders` unik di `(order_group_id, entitas)`.
  Usulan untuk Fase 1: `orders.external_id = <external_id checkout>:<entitas>`,
  sehingga aturan `(sumber, external_id)` tetap berlaku di level order.
- Paket adalah baris `products` dengan `tipe = paket`; komponennya di `bundles`.
  Entitas paket harus sama dengan entitas komponennya (dicek di seed dan nanti
  di service produk).
- Alamat pengiriman disalin ke `orders` (snapshot), terpisah dari alamat
  terakhir di `customers`.
- `customers.no_wa` dinormalisasi ke format `628xxxxxxxxx`.
- Tabel `sessions` dan `audit_logs` ditambahkan di luar daftar blueprint.

### Auth, role, API key

- Password di-hash dengan argon2id (`@node-rs/argon2`).
- Sesi: token acak 32 byte di cookie httpOnly `oms_sesi` (SameSite=Lax, Secure di
  produksi). Database hanya menyimpan hash SHA-256 token. Masa berlaku 12 jam.
  Menonaktifkan user mencabut semua sesinya, dan guard juga menolak user yang
  tidak aktif.
- Matriks role → izin ada di `packages/shared` (ter-review dan dites), tabel
  `roles` menyimpan kode dan nama role. Endpoint ditandai `@Perlu(izin)`.
- Nomor WA dan alamat pelanggan disamarkan untuk role tanpa izin
  `pelanggan.pii.lihat`.
- API key berformat `gok_<prefix>_<secret>`; disimpan sebagai prefix + hash
  SHA-256 dan hanya ditampilkan utuh sekali saat dibuat. Scope default per sistem
  (CS AI, Ethix, ADV AI) mengikuti tabel izin API di blueprint.
- Akun Orkestrator pertama dibuat oleh seed dari `SEED_ADMIN_EMAIL` dan
  `SEED_ADMIN_PASSWORD` di `.env`.

### Kontrak API

- OpenAPI 3.1 per sistem di `docs/api-contract/`, berversi di nama file
  (`*.v1.yaml`). Perubahan yang tidak kompatibel = file versi baru.
- Webhook OMS → CS AI ditandatangani HMAC-SHA256 dan membawa `Idempotency-Key`.
- Format CSV cadangan Ethix memakai kolom yang sama persis dengan payload API.
- `pnpm test` ikut menjalankan lint spesifikasi dengan Redocly.
- Field JSON di kontrak eksternal memakai `snake_case`; API internal dashboard memakai
  `camelCase` mengikuti kode TypeScript.
- Di luar tabel endpoint blueprint, kontrak CS AI menambah `GET /leads/{id}`,
  `POST /orders/{id}/verifikasi` (pemicu status Terverifikasi dari CS AI), dan
  `GET /prices` (harga aktif).
- `ethix.v1.yaml` memuat dua arah: endpoint OMS untuk Ethix, dan usulan endpoint
  penerima order di sisi Ethix (`servers` per path).
- Event pembelian untuk Meta (`GET /ads/purchases`) berstatus draft sampai jalur
  OMS-langsung vs lewat ADV AI diputuskan. Waktu pengiriman event Purchase dibahas
  terpisah di [0002](0002-waktu-event-purchase-meta.md).

## Belum diputuskan (dibawa ke fase berikutnya)

- Cara Ethix mencatat alokasi stok, jam cut-off, dan format integrasi final.
- Aturan pemecahan order per entitas (ongkir, diskon, nilai COD per order) – Fase 1.
- Rate limit login dan kebijakan kompleksitas password – Fase 1.
