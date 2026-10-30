-- Fase 1: total checkout di order_groups, verifikasi manusia & alasan batal di orders,
-- satu retur per jenis per order, dan penghitung nomor order harian (keputusan 0004).

-- DropIndex
DROP INDEX "returns_order_id_idx";

-- AlterTable
ALTER TABLE "order_groups" ADD COLUMN     "diskon" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "metode_bayar" "MetodeBayar",
ADD COLUMN     "ongkir" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "alasan_batal" TEXT,
ADD COLUMN     "perlu_verifikasi_manusia" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "order_number_counters" (
    "tanggal" DATE NOT NULL,
    "terakhir" INTEGER NOT NULL,

    CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("tanggal")
);

-- CreateIndex
CREATE UNIQUE INDEX "returns_order_id_jenis_key" ON "returns"("order_id", "jenis");

