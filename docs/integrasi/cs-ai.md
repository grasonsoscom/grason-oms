# Panduan integrasi GrasOn AI Chat → OMS GRASON

Untuk tim GrasOn AI Chat. Kontrak lengkap: [`docs/api-contract/cs-ai.v2.yaml`](../api-contract/cs-ai.v2.yaml).
Keputusan terkait: [0005](../decisions/0005-api-key-untuk-tunnel.md),
[0006](../decisions/0006-harga-cod-mengikuti-ai-chat.md),
[0007](../decisions/0007-fase-3-integrasi-cs-ai.md).

## Ringkasnya

- **AI Chat memanggil OMS** untuk lead, order, verifikasi, stok, dan harga.
- **OMS memanggil AI Chat** hanya untuk webhook `order.status_changed`.
- Selama uji sambung, order berhenti di `terverifikasi` atau `batal`; pengiriman lewat
  Ethix belum disambung.

## Alamat dan autentikasi

|          |                                                                                |
| -------- | ------------------------------------------------------------------------------ |
| Base URL | `https://<alamat tunnel>/api/v2` (dikabari tim OMS)                            |
| API key  | header `X-Api-Key: gok_…` atau `Authorization: Bearer gok_…`                   |
| Batas    | 60 permintaan per menit per API key; lewat batas → 429 + `Retry-After` (detik) |
| Format   | JSON, `snake_case`, uang integer rupiah, waktu ISO-8601 UTC                    |

Simpan API key di environment AI Chat (mis. `OMS_API_KEY`), jangan di repo. Cek kunci:
`GET /api/v1/sistem/saya`.

## Alur

1. **Chat baru masuk** → `POST /leads`. Simpan `id` OMS.
   ```json
   {
     "external_id": "conv-1234",
     "no_wa": "+6281234567890",
     "nama": "Siti",
     "masuk_at": "2026-10-30T07:05:00Z",
     "sku_ditanya": "BSR-01",
     "kanal": "click_to_whatsapp",
     "campaign_id": "1202…",
     "ad_id": "1203…",
     "segmen": "nc"
   }
   ```
2. **Status lead berubah** → `PATCH /leads/{id}`: `respon_pertama_at`, `status`
   (`direspon`, `follow_up`, `gagal`), atau `handover: { alasan }`. Status `closing` hanya
   lewat order.
3. **Sebelum menawarkan** → `GET /prices` dan `GET /stock`. Harga di AI Chat harus sama
   dengan `harga_jual` OMS; bila beda, order ditolak `total_tidak_cocok`.
4. **Pembeli setuju** → `POST /orders`. Isi rincian dari `codQuote` (`src/lib/promo.ts`):

   | OMS                 | AI Chat                                   |
   | ------------------- | ----------------------------------------- |
   | `ongkir`            | ongkir                                    |
   | `subsidi_ongkir`    | `shippingSubsidy`                         |
   | `biaya_cod`         | `codFee`                                  |
   | `subsidi_admin_cod` | `adminSubsidy`                            |
   | `total`             | `total`                                   |
   | `segmen`            | segmen pelanggan (`nc`, `ro`, `reseller`) |

   ```json
   {
     "external_id": "checkout-5678",
     "lead_id": "<id lead OMS>",
     "metode_bayar": "cod",
     "penerima": { "nama": "Siti", "no_wa": "+6281234567890" },
     "alamat": {
       "alamat": "Jl. Melati 2 RT 01/02",
       "kecamatan": "Sukajadi",
       "kota": "Bandung",
       "provinsi": "Jawa Barat",
       "kode_pos": "40162"
     },
     "items": [{ "sku": "BSR-01", "qty": 1 }],
     "ongkir": 30000,
     "subsidi_ongkir": 25000,
     "biaya_cod": 3750,
     "subsidi_admin_cod": 3750,
     "total": 100000,
     "segmen": "nc"
   }
   ```

   OMS memeriksa `total = subtotal − diskon + ongkir − subsidi_ongkir + biaya_cod −
subsidi_admin_cod` (subtotal dari harga OMS). Checkout berisi produk SSR dan FHI
   dipecah menjadi dua order dalam satu `order_group_id`; `nilai_cod` tiap order adalah
   bagiannya, jumlahnya sama dengan `total`.

