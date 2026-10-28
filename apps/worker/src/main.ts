import path from 'node:path';
import { config } from 'dotenv';
import { buatWorker, koneksiDariUrl } from './antrian';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const url = process.env.REDIS_URL;
if (!url) throw new Error('REDIS_URL belum diisi di .env');

const worker = buatWorker(koneksiDariUrl(url));
worker.on('ready', () => console.log('Worker OMS GRASON siap'));
worker.on('failed', (job, err) => console.error(`Job ${job?.name}#${job?.id} gagal:`, err.message));

async function berhenti(): Promise<void> {
  await worker.close();
  process.exit(0);
}
process.on('SIGINT', () => void berhenti());
process.on('SIGTERM', () => void berhenti());
