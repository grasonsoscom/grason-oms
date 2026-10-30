# packages/simulator

CS AI, Ethix, dan CS manusia palsu untuk Fase 1–2. Simulator hanya memanggil OMS lewat
API yang sama dengan sistem nyata: CS AI dan Ethix memakai API key dan endpoint
`docs/api-contract/*.v1.yaml`; CS manusia login seperti user web. Pindah ke data nyata
cukup mengganti sumbernya.

```bash
pnpm demo:reset                      # kosongkan data, buat akun demo + kunci, lalu jalankan sim
pnpm sim --lead 200 --hari 7         # 200 lead dalam 7 hari terakhir
pnpm sim --lead 500 --hari 14 --rts 0.2 --handover 0.2 --seed 7
pnpm sim --langsung --lead-per-jam 30 --percepat 60   # jalan terus, Ctrl+C untuk berhenti
```

Butuh API hidup (`pnpm dev`) dengan `DEMO_MODE=true` di `.env`; tanpa itu header
`X-Sim-Waktu` diabaikan dan simulator berhenti dengan pesan galat.

| Opsi                                 | Default    | Arti                                                       |
| ------------------------------------ | ---------- | ---------------------------------------------------------- |
| `--lead`, `--hari`                   | 200, 7     | Jumlah lead dan rentang hari ke belakang                   |
| `--seed`                             | acak       | Seed sama di database kosong = data sama                   |
| `--closing`, `--gagal`, `--handover` | .45 .2 .12 | Nasib lead CS AI                                           |
| `--cod`, `--campur`                  | .85 .12    | Order COD; checkout campur SSR + FHI                       |
| `--rts`                              | .12        | Paket dikirim yang berakhir RTS                            |
| `--manual`, `--repeat`               | .1 .08     | Lead input CS manusia; pelanggan lama kembali              |
| `--stok-awal`                        | 150        | Stok awal SKU pertama di gudang palsu (SKU lain 50/25/12%) |

API key dibaca dari `SIM_CS_AI_KEY`/`SIM_ETHIX_KEY` di `.env`, atau dari
`.demo/kunci-simulator.json` yang ditulis `pnpm demo:reset`. Password akun demo dari
`DEMO_PASSWORD`.

Tipe kontrak di `src/kontrak/*.v1.ts` dibuat dari OpenAPI. Setelah kontrak berubah:

```bash
pnpm --filter @grason/simulator gen:kontrak
```
