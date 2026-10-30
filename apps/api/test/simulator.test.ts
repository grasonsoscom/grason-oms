import type { AddressInfo } from 'node:net';
import { Simulasi, type KeadaanGudang } from '@grason/simulator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { AKUN_DEMO, pastikanBolehDemo, resetDemo } from '../src/demo/demo';
import { buatAppUji, buatUser, resetData, type KonteksUji } from './bantuan';

// Simulator dijalankan terhadap API sungguhan (port acak), persis seperti `pnpm sim`.

const PASSWORD = 'password-demo-panjang';
let ctx: KonteksUji;
let baseUrl: string;

beforeAll(async () => {
  process.env.DEMO_MODE = 'true';
  ctx = await buatAppUji();
  await ctx.app.listen(0);
  baseUrl = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await ctx.app.close();
  delete process.env.DEMO_MODE;
});

describe('demo:reset', () => {
  it('menolak jalan tanpa DEMO_MODE atau di produksi', () => {
    expect(() => pastikanBolehDemo({ DEMO_PASSWORD: PASSWORD })).toThrow('DEMO_MODE=true');
    expect(() =>
      pastikanBolehDemo({ DEMO_MODE: 'true', NODE_ENV: 'production', DEMO_PASSWORD: PASSWORD }),
    ).toThrow('produksi');
    expect(() => pastikanBolehDemo({ DEMO_MODE: 'true', DEMO_PASSWORD: 'pendek' })).toThrow(
      'minimal',
    );
  });

  it('mengosongkan data dummy, membuat akun demo per role, dan tidak menyentuh user lain', async () => {
    await resetData(ctx.prisma);
    const admin = await buatUser(ctx.prisma, 'orkestrator', 'admin@grason.local');
    const apiKeys = ctx.app.get(ApiKeysService);
    await apiKeys.buat({ nama: 'Kunci produksi CS AI', sistem: 'cs_ai' });

    await resetDemo(ctx.prisma, apiKeys, PASSWORD);
    const hasil = await resetDemo(ctx.prisma, apiKeys, PASSWORD); // aman diulang

    const users = await ctx.prisma.user.findMany({ include: { role: true } });
    expect(users.map((u) => u.email).sort()).toEqual(
      [admin.email, ...AKUN_DEMO.map((a) => a.email)].sort(),
    );
    const roleDemo = new Set(
      users.filter((u) => u.email.endsWith('@demo.grason.local')).map((u) => u.role.kode),
    );
    expect(roleDemo.size).toBe(6);
    const kunci = await ctx.prisma.apiKey.findMany({ orderBy: { nama: 'asc' } });
    expect(kunci.map((k) => k.nama)).toEqual([
      'Kunci produksi CS AI',
      'Simulator CS AI',
      'Simulator Ethix',
    ]);
    expect(hasil.kunci.csAi).toMatch(/^gok_/);
    expect(await ctx.prisma.product.count()).toBe(12);

    // Akun demo bisa login.
    await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'cs1@demo.grason.local', password: PASSWORD })
      .expect(200);
  });
});

describe('pnpm sim', () => {
  it('mengisi 7 hari ke belakang lewat API kontrak dengan campuran closing, handover, dan RTS', async () => {
    await resetData(ctx.prisma);
    const hasil = await resetDemo(ctx.prisma, ctx.app.get(ApiKeysService), PASSWORD);
    const akun = (role: string) => hasil.akun.filter((a) => a.role === role).map((a) => a.email);
    const sekarang = new Date();

    const opsi = {
      baseUrl,
      kunci: hasil.kunci,
      akun: {
        password: PASSWORD,
        csLeader: akun('cs_leader')[0]!,
        salesOps: akun('sales_ops')[0]!,
        cs: akun('cs'),
      },
      lead: 60,
      hari: 7,
      seed: 7,
      peluang: { rts: 0.3, handover: 0.2, campur: 0.3 },
      stokAwal: 300,
      sekarang,
      log: (p: string) => galat.push(p),
    };
    const galat: string[] = [];
    const laporan = await new Simulasi(opsi).jalankan();

    expect(galat.filter((g) => !g.startsWith('restock'))).toEqual([]);
    expect(laporan.galat).toBe(0);
    expect(laporan.lead).toBe(60);
    expect(await ctx.prisma.lead.count()).toBe(60);
    expect(laporan.order).toBeGreaterThan(10);

    // Data tersebar di 7 hari terakhir, tidak semuanya "sekarang".
    const leads = await ctx.prisma.lead.findMany({ select: { masukAt: true, createdAt: true } });
    const tertua = Math.min(...leads.map((l) => l.createdAt.getTime()));
    expect(sekarang.getTime() - tertua).toBeGreaterThan(4 * 86_400_000);
    for (const l of leads) expect(l.createdAt.getTime()).toBe(l.masukAt.getTime());
    // Lead tidak menumpuk di menit terakhir (jam setelah sekarang diundi ulang).
    const menitTerakhir = leads.filter(
      (l) => sekarang.getTime() - l.masukAt.getTime() < 2 * 60_000,
    );
    expect(menitTerakhir.length).toBeLessThanOrEqual(2);

    const perStatus = await ctx.prisma.order.groupBy({ by: ['status'], _count: true });
    const n = (s: string) => perStatus.find((p) => p.status === s)?._count ?? 0;
    expect(n('terkirim')).toBeGreaterThan(0);
    expect(n('rts')).toBeGreaterThan(0);
    expect(await ctx.prisma.lead.count({ where: { handover: true } })).toBeGreaterThan(0);
    expect(await ctx.prisma.lead.count({ where: { agen: 'cs_manusia' } })).toBeGreaterThan(0);
    expect(
      await ctx.prisma.orderGroup.count({
        where: {
          orders: { some: { entitas: 'SSR' } },
          AND: { orders: { some: { entitas: 'FHI' } } },
        },
      }),
    ).toBeGreaterThan(0);

    // Riwayat status selalu maju dan waktunya urut.
    const orders = await ctx.prisma.order.findMany({
      include: { statusHistory: { orderBy: { waktu: 'asc' } } },
    });
    for (const o of orders) {
      expect(o.statusHistory[0]!.keStatus).toBe('baru');
      expect(o.statusHistory.at(-1)!.keStatus).toBe(o.status);
    }

    // Seed sama di database kosong = data sama.
    const nomor = await ctx.prisma.order.findMany({
      select: { nomor: true, total: true },
      orderBy: { nomor: 'asc' },
    });
    await resetData(ctx.prisma);
    const ulang = await resetDemo(ctx.prisma, ctx.app.get(ApiKeysService), PASSWORD);
    await new Simulasi({ ...opsi, kunci: ulang.kunci }).jalankan();
    const nomorUlang = await ctx.prisma.order.findMany({
      select: { nomor: true, total: true },
      orderBy: { nomor: 'asc' },
    });
    expect(nomorUlang).toEqual(nomor);
  }, 180_000);
});

