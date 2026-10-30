import { hashPassword, PANJANG_PASSWORD_MINIMAL, seed, type PrismaClient } from '@grason/db';
import type { Role } from '@grason/shared';
import type { ApiKeysService } from '../api-keys/api-keys.service';

// pnpm demo:reset (keputusan 0004): kosongkan data dummy, isi ulang akun demo dan API key
// simulator. Hanya boleh di DEMO_MODE; user dan API key non-demo tidak disentuh.

export const DOMAIN_DEMO = 'demo.grason.local';
export const AWALAN_KUNCI_SIM = 'Simulator ';

export const AKUN_DEMO: readonly { email: string; nama: string; role: Role }[] = [
  { email: `orkestrator@${DOMAIN_DEMO}`, nama: 'Demo Orkestrator', role: 'orkestrator' },
  { email: `finance@${DOMAIN_DEMO}`, nama: 'Demo Finance', role: 'finance' },
  { email: `sales-ops@${DOMAIN_DEMO}`, nama: 'Demo Sales & Ops', role: 'sales_ops' },
  { email: `cs-leader@${DOMAIN_DEMO}`, nama: 'Demo CS Leader', role: 'cs_leader' },
  { email: `cs1@${DOMAIN_DEMO}`, nama: 'Ani (CS)', role: 'cs' },
  { email: `cs2@${DOMAIN_DEMO}`, nama: 'Bayu (CS)', role: 'cs' },
  { email: `cs3@${DOMAIN_DEMO}`, nama: 'Citra (CS)', role: 'cs' },
  { email: `pic-iklan@${DOMAIN_DEMO}`, nama: 'Demo PIC Iklan', role: 'pic_iklan' },
];

/** Tabel data transaksi yang dikosongkan. Produk, role, dan user non-demo tetap. */
const TABEL_DATA = [
  'order_status_history',
  'order_items',
  'shipments',
  'returns',
  'orders',
  'order_groups',
  'leads',
  'customers',
  'stock_snapshots',
  'ad_spend_daily',
  'integration_events',
  'order_number_counters',
] as const;

export interface HasilResetDemo {
  akun: { email: string; role: Role }[];
  kunci: { csAi: string; ethix: string };
}

export function pastikanBolehDemo(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === 'production')
    throw new Error('demo:reset tidak boleh dijalankan di produksi');
  if (env.DEMO_MODE !== 'true') {
    throw new Error('demo:reset hanya jalan bila DEMO_MODE=true di .env');
  }
  const password = env.DEMO_PASSWORD ?? '';
  if (password.length < PANJANG_PASSWORD_MINIMAL) {
    throw new Error(
      `DEMO_PASSWORD di .env wajib diisi, minimal ${PANJANG_PASSWORD_MINIMAL} karakter`,
    );
  }
  return password;
}

export async function resetDemo(
  prisma: PrismaClient,
  apiKeys: ApiKeysService,
  password: string,
): Promise<HasilResetDemo> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABEL_DATA.map((t) => `"${t}"`).join(', ')} CASCADE`,
  );

  const userDemo = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN_DEMO}` } },
    select: { id: true },
  });
  const kunciSim = await prisma.apiKey.findMany({
    where: { nama: { startsWith: AWALAN_KUNCI_SIM } },
    select: { id: true },
  });
  const idUser = userDemo.map((u) => u.id);
  const idKunci = kunciSim.map((k) => k.id);
  await prisma.$transaction([
    prisma.auditLog.deleteMany({
      where: { OR: [{ userId: { in: idUser } }, { apiKeyId: { in: idKunci } }] },
    }),
    prisma.apiKey.deleteMany({ where: { id: { in: idKunci } } }),
    prisma.apiKey.updateMany({
      where: { dibuatOlehId: { in: idUser } },
      data: { dibuatOlehId: null },
    }),
    prisma.session.deleteMany({ where: { userId: { in: idUser } } }),
    prisma.user.deleteMany({ where: { id: { in: idUser } } }),
  ]);

  await seed(prisma);
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.kode, r.id]));
  const hash = await hashPassword(password);
  for (const a of AKUN_DEMO) {
    await prisma.user.create({
      data: { email: a.email, nama: a.nama, passwordHash: hash, roleId: roles.get(a.role)! },
    });
  }

  const csAi = await apiKeys.buat({ nama: `${AWALAN_KUNCI_SIM}CS AI`, sistem: 'cs_ai' });
  const ethix = await apiKeys.buat({ nama: `${AWALAN_KUNCI_SIM}Ethix`, sistem: 'ethix' });
  return {
    akun: AKUN_DEMO.map((a) => ({ email: a.email, role: a.role })),
    kunci: { csAi: csAi.kunci, ethix: ethix.kunci },
  };
}
