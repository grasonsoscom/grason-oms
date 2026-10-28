# Blueprint Teknis GRASON OMS

Oct 28, 2026 · @Bintang

## Ringkasan

GRASON OMS v1 fokus ke order Soscom. Lead dan order dari SaaS CS AI dan CS manusia dicatat di OMS GRASON, lalu dikirim langsung ke WMS Ethix untuk dikemas dan dikirim, tanpa lewat WACOS dan EPOS. Shopee dan TikTok Shop menyusul di v2 setelah akses API keluar. Estimasi v1 sampai go-live sekitar 10 minggu, tergantung kesiapan penyesuaian di sisi Ethix.

| Langkah | Sekarang | Dengan OMS GRASON |
| --- | --- | --- |
| Pencatatan lead & atribusi iklan | WACOS (Online Sales + IT) | OMS GRASON, data dari SaaS CS AI dan ADV AI |
| Input order | EPOS (Operations + IT) | OMS GRASON: otomatis dari CS AI, form untuk CS manusia |
| Pengemasan & pengiriman | WMS Ethix | WMS Ethix, order dikirim langsung dari OMS GRASON |
| Kurir & COD | Ethix sebagai agregator | Tetap Ethix; status resi, RTS, dan COD cair ditarik balik ke OMS |
| Order Shopee & TikTok | OMS holding | Tetap OMS holding sampai v2 |

Scope v1:

| Modul | Masuk v1 | Hasil yang dipakai tim |
| --- | --- | --- |
| Lead & atribusi iklan | Ya | Setiap lead membawa ID campaign/iklan asalnya |
| Order Soscom | Ya | Order dari CS AI dan CS manusia dalam satu daftar |
| Integrasi WMS Ethix | Ya | Order terkirim ke gudang otomatis; status, resi, RTS kembali ke OMS |
| COD & retur | Ya | Rekonsiliasi COD cair per resi, alasan RTS per CS, kota, iklan |
| Stok | Ya | Stok dari WMS Ethix, dikurangi order yang belum diambil gudang |
| Profit & ROAS riil | Ya | GP per order dan ROAS per iklan dari COD yang benar-benar cair |
| Kinerja CS | Ya | CS AI vs CS manusia dengan metrik yang sama |
| Shopee & TikTok Shop | v2 | Menunggu akses API |
| Akuntansi & jurnal | Tidak | Tetap di Finance; OMS kirim ekspor per entitas |

## Arsitektur & tech stack

OMS GRASON berdiri di tengah: menerima lead dan order dari SaaS CS AI dan CS manusia, memegang aturan bisnis, dan menjadi satu-satunya pengirim order Soscom GRASON ke WMS Ethix. Semua jalan di Docker Compose pada VPS sendiri, terpisah dari container Hermes dan SaaS CS AI.

&#91;embedded content: arsitektur OMS GRASON v1 · 3 sumber, 1 pintu ke WMS Ethix\]

WMS Ethix berjalan dua arah: order masuk ke gudang, lalu status kemas, resi, RTS, dan COD cair kembali ke OMS. Shopee dan TikTok Shop baru tersambung di v2.

| Lapis | Pilihan | Alasan |
| --- | --- | --- |
| Bahasa | TypeScript (frontend + backend) | Claude Code paling konsisten di satu bahasa; tipe data dipakai bersama |
| Backend API | Node.js + NestJS | Struktur modul jelas (lead, order, stok, COD, CS) dan mudah dites |
| Database | PostgreSQL 16 + Prisma ORM | Transaksi order dan stok atomik; migrasi skema terlacak |
| Antrian job | Redis + BullMQ | Kirim order ke Ethix, tarik status & COD, webhook ke CS AI, event ke Meta, semuanya dengan retry |
| Frontend | Next.js + Tailwind | Dashboard internal, bisa dipakai dari HP |
| Auth | Login email + password, role-based; API key untuk sistem | Hak akses per posisi; CS AI dan Ethix pakai kunci terpisah |
| Deploy | Docker Compose di VPS (estimasi 4 vCPU, 8 GB RAM) | Satu perintah untuk naik; mudah dipindah |
| Backup | pg\_dump harian ke cloud storage, simpan 30 hari | Data order dan pelanggan adalah aset; restore diuji tiap bulan |
| Monitoring | Sentry + Uptime Kuma + log integrasi di DB | Tahu cepat kalau kiriman ke Ethix atau CS AI macet |

