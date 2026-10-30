-- Jadwal kirim ulang webhook keluar (Fase 3, keputusan 0007).
-- AlterTable
ALTER TABLE "integration_events" ADD COLUMN     "coba_lagi_at" TIMESTAMPTZ(3);

