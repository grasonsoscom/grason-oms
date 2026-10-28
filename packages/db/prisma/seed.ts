import path from 'node:path';
import { config } from 'dotenv';
import { buatPrismaClient } from '../src';
import { seed } from '../src/seed';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL belum diisi di .env');

  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME } = process.env;
  const prisma = buatPrismaClient(url);
  try {
    await seed(prisma, {
      admin:
        SEED_ADMIN_EMAIL && SEED_ADMIN_PASSWORD
          ? {
              email: SEED_ADMIN_EMAIL,
              password: SEED_ADMIN_PASSWORD,
              nama: SEED_ADMIN_NAME ?? 'Orkestrator',
            }
          : undefined,
    });
    console.log('Seed selesai.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