Prinsip yang dipegang di semua modul:

- Uang disimpan sebagai integer rupiah, tanpa desimal.
- Stok fisik bersumber dari WMS Ethix. OMS hanya mencatat pemesanan dan tidak pernah mengubah stok gudang sendiri.
- Setiap data dari sistem lain punya kunci unik (sumber + ID eksternal), jadi kiriman ganda dari CS AI atau Ethix tidak tercatat dua kali.
- Nomor HP dan alamat pelanggan hanya terlihat oleh role yang membutuhkan, dan setiap ekspor tercatat (sesuai UU Pelindungan Data Pribadi).
- Semua waktu disimpan UTC, ditampilkan WIB.

## Integrasi

v1 punya tiga integrasi wajib: SaaS CS AI, WMS Ethix, dan ADV AI/Meta. Kontrak datanya dikunci di Fase 0, tetapi integrasinya baru dibangun di Fase 3. Sampai saat itu, ketiganya digantikan simulator di dalam repo yang mengirim lead, order, status gudang, spend iklan, dan laporan COD palsu dengan format kontrak yang sama. Pindah ke data nyata cukup dengan mengganti sumbernya.

| Dari → ke | Yang dikirim | Cara | Pemilik sisi lain |
| --- | --- | --- | --- |
| SaaS CS AI → OMS | Lead baru + ID iklan, update lead, order, handover ke CS manusia | REST API + API key | Tim SaaS CS AI GRASON |
| OMS → SaaS CS AI | Status order, resi, stok tersedia, harga aktif | Webhook + GET API | Tim SaaS CS AI GRASON |
| OMS → WMS Ethix | Order siap kirim: penerima, alamat, SKU, qty, nilai COD | API Ethix, sementara boleh file terjadwal | Ethix + IT |
| WMS Ethix → OMS | Dikemas, resi + kurir, terkirim, RTS, stok per SKU | Webhook atau polling | Ethix + IT |
| Ethix → OMS | COD cair per resi, potongan biaya COD dan ongkir | File atau API harian | Ethix + Finance |
| ADV AI → OMS | ID campaign, adset, iklan (dibawa lead dari click-to-WhatsApp atau UTM LP) | Lewat SaaS CS AI | Tim ADV AI |
| OMS → Meta | Event pembelian saat COD cair, untuk optimasi iklan | Conversions API, lewat ADV AI atau langsung | Tim ADV AI |

### Kontrak API untuk SaaS CS AI

| Endpoint | Fungsi |
| --- | --- |
| `POST /api/v1/leads` | Buat lead: nomor WA, sumber, campaign/adset/ad ID, produk yang ditanyakan |
| `PATCH /api/v1/leads/{id}` | Update status lead, catat waktu respon pertama, handover ke CS manusia |
| `POST /api/v1/orders` | Buat order dari lead: SKU, qty, alamat, metode bayar, catatan |
| `GET /api/v1/orders/{id}` | Status order, resi, posisi kiriman |
| `GET /api/v1/stock` | Stok tersedia per SKU sebelum CS AI menawarkan |
| Webhook `order.status_changed` | Dikirim OMS ke CS AI untuk follow-up otomatis: resi terbit, gagal antar, COD ditolak |

### Yang perlu disiapkan Ethix

- Endpoint penerima order dari OMS GRASON sebagai klien tersendiri, terpisah dari jalur EPOS.
- Status balik per order: dikemas, dikirim + resi + kurir, terkirim, gagal antar/RTS, diterima kembali di gudang.
- Stok per SKU produk GRASON, termasuk barang retur yang layak jual.
- Laporan COD cair per resi: tanggal cair, nominal, potongan biaya COD dan ongkir.
- Bila API belum siap: pertukaran file CSV terjadwal dengan format yang sama, supaya nanti tinggal diganti ke API.

Semua integrasi idempotent (kunci = sumber + ID eksternal), punya retry bertahap, dan tercatat di log integrasi.

## Model data

