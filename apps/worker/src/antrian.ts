import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';

/** Satu antrian untuk semua job integrasi; jenis job dibedakan lewat nama. */
export const ANTRIAN_INTEGRASI = 'integrasi';

/** Retry bertahap untuk semua job integrasi (blueprint: retry bertahap). */
export const OPSI_JOB_BAWAAN = {
  attempts: 8,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: false,
} as const;

export function koneksiDariUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    // Wajib null untuk Worker BullMQ.
    maxRetriesPerRequest: null,
  };
}

export type Pemroses = (job: Job) => Promise<unknown>;

/**
 * Pemroses per nama job. Fase 0 baru berisi `ping` untuk memeriksa jalur antrian.
 * Webhook ke CS AI tidak lewat antrian ini: worker menyapu outbox integration_events
 * (src/webhook-cs-ai.ts). Job Ethix ditambahkan saat API Ethix siap.
 */
export const PEMROSES: Record<string, Pemroses> = {
  ping: async (job) => ({ pong: true, diterima: job.data as unknown }),
};

export function buatAntrian(koneksi: ConnectionOptions, nama = ANTRIAN_INTEGRASI): Queue {
  return new Queue(nama, { connection: koneksi, defaultJobOptions: OPSI_JOB_BAWAAN });
}

export function buatWorker(koneksi: ConnectionOptions, nama = ANTRIAN_INTEGRASI): Worker {
  return new Worker(
    nama,
    async (job) => {
      const pemroses = PEMROSES[job.name];
      if (!pemroses) throw new Error(`Tidak ada pemroses untuk job "${job.name}"`);
      return pemroses(job);
    },
    { connection: koneksi, concurrency: 5 },
  );
}