describe('akun demo', () => {
  it('memakai nama orang, bukan nama role', () => {
    const labelRole = ['orkestrator', 'finance', 'sales', 'cs leader', 'pic iklan', '(cs)', 'demo'];
    for (const a of AKUN_DEMO) {
      for (const l of labelRole) expect(a.nama.toLowerCase()).not.toContain(l);
    }
    expect(new Set(AKUN_DEMO.map((a) => a.nama)).size).toBe(AKUN_DEMO.length);
  });
});

describe('pnpm sim --langsung', () => {
  it('laju lead mengikuti jam nyata; hanya langkah proses yang dipercepat', async () => {
    await resetData(ctx.prisma);
    const hasil = await resetDemo(ctx.prisma, ctx.app.get(ApiKeysService), PASSWORD);
    const mulai = Date.now();
    // 3600 lead/jam = rata-rata 1 lead per detik, dipercepat 60×.
    const laporan = await new Simulasi({
      baseUrl,
      kunci: hasil.kunci,
      lead: 0,
      hari: 1,
      seed: 11,
      stokAwal: 100,
    }).jalankanLangsung({
      leadPerJam: 3600,
      percepat: 60,
      berhenti: () => Date.now() - mulai > 3000,
    });
    expect(laporan.galat).toBe(0);
    // Bila jeda lead ikut dipercepat, hasilnya ~180 lead dalam 3 detik.
    expect(laporan.lead).toBeGreaterThanOrEqual(1);
    expect(laporan.lead).toBeLessThanOrEqual(15);
  }, 30_000);

  it('melanjutkan order yang masih di gudang atau di jalan dari pengisian mundur', async () => {
    await resetData(ctx.prisma);
    const hasil = await resetDemo(ctx.prisma, ctx.app.get(ApiKeysService), PASSWORD);
    const dasar = { baseUrl, kunci: hasil.kunci, seed: 21, stokAwal: 300 };
    let gudang: KeadaanGudang | null = null;
    await new Simulasi({
      ...dasar,
      lead: 60,
      hari: 2,
      peluang: { closing: 0.8, rts: 0.3 },
      simpanGudang: (k) => (gudang = k),
    }).jalankan();
    expect(gudang).not.toBeNull();
    const g = gudang as unknown as KeadaanGudang;

    // Order di tengah jalan pasti punya langkah tertunda di gudang.
    const tengah = await ctx.prisma.order.findMany({
      where: { status: { in: ['di_gudang', 'dikirim'] } },
      select: { nomor: true },
    });
    expect(tengah.length).toBeGreaterThan(0);
    const nomorTertunda = new Set(g.tertunda.map((l) => l.event.order_nomor));
    for (const o of tengah) expect(nomorTertunda.has(o.nomor)).toBe(true);
    // Disimpan sebagai JSON lalu dibaca lagi, seperti lewat .demo/gudang-ethix.json.
    const dariFile = JSON.parse(JSON.stringify(g)) as KeadaanGudang;

    const mulai = Date.now();
    const langsung = new Simulasi({ ...dasar, seed: 22, lead: 0, hari: 1, gudang: dariFile });
    const laporan = await langsung.jalankanLangsung({
      leadPerJam: 0.01,
      percepat: 1_000_000,
      berhenti: () =>
        Date.now() - mulai > 20_000 ||
        langsung.keadaanGudang().tertunda.every((l) => !nomorTertunda.has(l.event.order_nomor)),
    });
    expect(laporan.galat).toBe(0);

    const akhir = await ctx.prisma.order.findMany({
      where: { nomor: { in: tengah.map((o) => o.nomor) } },
      select: { status: true },
    });
    for (const o of akhir) expect(['terkirim', 'rts']).toContain(o.status);
    // Order yang sudah ditarik tidak ditarik ulang (tidak ada event ganda yang ditolak).
    expect(langsung.keadaanGudang().dilihat.length).toBeGreaterThanOrEqual(g.dilihat.length);
  }, 60_000);
});
