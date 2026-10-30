# 0005 – Pengamanan API key sebelum API dibuka lewat tunnel

Tanggal: 2026-10-30 · Status: diterapkan

## Konteks

API OMS lokal (port 3001) akan dibuka ke internet lewat Cloudflare Tunnel untuk uji
sambung dengan SaaS CS AI. Sebelumnya:

- X-Sim-Waktu diterima dari permintaan apa pun bila `DEMO_MODE=true`, termasuk dari API
  key CS AI biasa. Sistem luar bisa menulis data dengan waktu mundur.
- Endpoint dashboard sudah menolak API key, tetapi `POST /auth/login` bersifat publik dan
  tetap bisa dipanggil sambil membawa API key.
- Tidak ada rate limit.

## Keputusan

- **X-Sim-Waktu** hanya berlaku di mode demo, dan hanya untuk:
  - API key bertanda `simulator` (kolom baru `api_keys.simulator`), yang hanya dibuat
    `pnpm demo:reset`. Tanda ini tidak bisa diset lewat API maupun `pnpm apikey:create`;
    nama "Simulator …" saja tidak cukup.
  - Sesi akun demo (`*@demo.grason.local`), karena CS manusia palsu di simulator login
    seperti user web dan perlu mengisi data mundur.
  Pelaku lain selalu memakai jam server; header diabaikan tanpa galat, sama seperti di
  luar mode demo. Waktu permintaan sekarang ditentukan di `AksesGuard` setelah pelaku
  dikenali, bukan di middleware.
- **API key hanya untuk endpoint `@PerluScope`.** Permintaan yang membawa API key ke
  endpoint lain, termasuk endpoint publik seperti login, ditolak 403 sebelum diproses.
  Tes memeriksa semua route terdaftar: tiap endpoint di luar scope CS AI menolak kunci CS
  AI. `pnpm demo:reset` hanya CLI; tidak ada endpoint HTTP-nya.
- **Rate limit** 60 permintaan per menit per API key (jendela geser), diatur dengan
  `RATE_LIMIT_API_KEY_PER_MENIT` (0 = mati). Lewat batas: 429
  `terlalu_banyak_permintaan` dengan header `Retry-After`. Kunci simulator di mode demo
  tidak dibatasi supaya pengisian data mundur tetap cepat. Hitungan di memori proses;
  cukup untuk satu instance, pindah ke Redis bila API lebih dari satu instance.

## Belum diputuskan

- Respons 429 belum tercantum di `cs-ai.v1.yaml` dan `ethix.v1.yaml`. Sesuai aturan
  kontrak, mencantumkannya berarti versi baru; sementara ini disampaikan langsung ke tim
  SaaS CS AI.
- Login web belum punya batas percobaan per IP. Selama tunnel dibuka, sebaiknya tunnel
  hanya meneruskan path kontrak CS AI (lihat README).
