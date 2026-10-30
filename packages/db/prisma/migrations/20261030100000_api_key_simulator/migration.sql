-- Kunci simulator (pnpm demo:reset). Hanya kunci ini yang boleh mengirim X-Sim-Waktu.
ALTER TABLE "api_keys" ADD COLUMN "simulator" BOOLEAN NOT NULL DEFAULT false;