Tiga tabel paling menentukan di v1: `leads` (membawa ID iklan, dasar ROAS dan kinerja CS), `orders` (satu baris per order, dengan referensi order di Ethix), dan `cod_settlements` (uang yang benar-benar cair). Setiap order juga membawa entitas (SSR atau FHI) supaya ekspor Finance sudah terpisah sesuai RKAT.

| Tabel | Isi utama | Catatan |
| --- | --- | --- |
| `products` | SKU, nama, harga jual, berat, entitas (SSR/FHI) | Vivagoat → SSR; Bio Serea, Kapsul Kutuk, Wight Up → FHI |
| `product_costs` | SKU, HPP, berlaku\_mulai | HPP berubah tanpa merusak hitungan bulan lalu |
| `bundles` | SKU paket → SKU komponen + qty | Paket isi 2/3 dikirim ke Ethix sebagai komponen |
| `customers` | Nomor WA (unik), nama, alamat | Dasar repeat order dan riwayat RTS per pelanggan |
| `leads` | Sumber, campaign/adset/ad ID, agen (CS AI atau CS manusia), waktu masuk, respon pertama, status, handover | Closing rate = lead dengan order ÷ total lead |
| `orders` | Lead, pelanggan, CS, metode bayar (COD/transfer), total, nilai COD, status OMS, ref Ethix, entitas | Unik di (sumber, ID eksternal) |
| `order_items` | Order, SKU, qty, harga, diskon |  |
| `order_status_history` | Order, status, waktu, oleh siapa/sistem | Dasar SLA dan audit |
| `shipments` | Order, kurir, resi, waktu kirim, waktu terima, percobaan antar | Diisi dari status Ethix |
| `returns` | Order, jenis (RTS/retur), alasan, kondisi barang, ongkir balik | Alasan RTS dianalisis per CS, kota, iklan |
| `stock_snapshots` | SKU, stok Ethix, waktu sinkron | Stok tersedia = stok Ethix − order belum diambil gudang |
| `cod_settlements` | Resi, nominal cair, potongan COD & ongkir, tanggal cair, selisih | Order baru Selesai saat COD cair cocok |
| `ad_spend_daily` | Tanggal, campaign/ad ID, produk, spend | Ditarik dari ADV AI |
| `order_costs` | Order, HPP, biaya iklan teralokasi, biaya COD, ongkir, ongkir retur | Diisi saat order selesai atau RTS |
| `integration_events` | Sistem, arah, ID eksternal, payload, hasil, error | Log + pencegah data ganda |
| `users`, `roles`, `api_keys` | Akun tim, hak akses, kunci untuk CS AI dan Ethix |  |

Tabel untuk v2 (Shopee dan TikTok Shop): `stores` dan `channel_skus` untuk pemetaan SKU ke item marketplace.

## Modul & alur

Order Soscom melewati enam status utama dengan dua jalur keluar. Order baru dianggap Selesai saat COD-nya cair dan cocok dengan nilai order, bukan saat paket diterima.

| Status OMS | Pemicu | Sumber |
| --- | --- | --- |
| Baru | Order dibuat dari lead | SaaS CS AI / CS manusia |
| Terverifikasi | Alamat lengkap dan nilai COD dikonfirmasi pembeli | SaaS CS AI / CS manusia |
| Di gudang | Ethix mengonfirmasi order diterima | WMS Ethix |
| Dikirim | Resi terbit | WMS Ethix |
| Terkirim | Paket diterima pembeli | WMS Ethix (status kurir) |
| Selesai | COD cair cocok dengan nilai order; transfer langsung Selesai saat Terkirim | Laporan COD Ethix |
| Batal | Dibatalkan sebelum Ethix mengemas | CS / pembeli |
| RTS | Gagal antar atau COD ditolak, paket kembali ke gudang | WMS Ethix |

&#91;embedded content: alur status order Soscom · 6 status, 2 jalur keluar\]

Gagal antar memicu notifikasi ke SaaS CS AI supaya pembeli dihubungi sebelum paket benar-benar dikembalikan.

### Verifikasi COD

- Order COD baru dikirim ke Ethix setelah status Terverifikasi: alamat lengkap, nilai COD, dan kesediaan bayar dikonfirmasi.
- Pelanggan dengan riwayat RTS diberi tanda dan wajib diverifikasi CS manusia, bukan CS AI.

