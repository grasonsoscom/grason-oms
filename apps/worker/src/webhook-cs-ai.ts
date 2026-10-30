import type { PrismaClient } from '@grason/db';
import { sapuOutbox } from '@grason/integrasi-cs-ai';

export const JEDA_SAPU_MS = 5_000;

/**
 * Kirim webhook order.status_changed ke SaaS CS AI dari outbox integration_events.
 * Tanpa CS_AI_WEBHOOK_URL dan CS_AI_WEBHOOK_SECRET tidak ada yang dikirim; event tetap
 * tercatat dan terkirim begitu konfigurasinya diisi.
 */
export function mulaiWebhookCsAi(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv,
  log: (pesan: string) => void = console.log,
): (() => void) | null {
  const url = env.CS_AI_WEBHOOK_URL;
  const secret = env.CS_AI_WEBHOOK_SECRET;
  if (!url || !secret) {
    log('Webhook CS AI tidak aktif (CS_AI_WEBHOOK_URL / CS_AI_WEBHOOK_SECRET kosong)');
    return null;
  }
  let jalan = false;
  const tik = setInterval(() => {
    if (jalan) return; // sapuan sebelumnya belum selesai
    jalan = true;
    sapuOutbox(prisma, { url, secret })
      .then((h) => {
        if (h.berhasil + h.diulang + h.gagal > 0) {
          log(`Webhook CS AI: ${h.berhasil} terkirim, ${h.diulang} diulang, ${h.gagal} gagal`);
        }
      })
      .catch((e: unknown) => log(`Webhook CS AI galat: ${e instanceof Error ? e.message : e}`))
      .finally(() => (jalan = false));
  }, JEDA_SAPU_MS);
  log(`Webhook CS AI aktif ke ${new URL(url).origin}`);
  return () => clearInterval(tik);
}