5. **Pembeli konfirmasi COD** → `POST /orders/{id}/verifikasi` untuk **tiap** order di
   checkout, dengan `nilai_cod_dikonfirmasi` = `nilai_cod` order itu. Order dengan
   `perlu_verifikasi_manusia: true` (pelanggan pernah RTS) ditolak untuk CS AI; oper ke CS
   manusia.
6. **Status order** → `GET /orders/{id}`, atau tunggu webhook.

Kirim ulang dengan `external_id` yang sama aman: OMS mengembalikan data yang sudah ada
(HTTP 200), tidak membuat data baru.

## Kode galat

| HTTP | `error.kode`                                        | Arti                                                        |
| ---- | --------------------------------------------------- | ----------------------------------------------------------- |
| 400  | `validasi_gagal`                                    | Field salah; `error.detail` berisi field dan pesannya       |
| 401  | `tidak_terautentikasi`                              | API key salah atau dicabut                                  |
| 403  | `tidak_diizinkan`                                   | Endpoint di luar scope API key                              |
| 404  | `tidak_ditemukan`, `lead_tidak_ditemukan`           | ID tidak dikenal                                            |
| 409  | `closing_lewat_order`, `status_tidak_sesuai`        | Bertentangan dengan status saat ini                         |
| 422  | `stok_tidak_cukup`                                  | Detail: SKU, diminta, tersedia                              |
| 422  | `total_tidak_cocok`                                 | Detail: `total_dikirim`, `total_oms`, harga per item di OMS |
| 422  | `rincian_tidak_valid`                               | Subsidi melebihi pos, atau biaya COD pada transfer          |
| 422  | `nilai_cod_tidak_cocok`, `perlu_verifikasi_manusia` | Verifikasi ditolak                                          |
| 429  | `terlalu_banyak_permintaan`                         | Tunggu `Retry-After` detik                                  |

## Webhook `order.status_changed`

Kirim ke tim OMS: URL HTTPS endpoint webhook AI Chat. Tim OMS memberi secret bersama lewat
jalur pribadi (bukan chat grup atau repo).

Header: `X-Oms-Signature: sha256=<hex>`, `X-Oms-Timestamp: <detik epoch>`,
`Idempotency-Key: <event_id>`. Tanda tangan = HMAC-SHA256 dengan secret atas
`<X-Oms-Timestamp>.<body mentah>`.

- Balas 2xx dalam 10 detik. Selain itu OMS mengulang setelah 30 dtk, 1, 2, 4, 8, 16, 32,
  dan 64 menit. Balasan 400 dianggap final (tidak diulang).
- Event bisa datang lebih dari sekali dan tidak berurutan: abaikan `event_id` yang sudah
  diproses, pakai `terjadi_at`.

Contoh verifikasi (Next.js route handler):

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export async function POST(req: Request) {
  const body = await req.text(); // body mentah, sebelum JSON.parse
  const ts = Number(req.headers.get('x-oms-timestamp'));
  const ttd = req.headers.get('x-oms-signature') ?? '';
  const harap = `sha256=${createHmac('sha256', process.env.OMS_WEBHOOK_SECRET!)
    .update(`${ts}.${body}`)
    .digest('hex')}`;
  const segar = Math.abs(Date.now() / 1000 - ts) <= 300;
  const a = Buffer.from(harap);
  const b = Buffer.from(ttd);
  if (!segar || a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: 'Tanda tangan tidak valid' }, { status: 400 });
  }
  const event = JSON.parse(body);
  // … abaikan bila event.event_id sudah pernah diproses, lalu proses event.data
  return Response.json({ ok: true });
}
```

Vektor uji: secret `k`, timestamp `1793170000`, body `{"a":1}` →
`sha256=cf240dd54798699c0c9fb379a4d91e84b9c06d20bc1d399ba612925dbe60a6b4`.

## Langkah uji sambung

1. Tim OMS menyalakan lingkungan uji dan tunnel, lalu memberi base URL dan API key.
2. AI Chat: `GET /api/v1/sistem/saya` → nama kunci dan scope tampil.
3. Kirim satu lead, ubah statusnya, buat order COD dan transfer, lalu verifikasi.
4. Coba kasus galat: total salah, stok kurang, `external_id` dikirim ulang.
5. Setelah URL webhook dan secret disepakati: verifikasi atau batalkan order, lalu pastikan
   webhook diterima dan tanda tangannya cocok.
6. Rekonsiliasi: tim OMS mengekspor CSV dari halaman Integrasi (per `external_id`);
   AI Chat mencocokkan dengan datanya. Gerbang Fase 3: tidak ada selisih.
