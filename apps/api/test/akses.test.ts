import { ROLE, type Role } from '@grason/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buatAppUji, buatUser, login, loginSebagai, resetData, type KonteksUji } from './bantuan';

let ctx: KonteksUji;

beforeAll(async () => {
  ctx = await buatAppUji();
});

afterAll(async () => {
  await ctx.app.close();
});

beforeEach(async () => {
  await resetData(ctx.prisma);
});

describe('akses per role', () => {
  // [endpoint, role yang boleh]
  const matriks: [string, readonly Role[]][] = [
    ['/api/v1/users', ['orkestrator']],
    ['/api/v1/api-keys', ['orkestrator']],
    ['/api/v1/products', ROLE],
    ['/api/v1/customers', ['orkestrator', 'finance', 'sales_ops', 'cs_leader', 'pic_iklan']],
  ];

  for (const [endpoint, boleh] of matriks) {
    for (const role of ROLE) {
      const diizinkan = boleh.includes(role);
      it(`${role} ${diizinkan ? 'boleh' : 'ditolak'} GET ${endpoint}`, async () => {
        const cookie = await loginSebagai(ctx, role);
        const res = await ctx.http().get(endpoint).set('Cookie', cookie);
        expect(res.status).toBe(diizinkan ? 200 : 403);
        if (!diizinkan) expect(res.body.error.kode).toBe('tidak_diizinkan');
      });
    }
  }

  it('tanpa login ditolak 401', async () => {
    const res = await ctx.http().get('/api/v1/products').expect(401);
    expect(res.body.error.kode).toBe('tidak_terautentikasi');
  });

  it('health publik', async () => {
    await ctx.http().get('/api/v1/health').expect(200, { status: 'ok' });
  });
});

describe('data pribadi pelanggan', () => {
  beforeEach(async () => {
    await ctx.prisma.customer.create({
      data: {
        noWa: '6281234567890',
        nama: 'Siti',
        alamat: 'Jl. Melati 2',
        kelurahan: 'Sukajadi',
        kota: 'Bandung',
        provinsi: 'Jawa Barat',
        kodePos: '40162',
      },
    });
  });

  it.each(['finance', 'pic_iklan'] as const)(
    '%s melihat nomor WA dan alamat tersamar',
    async (role) => {
      const cookie = await loginSebagai(ctx, role);
      const res = await ctx.http().get('/api/v1/customers').set('Cookie', cookie).expect(200);
      const c = res.body.data[0];
      expect(c.noWa).toBe('62812****7890');
      expect(c.alamat).toBe('[disamarkan]');
      expect(c.kodePos).toBe('[disamarkan]');
      expect(c.kota).toBe('Bandung');
      expect(JSON.stringify(res.body)).not.toContain('Melati');
    },
  );

  it.each(['sales_ops', 'cs_leader', 'orkestrator'] as const)(
    '%s melihat data lengkap',
    async (role) => {
      const cookie = await loginSebagai(ctx, role);
      const res = await ctx.http().get('/api/v1/customers').set('Cookie', cookie).expect(200);
      expect(res.body.data[0]).toMatchObject({ noWa: '6281234567890', alamat: 'Jl. Melati 2' });
    },
  );
});

describe('kelola user', () => {
  it('Orkestrator membuat user baru, tercatat di audit, password tidak bocor', async () => {
    const admin = await loginSebagai(ctx, 'orkestrator');
    const res = await ctx
      .http()
      .post('/api/v1/users')
      .set('Cookie', admin)
      .send({
        email: 'Baru@Grason.Local',
        nama: 'CS Baru',
        role: 'cs',
        password: 'password-cs-baru',
      })
      .expect(201);
    expect(res.body).toMatchObject({ email: 'baru@grason.local', role: { kode: 'cs' } });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(await ctx.prisma.auditLog.count({ where: { aksi: 'user.buat' } })).toBe(1);
  });

  it('menolak email ganda dan password pendek', async () => {
    const admin = await loginSebagai(ctx, 'orkestrator');
    await buatUser(ctx.prisma, 'cs', 'ada@uji.local');
    await ctx
      .http()
      .post('/api/v1/users')
      .set('Cookie', admin)
      .send({ email: 'ada@uji.local', nama: 'X', role: 'cs', password: 'password-panjang' })
      .expect(409);
    await ctx
      .http()
      .post('/api/v1/users')
      .set('Cookie', admin)
      .send({ email: 'lain@uji.local', nama: 'X', role: 'cs', password: 'pendek' })
      .expect(400);
  });

  it('Orkestrator tidak bisa menonaktifkan dirinya sendiri', async () => {
    const admin = await buatUser(ctx.prisma, 'orkestrator');
    const cookie = await login(ctx, admin.email);
    await ctx
      .http()
      .patch(`/api/v1/users/${admin.id}`)
      .set('Cookie', cookie)
      .send({ aktif: false })
      .expect(400);
  });
});
