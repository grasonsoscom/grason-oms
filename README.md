# OMS GRASON

OMS internal GRASON untuk order Soscom. Lihat [CLAUDE.md](CLAUDE.md) untuk aturan tetap
dan [docs/blueprint.md](docs/blueprint.md) untuk desain lengkap.

## Persiapan

Butuh Node 24+, pnpm 12, dan Docker.

```bash
cp .env.example .env   # lalu ganti semua nilai GANTI_…
pnpm install
pnpm infra:up          # Postgres 16 (port 5433) + Redis 7 (port 6380)
pnpm db:deploy         # terapkan migrasi
pnpm db:seed           # 6 role, 4 produk + paket, akun Orkestrator dari .env
pnpm build
pnpm dev               # API :3001, web :3000, worker
```

## Demo dengan data dummy

Isi `DEMO_MODE=true` dan `DEMO_PASSWORD` di `.env` (jangan di produksi), jalankan
`pnpm dev`, lalu di terminal lain:

```bash
pnpm demo:reset        # kosongkan data dummy, buat akun demo, isi 200 lead dalam 7 hari
pnpm sim --lead 100    # tambah data kapan saja; opsi lengkap di packages/simulator
```

Akun demo (password = `DEMO_PASSWORD`): `orkestrator@`, `finance@`, `sales-ops@`,
`cs-leader@`, `cs1@`–`cs3@`, `pic-iklan@` dengan domain `demo.grason.local`.

## API key

Buat API key untuk sistem luar (kunci hanya tampil sekali):

```bash
pnpm apikey:create --sistem cs_ai --nama "Simulator CS AI"
```

API key hanya diterima di endpoint kontrak sesuai scope-nya, dibatasi 60 permintaan per
menit (`RATE_LIMIT_API_KEY_PER_MENIT`), dan tidak bisa mengatur waktu lewat X-Sim-Waktu
([0005](docs/decisions/0005-api-key-untuk-tunnel.md)).

## Uji sambung dengan sistem nyata (Fase 3)

Data nyata dari GrasOn AI Chat tidak boleh masuk database demo, karena Ethix palsu di
simulator akan memprosesnya ([0007](docs/decisions/0007-fase-3-integrasi-cs-ai.md)).
Pakai lingkungan terpisah:

```bash
pnpm uji:siapkan                       # buat .env.uji, database grason_oms_uji, migrasi, seed
pnpm uji                               # API :3002, worker, web :3003 (Ctrl+C untuk berhenti)
pnpm uji apikey --sistem cs_ai --nama "SaaS CS AI - …"
```

- Isi `CS_AI_WEBHOOK_URL` di `.env.uji` setelah tim AI Chat memberi URL webhook-nya;
  `CS_AI_WEBHOOK_SECRET` dibuat acak oleh `uji:siapkan` dan diberikan ke mereka lewat
  jalur pribadi.
- Arahkan tunnel ke port 3002 dan teruskan hanya path kontrak CS AI: `/api/v1/*` dan
  `/api/v2/*` untuk `leads`, `orders`, `stock`, `prices`, serta `/api/v1/sistem/saya` dan
  `/api/v1/health`. Login dan dashboard tidak perlu dibuka.
- Pantau di halaman **Integrasi** (http://localhost:3003/integrasi, Orkestrator).
- Panduan untuk tim AI Chat: [docs/integrasi/cs-ai.md](docs/integrasi/cs-ai.md).

## Struktur

| Folder                  | Isi                                                              |
| ----------------------- | ---------------------------------------------------------------- |
| `apps/api`              | NestJS: auth, lead, order, status, stok, API kontrak & dashboard |
| `apps/web`              | Next.js dashboard (UI berbahasa Indonesia)                       |
| `apps/worker`           | BullMQ: job integrasi dan sinkronisasi                           |
| `packages/db`           | Skema Prisma, migrasi, seed                                      |
| `packages/shared`       | Enum status, role, izin, scope, util bersama                     |
| `packages/simulator`    | CS AI, Ethix, CS manusia palsu (`pnpm sim`)                      |
| `packages/integrations` | Adaptor nyata (Fase 3)                                           |
| `docs/api-contract`     | OpenAPI untuk SaaS CS AI, ADV AI, Ethix                          |
| `docs/decisions`        | Catatan keputusan desain                                         |

## Tes

```bash
pnpm test
```

Butuh Postgres dan Redis dari `pnpm infra:up`. Tes memakai database `grason_oms_test`
yang dikosongkan sebelum tiap tes, jadi data dev tidak tersentuh.
