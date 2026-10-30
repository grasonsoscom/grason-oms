import type { PrismaClient } from '@grason/db';
import { JADWAL_ULANG_MS, kirimWebhook, type HasilKirim } from './webhook';

/** Lama sewa saat event sedang dikirim; event yang tertahan lebih lama diambil lagi. */
const SEWA_MS = 60_000;

export interface OpsiSapu {
  url: string;
  secret: string;
  batas?: number;
  sekarang?: () => Date;
  kirim?: typeof kirimWebhook;
}

export interface HasilSapu {
  berhasil: number;
  diulang: number;
  gagal: number;
}

/**
 * Kirim webhook order.status_changed yang tercatat di integration_events (outbox).
 * Event yang jatuh tempo: status diterima dengan coba_lagi_at kosong atau sudah lewat,
 * atau diproses dengan sewa yang habis (worker berhenti di tengah pengiriman).
 */
export async function sapuOutbox(prisma: PrismaClient, opsi: OpsiSapu): Promise<HasilSapu> {
  const kini = () => opsi.sekarang?.() ?? new Date();
  const kirim = opsi.kirim ?? kirimWebhook;
  const hasil: HasilSapu = { berhasil: 0, diulang: 0, gagal: 0 };
  const jatuhTempo = await prisma.integrationEvent.findMany({
    where: {
      sistem: 'cs_ai',
      arah: 'keluar',
      OR: [
        { status: 'diterima', OR: [{ cobaLagiAt: null }, { cobaLagiAt: { lte: kini() } }] },
        { status: 'diproses', cobaLagiAt: { lte: kini() } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: opsi.batas ?? 50,
  });

  for (const ev of jatuhTempo) {
    // Klaim: hanya satu worker yang mengirim event ini.
    const klaim = await prisma.integrationEvent.updateMany({
      where: { id: ev.id, status: ev.status, cobaLagiAt: ev.cobaLagiAt },
      data: { status: 'diproses', cobaLagiAt: new Date(kini().getTime() + SEWA_MS) },
    });
    if (klaim.count === 0) continue;

    const r: HasilKirim = await kirim({
      url: opsi.url,
      secret: opsi.secret,
      eventId: ev.idempotencyKey,
      payload: ev.payload,
      sekarang: kini(),
    });
    const percobaan = ev.percobaan + 1;
    if (r.ok) {
      hasil.berhasil += 1;
      await prisma.integrationEvent.update({
        where: { id: ev.id },
        data: { status: 'berhasil', percobaan, error: null, cobaLagiAt: null, diprosesAt: kini() },
      });
    } else if (r.ulang && percobaan <= JADWAL_ULANG_MS.length) {
      hasil.diulang += 1;
      await prisma.integrationEvent.update({
        where: { id: ev.id },
        data: {
          status: 'diterima',
          percobaan,
          error: r.galat,
          cobaLagiAt: new Date(kini().getTime() + JADWAL_ULANG_MS[percobaan - 1]!),
        },
      });
    } else {
      hasil.gagal += 1;
      await prisma.integrationEvent.update({
        where: { id: ev.id },
        data: { status: 'gagal', percobaan, error: r.galat, cobaLagiAt: null, diprosesAt: kini() },
      });
    }
  }
  return hasil;
}