### Stok

- Stok fisik ditarik dari Ethix tiap 15 menit, plus setiap kali Ethix mengirim perubahan.
- Stok tersedia = stok Ethix − order yang sudah dibuat tapi belum dialokasikan Ethix. Cara Ethix mencatat alokasi dikonfirmasi di Fase 0.
- SaaS CS AI mengecek stok lewat API sebelum menawarkan. Order yang melebihi stok tersedia ditolak.
- Hari cover = tersedia ÷ rata-rata terjual per hari 7 hari terakhir. Di bawah 7 hari waspada, di bawah 4 hari kritis.

### Pengiriman & RTS

- Order Terverifikasi dikirim ke Ethix seketika; order setelah jam cut-off Ethix ikut batch hari berikutnya. Jam cut-off disepakati di Fase 0.
- SLA: resi terbit maksimal 24 jam setelah Terverifikasi. Lewat 18 jam ditandai kuning, lewat 24 jam merah.
- RTS dilacak sampai barang diterima kembali di gudang Ethix. Alasan RTS wajib diisi dan dianalisis per CS, kota, dan iklan.

### Profit & ROAS riil

Gross profit dan ROAS dihitung dari uang yang benar-benar masuk:

```latex
GP = GMV_{cair} - HPP - Iklan - Biaya_{COD} - Ongkir - Ongkir_{RTS}
```

```latex
ROAS_{riil} = GMV_{cair} \div Spend_{iklan}
```

- GMV cair = COD yang cair ditambah transfer yang diterima, tidak menghitung order batal dan RTS.
- Biaya iklan dialokasikan langsung ke order dari lead iklan itu, karena setiap lead membawa ad ID. Iklan yang menghasilkan lead tanpa order tetap tercatat sebagai biaya iklan itu.
- ROAS riil per iklan menunjukkan iklan mana yang menghasilkan pembeli yang membayar, bukan sekadar lead atau order.
- Angka OMS adalah angka operasional. Tiap bulan direkonsiliasi dengan P&L Finance per entitas, yang juga memuat biaya operasional di luar order.

### Kinerja CS

| Metrik | Rumus |
| --- | --- |
| Closing rate | Lead yang jadi order ÷ total lead |
| Waktu respon | Rata-rata selisih lead masuk → balasan pertama |
| Handover rate | Lead CS AI yang dioper ke CS manusia ÷ total lead CS AI |
| GMV cair per lead | GMV cair dari order CS ÷ total lead |
| RTS rate | Order COD yang RTS ÷ order COD terkirim |
| Follow-up tertunda | Lead belum closing dalam 48 jam terakhir |

CS AI dan CS manusia tampil berdampingan dengan metrik yang sama. Dengan GMV cair per lead dan RTS rate, perbandingannya sampai ke uang yang masuk, bukan hanya jumlah closing.

## Role & hak akses

Ada enam role login di tim GRASON. Ethix dan SaaS CS AI tidak login; keduanya memakai API key dengan izin terbatas. Asumsi biaya hanya bisa diubah Orkestrator dan Finance, dan setiap perubahan tercatat.

| Role | Posisi GRASON | Lihat | Ubah |
| --- | --- | --- | --- |
| Orkestrator | Orkestrator & Co-Orkestrator | Semua modul | Semua, termasuk asumsi biaya, user, API key |
| Finance | Finance | Order, COD, profit, ekspor per entitas | HPP, rekonsiliasi COD |
| Sales & Operations | Sales & Operations | Order, pengiriman, RTS, stok | Batalkan order, tindak lanjut RTS, koreksi alamat |
| CS Leader | CS Leader | Semua lead dan order, dashboard CS | Bagi lead, ambil alih handover dari CS AI |
| CS | CS manusia | Lead dan order miliknya | Input lead, input dan verifikasi order |
| PIC Iklan | Meta Ads | Lead, order, ROAS per iklan | Tidak ada; data iklan masuk dari ADV AI |

| Sistem | Izin API |
| --- | --- |
| SaaS CS AI | Buat/update lead, buat order, baca status order dan stok |
| WMS Ethix | Kirim status pengiriman, stok, laporan COD; baca order yang ditujukan ke Ethix |
| ADV AI | Kirim spend iklan harian, baca order dan GMV cair per iklan |

