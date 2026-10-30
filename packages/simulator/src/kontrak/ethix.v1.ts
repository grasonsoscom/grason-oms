// Dibuat otomatis dari docs/api-contract oleh gen-kontrak.ts. Jangan diedit.

export interface paths {
    "/oms-grason/v1/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * OMS mengirim order siap kirim ke Ethix
         * @description Dikirim seketika setelah order Terverifikasi; order setelah jam cut-off ikut
         *     batch hari berikutnya. Kiriman ulang dengan `order_nomor` dan isi yang sama
         *     mengembalikan 200 dengan `ethix_ref` yang sama. Isi berbeda untuk `order_nomor`
         *     yang sudah ada = 409.
         */
        post: operations["ethixTerimaOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/oms-grason/v1/orders/{ethix_ref}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ethix_ref: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** OMS membatalkan order sebelum dikemas */
        post: operations["ethixBatalkanOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ethix/shipment-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ethix mengirim event status gudang & kurir
         * @description Batch berisi 1–500 event. Tiap event diproses terpisah: event yang gagal tidak
         *     menggagalkan event lain dalam batch. Event dengan `event_id` yang sudah pernah
         *     diterima dihitung sebagai `duplikat` dan diabaikan.
         *
         *     Pemetaan ke status OMS:
         *     | `jenis` | Status OMS |
         *     | --- | --- |
         *     | `diterima_gudang` | di_gudang |
         *     | `dikemas` | di_gudang (dicatat di riwayat) |
         *     | `dikirim` (wajib `resi` + `kurir`) | dikirim |
         *     | `terkirim` | terkirim (status akhir sukses) |
         *     | `gagal_antar` | tetap dikirim; OMS memberi tahu CS AI |
         *     | `rts` | rts |
         *     | `diterima_kembali` | rts (barang kembali di gudang, isi `kondisi_barang`) |
         */
        post: operations["kirimEventPengiriman"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ethix/stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ethix mengirim stok per SKU
         * @description Dikirim tiap 15 menit dan setiap kali stok berubah. Berisi SKU komponen GRASON
         *     saja. Snapshot dengan `snapshot_at` lebih lama dari snapshot terakhir yang
         *     tersimpan diabaikan.
         */
        post: operations["kirimStok"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ethix/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Order yang ditujukan ke Ethix
         * @description Untuk polling bila Ethix tidak menerima push, dan untuk rekonsiliasi.
         */
        get: operations["daftarOrderEthix"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ethix/orders/{order_nomor}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_nomor: string;
            };
            cookie?: never;
        };
        /** Satu order yang ditujukan ke Ethix */
        get: operations["ambilOrderEthix"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Galat: {
            error: {
                kode: string;
                pesan: string;
                detail?: unknown;
            };
        };
        /**
         * @description Integer rupiah, tanpa desimal.
         * @example 42000
         */
        Rupiah: number;
        /**
         * Format: date-time
         * @description ISO-8601 UTC.
         * @example 2026-10-28T07:05:00Z
         */
        Waktu: string;
        OrderEthix: {
            /**
             * @description Nomor order OMS; kunci idempotensi di Ethix.
             * @example GRS-20261028-0001
             */
            order_nomor: string;
            /**
             * @description Entitas pemilik barang.
             * @enum {string}
             */
            entitas: "SSR" | "FHI";
            /** @enum {string} */
            metode_bayar: "cod" | "transfer";
            /** @description Nilai yang ditagih kurir ke pembeli. 0 untuk transfer. */
            nilai_cod: components["schemas"]["Rupiah"];
            penerima: {
                nama: string;
                /** @example 6281234567890 */
                no_hp: string;
            };
            alamat: {
                alamat: string;
                kelurahan?: string | null;
                kecamatan?: string | null;
                kota: string;
                provinsi: string;
                kode_pos?: string | null;
            };
            /** @description SKU komponen; paket sudah diurai OMS. */
            items: {
                /** @example VVG-01 */
                sku: string;
                qty: number;
            }[];
            berat_gram: number;
            catatan?: string | null;
            dibuat_at: components["schemas"]["Waktu"];
            /**
             * @description Hanya di respons `GET /ethix/orders`.
             * @enum {string}
             */
            status?: "siap_kirim" | "batal";
        };
        TerimaOrderEthix: {
            order_nomor: string;
            /** @description ID order di WMS Ethix; disimpan OMS di `orders.ethix_ref`. */
            ethix_ref: string;
            /** @constant */
            status: "diterima";
        };
        EventPengiriman: {
            /** @description ID unik event di Ethix; kunci idempotensi. */
            event_id: string;
            order_nomor: string;
            ethix_ref?: string | null;
            /** @enum {string} */
            jenis: "diterima_gudang" | "dikemas" | "dikirim" | "terkirim" | "gagal_antar" | "rts" | "diterima_kembali";
            terjadi_at: components["schemas"]["Waktu"];
            /**
             * @description Wajib untuk `dikirim`.
             * @example JNE
             */
            kurir?: string | null;
            /** @description Wajib untuk `dikirim`. */
            resi?: string | null;
            /** @description Status asli dari kurir, apa adanya. */
            status_kurir?: string | null;
            percobaan_antar?: number | null;
            /** @description Wajib untuk `gagal_antar` dan `rts`, mis. "alamat tidak ditemukan", "COD ditolak". */
            alasan?: string | null;
            /**
             * @description Untuk `diterima_kembali`.
             * @enum {string|null}
             */
            kondisi_barang?: "layak_jual" | "rusak" | "tidak_lengkap" | null;
            /** @description Ongkir pengembalian, untuk `rts` atau `diterima_kembali`. */
            ongkir_balik?: components["schemas"]["Rupiah"] | null;
        };
        SnapshotStok: {
            snapshot_at: components["schemas"]["Waktu"];
            items: {
                sku: string;
                /** @description Stok fisik layak jual di gudang, termasuk retur yang sudah layak jual. */
                stok_layak_jual: number;
                /** @description Bagian dari `stok_layak_jual` yang berasal dari retur, bila Ethix memisahkannya. */
                stok_retur_layak?: number | null;
                /**
                 * @description Stok yang sudah dialokasikan ke order yang belum dikirim. Semantik final
                 *     menunggu konfirmasi Ethix (Fase 0).
                 */
                dialokasikan?: number | null;
            }[];
        };
        HasilBatch: {
            diterima: number;
            duplikat: number;
            gagal: {
                /** @description `event_id` atau `sku` yang gagal. */
                id: string;
                error: {
                    /** @example order_tidak_dikenal */
                    kode: string;
                    pesan: string;
                };
            }[];
        };
    };
    responses: {
        /** @description Data tidak valid. `error.detail` berisi daftar field dan pesannya. */
        ValidasiGagal: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Galat"];
            };
        };
        /** @description Kunci tidak ada, salah, atau sudah dicabut. */
        TidakTerautentikasi: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Galat"];
            };
        };
        /** @description Kunci tidak punya scope untuk endpoint ini. */
        TidakDiizinkan: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Galat"];
            };
        };
        /** @description Data tidak ditemukan. */
        TidakDitemukan: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Galat"];
            };
        };
        /** @description Data bertentangan dengan yang sudah ada. */
        Konflik: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Galat"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    ethixTerimaOrder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderEthix"];
            };
        };
        responses: {
            /** @description Order sudah pernah diterima; data yang ada dikembalikan. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TerimaOrderEthix"];
                };
            };
            /** @description Order diterima Ethix. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TerimaOrderEthix"];
                };
            };
            400: components["responses"]["ValidasiGagal"];
            401: components["responses"]["TidakTerautentikasi"];
            409: components["responses"]["Konflik"];
            /** @description Order tidak dapat diproses, mis. SKU tidak dikenal Ethix atau stok habis. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Galat"];
                };
            };
        };
    };
    ethixBatalkanOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ethix_ref: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    alasan: string;
                };
            };
        };
        responses: {
            /** @description Order dibatalkan (atau sudah batal sebelumnya). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ethix_ref: string;
                        /** @constant */
                        status: "batal";
                    };
                };
            };
            401: components["responses"]["TidakTerautentikasi"];
            404: components["responses"]["TidakDitemukan"];
            /** @description Order sudah dikemas atau dikirim; tidak bisa dibatalkan. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Galat"];
                };
            };
        };
    };
    kirimEventPengiriman: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    events: components["schemas"]["EventPengiriman"][];
                };
            };
        };
        responses: {
            /** @description Batch diproses. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HasilBatch"];
                };
            };
            400: components["responses"]["ValidasiGagal"];
            401: components["responses"]["TidakTerautentikasi"];
            403: components["responses"]["TidakDiizinkan"];
        };
    };
    kirimStok: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SnapshotStok"];
            };
        };
        responses: {
            /** @description Snapshot disimpan. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HasilBatch"];
                };
            };
            400: components["responses"]["ValidasiGagal"];
            401: components["responses"]["TidakTerautentikasi"];
            403: components["responses"]["TidakDiizinkan"];
        };
    };
    daftarOrderEthix: {
        parameters: {
            query?: {
                /** @description `siap_kirim` = terverifikasi dan belum dikonfirmasi diterima Ethix. */
                status?: "siap_kirim" | "batal";
                /** @description Hanya order yang berubah sejak waktu ini (UTC). */
                sejak?: string;
                kursor?: string;
                batas?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Daftar order. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["OrderEthix"][];
                        kursor_berikutnya?: string | null;
                    };
                };
            };
            401: components["responses"]["TidakTerautentikasi"];
            403: components["responses"]["TidakDiizinkan"];
        };
    };
    ambilOrderEthix: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_nomor: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Order. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderEthix"];
                };
            };
            401: components["responses"]["TidakTerautentikasi"];
            404: components["responses"]["TidakDitemukan"];
        };
    };
}
