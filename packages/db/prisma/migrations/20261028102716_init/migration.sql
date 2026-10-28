-- CreateEnum
CREATE TYPE "Entitas" AS ENUM ('SSR', 'FHI');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('baru', 'terverifikasi', 'di_gudang', 'dikirim', 'terkirim', 'selesai', 'batal', 'rts');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('baru', 'direspon', 'follow_up', 'closing', 'gagal');

-- CreateEnum
CREATE TYPE "MetodeBayar" AS ENUM ('cod', 'transfer');

-- CreateEnum
CREATE TYPE "Agen" AS ENUM ('cs_ai', 'cs_manusia');

-- CreateEnum
CREATE TYPE "Sumber" AS ENUM ('cs_ai', 'cs_manusia', 'ethix', 'adv_ai');

-- CreateEnum
CREATE TYPE "Sistem" AS ENUM ('cs_ai', 'ethix', 'adv_ai');

-- CreateEnum
CREATE TYPE "TipeProduk" AS ENUM ('satuan', 'paket');

-- CreateEnum
CREATE TYPE "JenisReturn" AS ENUM ('rts', 'retur');

-- CreateEnum
CREATE TYPE "ArahIntegrasi" AS ENUM ('masuk', 'keluar');

-- CreateEnum
CREATE TYPE "StatusIntegrasi" AS ENUM ('diterima', 'diproses', 'berhasil', 'gagal', 'duplikat');