## Roadmap

Estimasi 10 minggu sampai OMS Soscom go-live. Fase 0–2 membangun dan menguji OMS memakai simulator, tanpa data nyata dari SaaS CS AI, ADV AI, atau Ethix. Semua integrasi nyata masuk di Fase 3, sementara persetujuan direksi dan koordinasi dengan tim terkait berjalan paralel. Kontrak data tetap dikunci di Fase 0 supaya tim SaaS CS AI dan Ethix bisa menyiapkan sisi mereka sejak awal.

&#91;embedded content: roadmap OMS GRASON v1 · 5 fase, 10 minggu\]

Kriteria gerbang yang diusulkan:

- **Fase 1:** tim GRASON menjalankan alur lead → Selesai dari ujung ke ujung dengan data simulator selama satu minggu, tanpa bug yang menghentikan kerja.
- **Fase 3:** lead dan order nyata dari SaaS CS AI tercatat tanpa selisih, order uji sampai ke Ethix dan resinya kembali tanpa input manual, dan spend harian dari ADV AI masuk.
- **Fase 4:** dimulai dengan satu produk pilot; go-live penuh setelah dua minggu jalan paralel dengan EPOS dan selisih order, resi, serta COD di bawah 0,5%.

## Risiko & keputusan

Risiko terbesar bukan teknis: mengelola order Soscom GRASON langsung ke Ethix berarti keluar dari jalur WACOS dan EPOS milik Online Sales dan Operations. Persetujuan direksi perlu dikantongi sebelum Fase 3, karena tanpa itu Ethix tidak akan menerima order dari jalur baru.

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Belum ada persetujuan keluar dari WACOS/EPOS | Integrasi Ethix tertahan | Ajukan dengan data: SLA, RTS, ROAS riil; mulai dari satu produk pilot |
| Penyesuaian di sisi Ethix lambat | Fase 3 mundur | Pertukaran file CSV terjadwal sebagai jembatan dengan format yang sama |
| Kontrak API berubah selama SaaS CS AI dibangun paralel | Integrasi rusak diam-diam | API berversi (`/v1`), tes kontrak bersama, perubahan dicatat di catatan keputusan |
| Order tercatat dua kali selama transisi | Barang terkirim ganda | Cut-over per produk dengan tanggal jelas; produk yang sudah pindah tidak diinput lagi di EPOS |
| Data pelanggan (nomor WA, alamat) bocor | Risiko hukum dan reputasi | Akses per role, backup terenkripsi, log ekspor |
| Hanya satu orang paham kode | Sistem berhenti saat orang itu keluar | Repo di akun perusahaan, CLAUDE.md dan tes diperbarui tiap fase |
| VPS bersama Hermes | Beban agen mengganggu OMS | VPS terpisah, atau minimal Compose dan database terpisah |

Keputusan yang perlu diambil sebelum Fase 1 berjalan jauh:

- [ ] Persetujuan direksi agar GRASON mengelola order Soscom langsung ke Ethix, di luar WACOS dan EPOS
- [ ] Format integrasi Ethix (API/webhook atau file sementara) dan PIC teknis di Ethix serta IT
- [ ] Jam cut-off harian pengiriman order ke Ethix
- [ ] Produk pilot yang pertama dipindah ke OMS GRASON
- [ ] Data pelanggan dan lead lama: dimigrasi dari WACOS atau mulai dari nol (berpengaruh ke deteksi repeat order dan riwayat RTS)
- [ ] Event pembelian ke Meta dikirim OMS langsung atau lewat ADV AI
- [ ] Developer pendamping yang menjalankan Claude Code dan memegang repo
- [ ] HPP resmi per SKU dari Finance
- [ ] VPS baru khusus OMS

## Bridging ke Claude Code

Blueprint ini dipecah jadi tiga bahan untuk Claude Code: struktur repo, file `CLAUDE.md` yang dibaca Claude Code di setiap sesi, dan satu prompt pembuka per fase. Kerjakan satu fase per sesi, mulai dengan mode rencana, lalu review rencana sebelum Claude Code menulis kode.

