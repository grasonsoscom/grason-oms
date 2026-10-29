-- OMS tidak memegang uang (docs/decisions/0003-oms-tanpa-uang.md).
-- Pencairan COD, HPP, dan profit tetap di alur Finance–Ethix.
-- Status akhir sukses = terkirim; status `selesai` dihapus.

-- Data lama: order/riwayat berstatus selesai menjadi terkirim.
UPDATE "orders" SET "status" = 'terkirim' WHERE "status" = 'selesai';
UPDATE "order_status_history" SET "dari_status" = 'terkirim' WHERE "dari_status" = 'selesai';
UPDATE "order_status_history" SET "ke_status" = 'terkirim' WHERE "ke_status" = 'selesai';
-- Riwayat terkirim → selesai menjadi terkirim → terkirim; tidak bermakna lagi.
DELETE FROM "order_status_history" WHERE "dari_status" = 'terkirim' AND "ke_status" = 'terkirim';

-- AlterEnum
CREATE TYPE "OrderStatus_new" AS ENUM ('baru', 'terverifikasi', 'di_gudang', 'dikirim', 'terkirim', 'batal', 'rts');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TABLE "order_status_history" ALTER COLUMN "dari_status" TYPE "OrderStatus_new" USING ("dari_status"::text::"OrderStatus_new");
ALTER TABLE "order_status_history" ALTER COLUMN "ke_status" TYPE "OrderStatus_new" USING ("ke_status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'baru';

-- selesai_at → terkirim_at. Nilai lama (waktu COD cair) bukan waktu terkirim,
-- jadi diisi dari waktu terima di shipments bila ada.
ALTER TABLE "orders" RENAME COLUMN "selesai_at" TO "terkirim_at";
UPDATE "orders" o SET "terkirim_at" = s."diterima_at"
FROM "shipments" s
WHERE s."order_id" = o."id" AND s."diterima_at" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "product_costs" DROP CONSTRAINT "product_costs_product_id_fkey";
ALTER TABLE "product_costs" DROP CONSTRAINT "product_costs_dibuat_oleh_id_fkey";
ALTER TABLE "cod_settlements" DROP CONSTRAINT "cod_settlements_shipment_id_fkey";
ALTER TABLE "cod_settlements" DROP CONSTRAINT "cod_settlements_order_id_fkey";
ALTER TABLE "order_costs" DROP CONSTRAINT "order_costs_order_id_fkey";

-- DropTable
DROP TABLE "product_costs";
DROP TABLE "cod_settlements";
DROP TABLE "order_costs";