-- CreateEnum
CREATE TYPE "TipePelaku" AS ENUM ('user', 'api_key', 'sistem');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tipe" "TipeProduk" NOT NULL DEFAULT 'satuan',
    "entitas" "Entitas" NOT NULL,
    "harga_jual" INTEGER NOT NULL,
    "berat_gram" INTEGER NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_costs" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "hpp" INTEGER NOT NULL,
    "berlaku_mulai" TIMESTAMPTZ(3) NOT NULL,
    "catatan" TEXT,
    "dibuat_oleh_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundles" (
    "id" UUID NOT NULL,
    "bundle_product_id" UUID NOT NULL,
    "component_product_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "no_wa" TEXT NOT NULL,
    "nama" TEXT,
    "alamat" TEXT,
    "kelurahan" TEXT,
    "kecamatan" TEXT,
    "kota" TEXT,
    "provinsi" TEXT,
    "kode_pos" TEXT,
    "tanda_rts" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "sumber" "Sumber" NOT NULL,
    "external_id" TEXT,
    "customer_id" UUID NOT NULL,
    "campaign_id" TEXT,
    "adset_id" TEXT,
    "ad_id" TEXT,
    "kanal" TEXT,
    "produk_ditanya_id" UUID,
    "agen" "Agen" NOT NULL,
    "cs_user_id" UUID,
    "status" "LeadStatus" NOT NULL DEFAULT 'baru',
    "handover" BOOLEAN NOT NULL DEFAULT false,
    "handover_at" TIMESTAMPTZ(3),
    "handover_alasan" TEXT,
    "masuk_at" TIMESTAMPTZ(3) NOT NULL,
    "respon_pertama_at" TIMESTAMPTZ(3),
    "catatan" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_groups" (
    "id" UUID NOT NULL,
    "sumber" "Sumber" NOT NULL,
    "external_id" TEXT,
    "lead_id" UUID,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "nomor" TEXT NOT NULL,
    "order_group_id" UUID NOT NULL,
    "sumber" "Sumber" NOT NULL,
    "external_id" TEXT,
    "lead_id" UUID,
    "customer_id" UUID NOT NULL,
    "agen" "Agen" NOT NULL,
    "cs_user_id" UUID,
    "entitas" "Entitas" NOT NULL,
    "metode_bayar" "MetodeBayar" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "diskon" INTEGER NOT NULL DEFAULT 0,
    "ongkir" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "nilai_cod" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'baru',
    "ethix_ref" TEXT,
    "catatan" TEXT,
    "penerima_nama" TEXT NOT NULL,
    "penerima_no_wa" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "kelurahan" TEXT,
    "kecamatan" TEXT,
    "kota" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL,
    "kode_pos" TEXT,
    "terverifikasi_at" TIMESTAMPTZ(3),
    "dikirim_ke_ethix_at" TIMESTAMPTZ(3),
    "selesai_at" TIMESTAMPTZ(3),
    "dibatalkan_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "harga_satuan" INTEGER NOT NULL,
    "diskon" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "dari_status" "OrderStatus",
    "ke_status" "OrderStatus" NOT NULL,
    "oleh_tipe" "TipePelaku" NOT NULL,
    "oleh_user_id" UUID,
    "oleh_api_key_id" UUID,
    "catatan" TEXT,
    "waktu" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kurir" TEXT NOT NULL,
    "resi" TEXT NOT NULL,
    "dikirim_at" TIMESTAMPTZ(3),
    "diterima_at" TIMESTAMPTZ(3),
    "percobaan_antar" INTEGER NOT NULL DEFAULT 0,
    "status_kurir" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "jenis" "JenisReturn" NOT NULL,
    "alasan" TEXT NOT NULL,
    "kondisi_barang" TEXT,
    "ongkir_balik" INTEGER NOT NULL DEFAULT 0,
    "diterima_gudang_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_snapshots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "stok_ethix" INTEGER NOT NULL,
    "stok_retur_layak" INTEGER NOT NULL DEFAULT 0,
    "disinkron_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_settlements" (
    "id" UUID NOT NULL,
    "sumber" "Sumber" NOT NULL DEFAULT 'ethix',
    "external_id" TEXT NOT NULL,
    "resi" TEXT NOT NULL,
    "shipment_id" UUID,
    "order_id" UUID,
    "nominal_cair" INTEGER NOT NULL,
    "potongan_cod" INTEGER NOT NULL DEFAULT 0,
    "potongan_ongkir" INTEGER NOT NULL DEFAULT 0,
    "tanggal_cair" DATE NOT NULL,
    "selisih" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cod_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_spend_daily" (
    "id" UUID NOT NULL,
    "sumber" "Sumber" NOT NULL DEFAULT 'adv_ai',
    "external_id" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "adset_id" TEXT,
    "ad_id" TEXT NOT NULL,
    "product_id" UUID,
    "spend" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ad_spend_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_costs" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "hpp" INTEGER NOT NULL,
    "biaya_iklan" INTEGER NOT NULL DEFAULT 0,
    "biaya_cod" INTEGER NOT NULL DEFAULT 0,
    "ongkir" INTEGER NOT NULL DEFAULT 0,
    "ongkir_rts" INTEGER NOT NULL DEFAULT 0,
    "dihitung_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" UUID NOT NULL,
    "sistem" "Sistem" NOT NULL,
    "arah" "ArahIntegrasi" NOT NULL,
    "jenis" TEXT NOT NULL,
    "external_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusIntegrasi" NOT NULL DEFAULT 'diterima',
    "percobaan" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "api_key_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diproses_at" TIMESTAMPTZ(3),

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "pelaku_tipe" "TipePelaku" NOT NULL,
    "user_id" UUID,
    "api_key_id" UUID,
    "aksi" TEXT NOT NULL,
    "objek_tipe" TEXT,
    "objek_id" TEXT,
    "sebelum" JSONB,
    "sesudah" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "login_terakhir_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "dicabut_at" TIMESTAMPTZ(3),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dipakai_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "nama" TEXT NOT NULL,
    "sistem" "Sistem" NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "dibuat_oleh_id" UUID,
    "dipakai_at" TIMESTAMPTZ(3),
    "dicabut_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_costs_product_id_berlaku_mulai_key" ON "product_costs"("product_id", "berlaku_mulai");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_bundle_product_id_component_product_id_key" ON "bundles"("bundle_product_id", "component_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_no_wa_key" ON "customers"("no_wa");

-- CreateIndex
CREATE INDEX "leads_ad_id_idx" ON "leads"("ad_id");

-- CreateIndex
CREATE INDEX "leads_cs_user_id_masuk_at_idx" ON "leads"("cs_user_id", "masuk_at");

-- CreateIndex
CREATE INDEX "leads_status_masuk_at_idx" ON "leads"("status", "masuk_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_sumber_external_id_key" ON "leads"("sumber", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_groups_sumber_external_id_key" ON "order_groups"("sumber", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_nomor_key" ON "orders"("nomor");

-- CreateIndex
CREATE UNIQUE INDEX "orders_ethix_ref_key" ON "orders"("ethix_ref");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_cs_user_id_created_at_idx" ON "orders"("cs_user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_entitas_created_at_idx" ON "orders"("entitas", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_sumber_external_id_key" ON "orders"("sumber", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_group_id_entitas_key" ON "orders"("order_group_id", "entitas");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_waktu_idx" ON "order_status_history"("order_id", "waktu");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_resi_key" ON "shipments"("resi");

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "returns_order_id_idx" ON "returns"("order_id");

-- CreateIndex
CREATE INDEX "stock_snapshots_product_id_disinkron_at_idx" ON "stock_snapshots"("product_id", "disinkron_at" DESC);

-- CreateIndex
CREATE INDEX "cod_settlements_resi_idx" ON "cod_settlements"("resi");

-- CreateIndex
CREATE UNIQUE INDEX "cod_settlements_sumber_external_id_key" ON "cod_settlements"("sumber", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_spend_daily_sumber_external_id_key" ON "ad_spend_daily"("sumber", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_spend_daily_tanggal_ad_id_key" ON "ad_spend_daily"("tanggal", "ad_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_costs_order_id_key" ON "order_costs"("order_id");

-- CreateIndex
CREATE INDEX "integration_events_status_created_at_idx" ON "integration_events"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_events_sistem_arah_idempotency_key_key" ON "integration_events"("sistem", "arah", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_logs_aksi_created_at_idx" ON "audit_logs"("aksi", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_objek_tipe_objek_id_idx" ON "audit_logs"("objek_tipe", "objek_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_kode_key" ON "roles"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- AddForeignKey
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_dibuat_oleh_id_fkey" FOREIGN KEY ("dibuat_oleh_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_bundle_product_id_fkey" FOREIGN KEY ("bundle_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_produk_ditanya_id_fkey" FOREIGN KEY ("produk_ditanya_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_cs_user_id_fkey" FOREIGN KEY ("cs_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_group_id_fkey" FOREIGN KEY ("order_group_id") REFERENCES "order_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cs_user_id_fkey" FOREIGN KEY ("cs_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_oleh_user_id_fkey" FOREIGN KEY ("oleh_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_oleh_api_key_id_fkey" FOREIGN KEY ("oleh_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_snapshots" ADD CONSTRAINT "stock_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_settlements" ADD CONSTRAINT "cod_settlements_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_settlements" ADD CONSTRAINT "cod_settlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_spend_daily" ADD CONSTRAINT "ad_spend_daily_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_costs" ADD CONSTRAINT "order_costs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_dibuat_oleh_id_fkey" FOREIGN KEY ("dibuat_oleh_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
