import path from 'node:path';
import { QueueEvents } from 'bullmq';
import { config } from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';
import { buatAntrian, buatWorker, koneksiDariUrl } from '../src/antrian';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

describe('koneksiDariUrl', () => {
  it('membaca host, port, password, dan db', () => {
    expect(koneksiDariUrl('redis://:rah%40sia@redis.local:6380/2')).toMatchObject({
      host: 'redis.local',
      port: 6380,
      password: 'rah@sia',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });
});

describe('antrian integrasi', () => {
  const koneksi = koneksiDariUrl(process.env.REDIS_URL ?? 'redis://localhost:6380');
  // Nama antrian unik agar tes tidak mengganggu antrian dev.
  const nama = `uji-${process.pid}-${Date.now()}`;
  const antrian = buatAntrian(koneksi, nama);
  const worker = buatWorker(koneksi, nama);
  const events = new QueueEvents(nama, { connection: koneksi });

  afterAll(async () => {
    await worker.close();
    await events.close();
    await antrian.obliterate({ force: true });
    await antrian.close();
  });

  it('memproses job ping lewat Redis', async () => {
    const job = await antrian.add('ping', { dari: 'tes' });
    const hasil = await job.waitUntilFinished(events, 10_000);
    expect(hasil).toEqual({ pong: true, diterima: { dari: 'tes' } });
  });

  it('job tanpa pemroses gagal dengan pesan jelas', async () => {
    const job = await antrian.add('tidak_ada', {}, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow('Tidak ada pemroses');
  });
});
