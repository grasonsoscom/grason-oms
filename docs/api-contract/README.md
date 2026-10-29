# Kontrak API

| File                               | Untuk          | Isi                                                                         |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------- |
| [cs-ai.v1.yaml](cs-ai.v1.yaml)     | Tim SaaS CS AI | Lead, order, verifikasi, stok, harga; webhook `order.status_changed`        |
| [ethix.v1.yaml](ethix.v1.yaml)     | Ethix + IT     | Order ke Ethix (usulan endpoint Ethix), event pengiriman, stok              |
| [ethix-csv.v1.md](ethix-csv.v1.md) | Ethix + IT     | Format file CSV cadangan selama API Ethix belum siap                        |
| [adv-ai.v1.yaml](adv-ai.v1.yaml)   | Tim ADV AI     | Spend iklan harian, performa & ROAS riil per iklan, event pembelian (draft) |

Aturan:

- Versi ada di nama file. Perubahan yang tidak kompatibel = file versi baru
  (`cs-ai.v2.yaml`); versi lama tidak diubah. Penambahan field opsional boleh di versi
  yang sama dan dicatat di `docs/decisions/`.
- Field JSON di kontrak eksternal memakai `snake_case`.
- `pnpm contract:lint` (bagian dari `pnpm test`) memvalidasi ketiga spesifikasi.
- Simulator (`packages/simulator`, Fase 1) memanggil OMS persis sesuai file ini.