Struktur repo (monorepo):

```
grason-oms/
  CLAUDE.md
  docker-compose.yml
  apps/
    api/            # NestJS: lead, order, stok, COD, profit, CS
    web/            # Next.js dashboard
    worker/         # BullMQ: job integrasi dan sinkronisasi
  packages/
    db/             # skema Prisma + migrasi + seed data contoh
    shared/         # tipe & status bersama
    simulator/      # CS AI, ADV AI, Ethix palsu (Fase 1-2), memanggil API sesuai kontrak
    integrations/   # adaptor nyata, dibangun di Fase 3
      ethix/        # API Ethix + fallback file CSV
      cs-ai/        # webhook ke SaaS CS AI
      adv-ai/       # tarikan spend iklan + event pembelian ke Meta
  docs/
    blueprint.md    # salinan dokumen ini
    api-contract/   # spesifikasi OpenAPI untuk CS AI, ADV AI, Ethix
    decisions/      # catatan keputusan per fase
```

Isi awal `CLAUDE.md`:

```markdown
# OMS GRASON
OMS internal GRASON (PT Etos Kreatif Indonesia) untuk order Soscom:
lead & order dari SaaS CS AI dan CS manusia, dikirim langsung ke WMS Ethix.
Shopee & TikTok Shop menyusul di v2.
Blueprint lengkap: docs/blueprint.md. Baca sebelum mengubah skema atau alur status.

## Aturan tetap
- TypeScript strict di semua app. Uang = integer rupiah.
- Stok fisik bersumber dari WMS Ethix; OMS tidak pernah mengubah stok gudang.
- Data dari sistem lain unik di (sumber, external_id); semua job integrasi idempotent.
- Status OMS: baru, terverifikasi, di_gudang, dikirim, terkirim, selesai, batal, rts.
- Order COD baru selesai saat COD cair cocok dengan nilai order.
- Setiap order membawa entitas (SSR/FHI) dari produknya.
- Kontrak API untuk CS AI dan Ethix ada di docs/api-contract; perubahan = versi baru.
- Waktu disimpan UTC, ditampilkan Asia/Jakarta.
- Secret (API key, token) hanya di .env, tidak pernah di repo.

## Cara kerja
- Setiap fitur disertai tes. Jalankan `pnpm test` sebelum menyatakan selesai.
- Perubahan skema = migrasi Prisma baru, tidak mengedit migrasi lama.
- Catat keputusan desain di docs/decisions/.
- UI berbahasa Indonesia.
```

Urutan prompt pembuka per fase:

1. **Fase 0 – Fondasi & kontrak data:** "Baca CLAUDE.md dan docs/blueprint.md. Buat monorepo, docker-compose (Postgres, Redis), skema Prisma sesuai bagian Model data, seed 4 produk GRASON dengan entitasnya, login + role + API key. Tulis spesifikasi OpenAPI untuk SaaS CS AI, ADV AI, dan Ethix di docs/api-contract. Rencanakan dulu, tunggu persetujuan."
2. **Fase 1 – OMS + simulator:** "Bangun modul lead, order, verifikasi COD, alur status, stok, dan dashboard. Buat packages/simulator yang memanggil API OMS persis sesuai kontrak: CS AI palsu membuat lead dan order, Ethix palsu mengirim status, resi, RTS, dan stok. Sertakan tes setiap transisi status."
3. **Fase 2 – Profit, ROAS & kinerja CS:** "Tambahkan laporan COD dan spend iklan ke simulator. Bangun rekonsiliasi COD per resi, analisis RTS, GP per order, ROAS riil per iklan, dan dashboard kinerja CS AI vs CS manusia."
4. **Fase 3 – Semua integrasi:** "Bangun adaptor nyata di packages/integrations untuk SaaS CS AI, ADV AI (termasuk event pembelian ke Meta), dan Ethix dengan fallback CSV. Jalankan tes kontrak yang sama dengan simulator. Semua idempotent dan tercatat di integration\_events."
5. **Fase 4 – Pilot:** "Siapkan staging, skrip rekonsiliasi OMS vs EPOS selama jalan paralel, backup harian, monitoring, dan checklist go-live untuk produk pilot."
