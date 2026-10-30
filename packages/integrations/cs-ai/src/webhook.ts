import { createHmac, timingSafeEqual } from 'node:crypto';

// Webhook order.status_changed ke SaaS CS AI, sesuai docs/api-contract/cs-ai.v2.yaml
// (bagian webhooks). Kirim ulang bertahap: 30 dtk, 1, 2, 4, … menit; maks. 8 kali ulang.

export const BATAS_WAKTU_MS = 10_000;
/** Jeda sebelum kirim ulang ke-1 … ke-8. */
export const JADWAL_ULANG_MS = [0.5, 1, 2, 4, 8, 16, 32, 64].map((m) => m * 60_000);
/** Selisih waktu maksimal yang diterima pihak penerima. */
export const TOLERANSI_DETIK = 5 * 60;

/** `sha256=` + HMAC-SHA256 hex dari `<timestamp>.<body mentah>`. */
export function tandaTangan(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/**
 * Pemeriksaan di sisi penerima (dipakai tes dan dicontohkan di docs/integrasi/cs-ai.md):
 * tanda tangan cocok dan timestamp tidak lebih dari 5 menit dari sekarang.
 */
export function verifikasiTandaTangan(opsi: {
  secret: string;
  tandaTangan: string;
  timestamp: string | number;
  body: string;
  sekarang?: Date;
}): boolean {
  const ts = Number(opsi.timestamp);
  const kini = Math.floor((opsi.sekarang ?? new Date()).getTime() / 1000);
  if (!Number.isInteger(ts) || Math.abs(kini - ts) > TOLERANSI_DETIK) return false;
  const a = Buffer.from(tandaTangan(opsi.secret, ts, opsi.body));
  const b = Buffer.from(opsi.tandaTangan);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type HasilKirim =
  | { ok: true; status: number }
  /** `ulang: false` = jangan dikirim ulang (400: payload atau tanda tangan ditolak). */
  | { ok: false; ulang: boolean; status: number | null; galat: string };

export async function kirimWebhook(opsi: {
  url: string;
  secret: string;
  eventId: string;
  payload: unknown;
  sekarang?: Date;
}): Promise<HasilKirim> {
  const body = JSON.stringify(opsi.payload);
  const ts = Math.floor((opsi.sekarang ?? new Date()).getTime() / 1000);
  let res: Response;
  try {
    res = await fetch(opsi.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-oms-signature': tandaTangan(opsi.secret, ts, body),
        'x-oms-timestamp': String(ts),
        'idempotency-key': opsi.eventId,
      },
      body,
      signal: AbortSignal.timeout(BATAS_WAKTU_MS),
    });
  } catch (e) {
    const pesan =
      e instanceof Error
        ? e.name === 'TimeoutError'
          ? 'Tidak dibalas dalam 10 detik'
          : e.message
        : String(e);
    return { ok: false, ulang: true, status: null, galat: pesan };
  }
  if (res.ok) return { ok: true, status: res.status };
  const isi = (await res.text().catch(() => '')).slice(0, 500);
  return {
    ok: false,
    ulang: res.status !== 400,
    status: res.status,
    galat: `HTTP ${res.status}${isi ? `: ${isi}` : ''}`,
  };
}
