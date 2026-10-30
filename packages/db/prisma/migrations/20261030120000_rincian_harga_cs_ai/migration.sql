-- Rincian harga COD dan segmen dari GrasOn AI Chat (cs-ai.v2, keputusan 0006).
-- Order lama (cs-ai.v1, dashboard) mendapat 0 dan segmen kosong.
-- CreateEnum
CREATE TYPE "Segmen" AS ENUM ('nc', 'ro', 'reseller');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "segmen" "Segmen";

-- AlterTable
ALTER TABLE "order_groups" ADD COLUMN     "biaya_cod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subsidi_admin_cod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subsidi_ongkir" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "biaya_cod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "segmen" "Segmen",
ADD COLUMN     "subsidi_admin_cod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subsidi_ongkir" INTEGER NOT NULL DEFAULT 0;

