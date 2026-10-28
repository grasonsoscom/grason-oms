import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export { hashPassword, cocokPassword, PANJANG_PASSWORD_MINIMAL } from './password';
export { seed, PRODUK_SATUAN, ISI_PAKET, skuPaket, type OpsiSeed } from './seed';

export function buatPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
