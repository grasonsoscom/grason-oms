// Dibuat otomatis dari docs/api-contract oleh gen-kontrak.ts. Jangan diedit.

export interface paths {
    "/leads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Buat lead baru
         * @description Dipanggil saat percakapan baru masuk. ID iklan dari click-to-WhatsApp atau UTM
         *     landing page (lewat ADV AI) dibawa di sini; ini dasar ROAS dan kinerja CS.
         */
        post: operations["buatLead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/leads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID lead di OMS (dikembalikan saat lead dibuat). */
                id: components["parameters"]["IdLead"];
            };
            cookie?: never;
        };
        /** Ambil lead */
        get: operations["ambilLead"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update status lead, respon pertama, atau handover ke CS manusia
         * @description Hanya field yang dikirim yang diubah. `respon_pertama_at` hanya diisi sekali;
         *     kiriman berikutnya diabaikan. Handover tidak bisa dibatalkan lewat API ini.
         */
        patch: operations["ubahLead"];
        trace?: never;
    };
    "/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Buat order (checkout) dari lead
         * @description Satu permintaan = satu checkout. Bila item berisi produk SSR dan FHI, OMS
         *     membuat dua order dalam satu grup. Item paket (mis. isi 2) diterima apa adanya;
         *     OMS mengirimnya ke Ethix sebagai SKU komponen.
         *
         *     Order ditolak (422) bila stok tersedia tidak cukup atau SKU tidak dikenal.
         *     Order dari pelanggan bertanda riwayat RTS tetap dibuat, tetapi verifikasinya
         *     wajib oleh CS manusia (`perlu_verifikasi_manusia: true`).
         */
        post: operations["buatOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID order di OMS. */
                id: components["parameters"]["IdOrder"];
            };
            cookie?: never;
        };
        /** Status order, resi, dan posisi kiriman */
        get: operations["ambilOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{id}/verifikasi": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID order di OMS. */
                id: components["parameters"]["IdOrder"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tandai order terverifikasi
         * @description Pembeli sudah mengonfirmasi alamat lengkap, nilai COD, dan kesediaan bayar.
         *     Order COD baru dikirim ke Ethix setelah langkah ini. Ditolak (422,
         *     `perlu_verifikasi_manusia`) bila pelanggan bertanda riwayat RTS. Idempoten:
         *     memanggil ulang pada order yang sudah terverifikasi mengembalikan 200.
         */
        post: operations["verifikasiOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stok tersedia per SKU
         * @description Stok tersedia = stok fisik terakhir dari WMS Ethix − order yang sudah dibuat
         *     tetapi belum dialokasikan Ethix. Untuk paket: stok komponen dibagi isi paket,
         *     dibulatkan ke bawah.
         */
        get: operations["daftarStok"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Harga aktif per SKU */
        get: operations["daftarHarga"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface webhooks {
    "order.status_changed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * OMS memberi tahu perubahan status order ke SaaS CS AI
         * @description Dipakai CS AI untuk follow-up otomatis: resi terbit, gagal antar (pembeli
         *     dihubungi sebelum paket dikembalikan), COD ditolak, dan seterusnya.
         *
         *     **Keamanan:** `X-Oms-Signature` = `sha256=` + HMAC-SHA256 hex dari
         *     `<X-Oms-Timestamp>.<body mentah>` dengan secret webhook bersama. Tolak bila
         *     tanda tangan salah atau timestamp lebih dari 5 menit dari waktu sekarang.
         *
         *     **Pengiriman:** sukses bila CS AI membalas 2xx dalam 10 detik. Selain itu OMS
         *     mengulang dengan jeda bertahap (30 dtk, 1, 2, 4, … menit; maks. 8 kali).
         *     Event bisa terkirim lebih dari sekali; pakai `Idempotency-Key` (= `event_id`)
         *     untuk mengabaikan duplikat. Urutan tidak dijamin; pakai `terjadi_at`.
         */
        post: operations["webhookOrderStatusChanged"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface components {
    schemas: {
        Galat: {
            error: {
                /** @description Kode mesin, mis. `validasi_gagal`, `tidak_terautentikasi`, `stok_tidak_cukup`. */
                kode: string;
                /** @description Pesan untuk manusia (Bahasa Indonesia). */
                pesan: string;
                detail?: unknown;
            };
        };
        /**
         * @description Integer rupiah, tanpa desimal.
         * @example 95000
         */
        Rupiah: number;
        /**
         * Format: date-time
         * @description ISO-8601 UTC.
         * @example 2026-10-28T07:05:00Z
         */
        Waktu: string;
        /**
         * @description Nomor WhatsApp Indonesia. Respons OMS selalu `628…`.
         * @example 6281234567890
         */
        NoWa: string;
        /** @enum {string} */
        Entitas: "SSR" | "FHI";
        /** @enum {string} */
        StatusLead: "baru" | "direspon" | "follow_up" | "closing" | "gagal";
        /**
         * @description `terkirim` = paket diterima pembeli; status akhir sukses. OMS tidak mencatat
         *     pencairan COD (tetap antara Ethix dan Finance).
         * @enum {string}
         */
        StatusOrder: "baru" | "terverifikasi" | "di_gudang" | "dikirim" | "terkirim" | "batal" | "rts";
        /** @enum {string} */
        MetodeBayar: "cod" | "transfer";
        Atribusi: {
            /** @enum {string} */
            kanal?: "click_to_whatsapp" | "landing_page" | "organik" | "lainnya";
            /** @example 120210000000000001 */
            campaign_id?: string | null;
            adset_id?: string | null;
            /** @example 120210000000000003 */
            ad_id?: string | null;
        };
        LeadBaru: components["schemas"]["Atribusi"] & {
            /** @description ID percakapan/lead di SaaS CS AI. */
            external_id: string;
            /** @example 081234567890 */
            no_wa: string;
            nama?: string;
            /**
             * @description SKU produk yang pertama ditanyakan.
             * @example BSR-01
             */
            sku_ditanya?: string;
            masuk_at: components["schemas"]["Waktu"];
            catatan?: string;
        };
        UbahLead: {
            status?: components["schemas"]["StatusLead"];
            respon_pertama_at?: components["schemas"]["Waktu"];
            /** @description Oper lead ke CS manusia. Lead lalu muncul di antrian CS Leader. */
            handover?: {
                /** @example Pembeli minta bicara dengan manusia */
                alasan: string;
                terjadi_at?: components["schemas"]["Waktu"];
            };
            catatan?: string;
        };
        Lead: components["schemas"]["Atribusi"] & {
            /** Format: uuid */
            id: string;
            external_id: string;
            no_wa: components["schemas"]["NoWa"];
            nama?: string | null;
            /** @enum {string} */
            agen: "cs_ai" | "cs_manusia";
            status: components["schemas"]["StatusLead"];
            handover: boolean;
            handover_at?: components["schemas"]["Waktu"] | null;
            masuk_at: components["schemas"]["Waktu"];
            respon_pertama_at?: components["schemas"]["Waktu"] | null;
        };
        Alamat: {
            /** @description Jalan, nomor rumah, RT/RW, patokan. */
            alamat: string;
            kelurahan?: string;
            kecamatan?: string;
            /** @example Bandung */
            kota: string;
            /** @example Jawa Barat */
            provinsi: string;
            kode_pos?: string;
        };
        Penerima: {
            nama: string;
            no_wa: string;
        };
        ItemBaru: {
            /** @example VVG-P2 */
            sku: string;
            qty: number;
        };
        OrderBaru: {
            /** @description ID checkout di SaaS CS AI. */
            external_id: string;
            /**
             * Format: uuid
             * @description ID lead di OMS.
             */
            lead_id: string;
            metode_bayar: components["schemas"]["MetodeBayar"];
            penerima: components["schemas"]["Penerima"];
            alamat: components["schemas"]["Alamat"];
            items: components["schemas"]["ItemBaru"][];
            /** @description Ongkir yang dibebankan ke pembeli untuk seluruh checkout. */
            ongkir?: components["schemas"]["Rupiah"];
            /** @description Diskon untuk seluruh checkout. Pembagian ke order per entitas diatur OMS. */
            diskon?: components["schemas"]["Rupiah"];
            catatan?: string;
        };
        Verifikasi: {
            dikonfirmasi_at: components["schemas"]["Waktu"];
            /** @description Nilai COD yang disebut ke pembeli; harus sama dengan `nilai_cod` order. 0 untuk transfer. */
            nilai_cod_dikonfirmasi: components["schemas"]["Rupiah"];
            catatan?: string;
        };
        ItemOrder: {
            sku: string;
            nama: string;
            qty: number;
            harga_satuan: components["schemas"]["Rupiah"];
            diskon: components["schemas"]["Rupiah"];
            subtotal: components["schemas"]["Rupiah"];
        };
        Pengiriman: {
            /** @example JNE */
            kurir: string;
            resi: string;
            /** @description Status terakhir dari kurir, apa adanya. */
            status_kurir?: string | null;
            percobaan_antar?: number;
            dikirim_at?: components["schemas"]["Waktu"] | null;
            diterima_at?: components["schemas"]["Waktu"] | null;
        };
        Order: {
            /** Format: uuid */
            id: string;
            /** @example GRS-20261028-0001 */
            nomor: string;
            /** Format: uuid */
            order_group_id: string;
            external_id?: string | null;
            /** Format: uuid */
            lead_id?: string | null;
            entitas: components["schemas"]["Entitas"];
            status: components["schemas"]["StatusOrder"];
            metode_bayar: components["schemas"]["MetodeBayar"];
            /** @description Pelanggan punya riwayat RTS; verifikasi hanya oleh CS manusia. */
            perlu_verifikasi_manusia?: boolean;
            subtotal: components["schemas"]["Rupiah"];
            diskon: components["schemas"]["Rupiah"];
            ongkir: components["schemas"]["Rupiah"];
            total: components["schemas"]["Rupiah"];
            nilai_cod: components["schemas"]["Rupiah"];
            items: components["schemas"]["ItemOrder"][];
            pengiriman?: components["schemas"]["Pengiriman"] | null;
            dibuat_at: components["schemas"]["Waktu"];
            terverifikasi_at?: components["schemas"]["Waktu"] | null;
        };
        Checkout: {
            /** Format: uuid */
            order_group_id: string;
            external_id: string;
            /** @description Satu order per entitas. */
            orders: components["schemas"]["Order"][];
        };
        Stok: {
            sku: string;
            nama: string;
            /** @enum {string} */
            tipe: "satuan" | "paket";
            tersedia: number;
            /** @description Tersedia ÷ rata-rata terjual per hari 7 hari terakhir. */
            hari_cover?: number | null;
            /** @description Waktu sinkron stok Ethix terakhir. */
            diperbarui_at: components["schemas"]["Waktu"];
        };
        Harga: {
            sku: string;
            nama: string;
            /** @enum {string} */
            tipe: "satuan" | "paket";
            entitas: components["schemas"]["Entitas"];
            harga_jual: components["schemas"]["Rupiah"];
            /** @description Isi paket. Kosong untuk produk satuan. */
            komponen?: {
                sku: string;
                qty: number;
            }[];
        };
        EventStatusOrder: {
            /** Format: uuid */
            event_id: string;
            /** @constant */
            jenis: "order.status_changed";
            terjadi_at: components["schemas"]["Waktu"];
            data: {
                /** Format: uuid */
                order_id: string;
                nomor: string;
                /** Format: uuid */
                order_group_id: string;
                checkout_external_id?: string | null;
                /** Format: uuid */
                lead_id?: string | null;
                lead_external_id?: string | null;
                status_sebelum: components["schemas"]["StatusOrder"] | null;
                status: components["schemas"]["StatusOrder"];
                /**
                 * @description Konteks perubahan untuk follow-up, mis. `resi_terbit`, `gagal_antar`,
                 *     `cod_ditolak`, `dibatalkan_pembeli`.
                 * @example gagal_antar
                 */
                alasan?: string | null;
                kurir?: string | null;
                resi?: string | null;
                percobaan_antar?: number | null;
            };
        };
    };
    responses: {
        /** @description Data tidak valid. `error.detail` berisi daftar field dan pesannya. */
        ValidasiGagal: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "error": {
                 *         "kode": "validasi_gagal",
                 *         "pesan": "Data tidak valid",
                 *         "detail": [
                 *           {
                 *             "field": "no_wa",
                 *             "pesan": "Nomor WA tidak valid"
                 *           }
                 *         ]
                 *       }
                 *     }
                 */
                "application/json": components["schemas"]["Galat"];
            };
        };
        /** @description API key tidak ada, salah, atau sudah dicabut. */
        TidakTerautentikasi: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Galat"];
            };
        };
        /** @description API key tidak punya scope untuk endpoint ini. */
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
        /** @description Perubahan bertentangan dengan status saat ini. */
        Konflik: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Galat"];
            };
        };
    };
    parameters: {
        /** @description ID lead di OMS (dikembalikan saat lead dibuat). */
        IdLead: string;
        /** @description ID order di OMS. */
        IdOrder: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    buatLead: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeadBaru"];
            };
        };
        responses: {
            /** @description Lead dengan `external_id` ini sudah ada; data yang ada dikembalikan. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Lead"];
                };
            };
            /** @description Lead dibuat. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Lead"];
                };
            };
            400: components["responses"]["ValidasiGagal"];
            401: components["responses"]["TidakTerautentikasi"];
            403: components["responses"]["TidakDiizinkan"];
        };
    };
    ambilLead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID lead di OMS (dikembalikan saat lead dibuat). */
                id: components["parameters"]["IdLead"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Lead. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Lead"];
                };
            };
            401: components["responses"]["TidakTerautentikasi"];
            404: components["responses"]["TidakDitemukan"];
        };
    };
    ubahLead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID lead di OMS (dikembalikan saat lead dibuat). */
                id: components["parameters"]["IdLead"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UbahLead"];
            };
        };
        responses: {
            /** @description Lead setelah diubah. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Lead"];
                };
            };
            400: components["responses"]["ValidasiGagal"];
            401: components["responses"]["TidakTerautentikasi"];
            404: components["responses"]["TidakDitemukan"];
            409: components["responses"]["Konflik"];
        };
    };
    buatOrder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderBaru"];
            };
        };
        responses: {
            /** @description Checkout dengan `external_id` ini sudah ada; data yang ada dikembalikan. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Checkout"];
                };
            };
            /** @description Checkout dibuat. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Checkout"];
                };
            };
            400: components["responses"]["ValidasiGagal"];
            401: components["responses"]["TidakTerautentikasi"];
            403: components["responses"]["TidakDiizinkan"];
            /** @description Lead tidak ditemukan. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Galat"];
                };
            };
            /**
             * @description Order tidak dapat diproses. `error.kode`: `stok_tidak_cukup` (detail berisi SKU
             *     dan stok tersedia), `sku_tidak_dikenal`, atau `produk_nonaktif`.
             */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "error": {
                     *         "kode": "stok_tidak_cukup",
                     *         "pesan": "Stok tidak cukup",
                     *         "detail": [
                     *           {
                     *             "sku": "KKT-01",
                     *             "diminta": 3,
                     *             "tersedia": 1
                     *           }
                     *         ]
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["Galat"];
                };
            };
        };
    };
    ambilOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID order di OMS. */
                id: components["parameters"]["IdOrder"];
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
                    "application/json": components["schemas"]["Order"];
                };
            };
            401: components["responses"]["TidakTerautentikasi"];
            404: components["responses"]["TidakDitemukan"];
        };
    };
    verifikasiOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID order di OMS. */
                id: components["parameters"]["IdOrder"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Verifikasi"];
            };
        };
        responses: {
            /** @description Order terverifikasi. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            400: components["responses"]["ValidasiGagal"];
            401: components["responses"]["TidakTerautentikasi"];
            404: components["responses"]["TidakDitemukan"];
            /** @description Status order sudah melewati tahap verifikasi atau dibatalkan. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Galat"];
                };
            };
            /** @description `perlu_verifikasi_manusia` atau `nilai_cod_tidak_cocok`. */
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
    daftarStok: {
        parameters: {
            query?: {
                /** @description Satu atau lebih SKU, dipisah koma. Kosong = semua produk aktif. */
                sku?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stok per SKU. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Stok"][];
                    };
                };
            };
            401: components["responses"]["TidakTerautentikasi"];
        };
    };
    daftarHarga: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Harga aktif. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Harga"][];
                    };
                };
            };
            401: components["responses"]["TidakTerautentikasi"];
        };
    };
    webhookOrderStatusChanged: {
        parameters: {
            query?: never;
            header: {
                "X-Oms-Signature": string;
                /** @description Detik sejak epoch (UTC). */
                "X-Oms-Timestamp": number;
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventStatusOrder"];
            };
        };
        responses: {
            /** @description Diterima CS AI. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Payload atau tanda tangan tidak valid; OMS tidak mengulang. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
