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

Buat API key untuk sistem luar (kunci hanya tampil sekali):

```bash
pnpm apikey:create --sistem cs_ai --nama "Simulator CS AI"
```

## Struktur

| Folder                  | Isi                                                             |
| ----------------------- | --------------------------------------------------------------- |
| `apps/api`              | NestJS: auth, role, API key; modul lead/order/stok/COD menyusul |
| `apps/web`              | Next.js dashboard (UI berbahasa Indonesia)                      |
| `apps/worker`           | BullMQ: job integrasi dan sinkronisasi                          |
| `packages/db`           | Skema Prisma, migrasi, seed                                     |
| `packages/shared`       | Enum status, role, izin, scope, util bersama                    |
| `packages/simulator`    | CS AI, ADV AI, Ethix palsu (Fase 1–2)                           |
| `packages/integrations` | Adaptor nyata (Fase 3)                                          |
| `docs/api-contract`     | OpenAPI untuk SaaS CS AI, ADV AI, Ethix                         |
| `docs/decisions`        | Catatan keputusan desain                                        |

## Tes

```bash
pnpm test
```

Butuh Postgres dan Redis dari `pnpm infra:up`. Tes memakai database `grason_oms_test`
yang dikosongkan sebelum tiap tes, jadi data dev tidak tersentuh.
