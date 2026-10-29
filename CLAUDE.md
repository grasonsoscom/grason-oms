# OMS GRASON

OMS internal GRASON (PT Etos Kreatif Indonesia) untuk order Soscom:
lead & order dari SaaS CS AI dan CS manusia, dikirim langsung ke WMS Ethix.
Shopee & TikTok Shop menyusul di v2.

Blueprint lengkap: docs/blueprint.md. Baca sebelum mengubah skema atau alur status.

## Fase saat ini
Fase 0 – Fondasi & kontrak data.
Fase 0–2 memakai simulator; belum ada integrasi nyata dengan SaaS CS AI, ADV AI, atau Ethix.
Integrasi nyata baru dibangun di Fase 3.

## Aturan tetap
- TypeScript strict di semua app. Uang = integer rupiah.
- Stok fisik bersumber dari WMS Ethix; OMS tidak pernah mengubah stok gudang.
- Data dari sistem lain unik di (sumber, external_id); semua job integrasi idempotent.
- Status OMS: baru, terverifikasi, di_gudang, dikirim, terkirim, batal, rts.
- OMS tidak memegang uang: tidak ada pencairan COD, HPP, atau profit. GMV dan ROAS dihitung dari order berstatus terkirim.
- Setiap order membawa entitas (SSR/FHI) dari produknya:
  Vivagoat = SSR; Bio Serea, Kapsul Kutuk, Wight Up = FHI.
- Kontrak API untuk SaaS CS AI, ADV AI, dan Ethix ada di docs/api-contract;
  perubahan kontrak = versi baru, bukan mengubah versi lama.
- Simulator (packages/simulator) hanya boleh memanggil OMS lewat API yang sama
  dengan sistem nyata, supaya pindah ke data nyata cukup mengganti sumbernya.
- Waktu disimpan UTC, ditampilkan Asia/Jakarta.
- Secret (API key, token, password) hanya di .env, tidak pernah di repo.
- Nomor WA dan alamat pelanggan hanya terlihat oleh role yang membutuhkan.

## Cara kerja
- Rencanakan dulu dan tunggu persetujuan sebelum menulis kode untuk fase baru.
- Setiap fitur disertai tes. Jalankan `pnpm test` sebelum menyatakan selesai.
- Perubahan skema = migrasi Prisma baru, tidak mengedit migrasi lama.
- Catat keputusan desain di docs/decisions/.
- UI berbahasa Indonesia.
