import path from 'node:path';
import { buatPrismaClient } from '@grason/db';
import { config } from 'dotenv';
import { buatWorker, koneksiDariUrl } from './antrian';
import { mulaiWebhookCsAi } from './webhook-cs-ai';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const url = process.env.REDIS_URL;
if (!url) throw new Error('REDIS_URL belum diisi di .env');
const urlDb = process.env.DATABASE_URL;
if (!urlDb) throw new Error('DATABASE_URL belum diisi di .env');

const worker = buatWorker(koneksiDariUrl(url));
worker.on('ready', () => console.log('Worker OMS GRASON siap'));
worker.on('failed', (job, err) => console.error(`Job ${job?.name}#${job?.id} gagal:`, err.message));

const prisma = buatPrismaClient(urlDb);
const hentikanWebhook = mulaiWebhookCsAi(prisma, process.env);

async function berhenti(): Promise<void> {
  hentikanWebhook?.();
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void berhenti());
process.on('SIGTERM', () => void berhenti());
