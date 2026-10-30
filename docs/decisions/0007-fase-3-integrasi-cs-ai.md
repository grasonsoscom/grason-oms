# 0007 – Fase 3 dimulai dengan integrasi CS AI saja

Tanggal: 2026-10-30 · Status: disetujui

## Konteks

- Persetujuan direksi untuk keluar dari jalur WACOS/EPOS sudah didapat.
- Tim GrasOn AI Chat (SaaS CS AI) sudah mengerjakan sisi mereka untuk `cs-ai.v2`
  ([0006](0006-harga-cod-mengikuti-ai-chat.md)).
- API Ethix belum siap; timeline ADV AI mundur.
- Blueprint menaruh Fase 2 sebelum Fase 3, dan gerbang Fase 1 (tim memakai alur lead →
  terkirim seminggu dengan data simulator) belum dijalani.

## Keputusan

- **Urutan baru:** Fase 3 hanya integrasi CS AI. Fase 2 menyusul setelahnya. ADV AI dan
  API Ethix digeser ke fase setelah Fase 3. Selama itu Ethix tetap dari simulator dan
  order nyata berhenti di terverifikasi atau batal.
- **Data nyata terpisah dari demo.** Ethix palsu menarik semua order `siap_kirim`; bila
  data nyata dan simulator satu database, Ethix palsu akan membuat resi palsu untuk order
  nyata dan OMS mengabarkannya ke CS AI. Karena itu uji sambung memakai lingkungan sendiri
  (`pnpm uji:siapkan`, `pnpm uji`):
  - database `grason_oms_uji`, Redis db 1, API :3002, web :3003, cookie sesi
    `oms_sesi_uji`, `DEMO_MODE=false`, tanpa simulator;
  - konfigurasi di `.env.uji` (gitignored) yang hanya menimpa nilai `.env`;
  - tunnel (Cloudflare) diarahkan ke :3002, hanya untuk path kontrak CS AI.
- **Webhook `order.status_changed` dikirim sungguhan** oleh worker dari outbox
  `integration_events` (adaptor di `packages/integrations/cs-ai`):
  - HMAC-SHA256 `X-Oms-Signature` atas `<X-Oms-Timestamp>.<body>`, `Idempotency-Key` =
    `event_id`, batas waktu 10 detik;
  - kirim ulang 30 dtk, 1, 2, 4, 8, 16, 32, 64 menit (8 kali); 400 tidak diulang;
  - sapuan tiap 5 detik dengan klaim per event, dan sewa 60 detik supaya event yang
    tertahan saat worker berhenti dikirim lagi;
  - `CS_AI_WEBHOOK_URL` dan `CS_AI_WEBHOOK_SECRET` hanya di `.env.uji`. Tanpa keduanya
    tidak ada yang dikirim, jadi lingkungan demo tidak pernah mengirim webhook.
  - Worker menyapu outbox dengan interval, bukan antrian BullMQ: outbox sudah menjadi
    antrean yang tahan restart, dan jadwal ulang tersimpan di `coba_lagi_at`.
- **Panggilan tulis dari CS AI dicatat** (`integration_events`, arah masuk): lead dan order
  dibuat, lead diubah, verifikasi. Termasuk kiriman ulang (`duplikat`) dan yang ditolak
  beserta kode galatnya. GET tidak dicatat. Penolakan di AksesGuard (401/403/429) terjadi
  sebelum pencatatan dan tidak tercatat.
- **Halaman Integrasi** (izin baru `integrasi.lihat`, Orkestrator): daftar event dengan
  filter, isi payload (nomor WA dan alamat disamarkan untuk role tanpa izin PII), rekap per
  hari, kirim ulang webhook yang gagal (tercatat di audit log), dan ekspor CSV per
  `external_id` untuk dicocokkan dengan data AI Chat. Ini dasar gerbang Fase 3: lead dan
  order nyata tercatat tanpa selisih.
- Panduan untuk tim AI Chat: `docs/integrasi/cs-ai.md`.

## Belum diputuskan

- Alamat publik tetap (staging) setelah uji lewat tunnel.
- Kapan Fase 2 dimulai, dan kapan gerbang Fase 1 dijalani tim.
