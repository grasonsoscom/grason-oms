import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/common/token';
import {
  buatAppUji,
  buatUser,
  login,
  loginSebagai,
  PASSWORD_UJI,
  resetData,
  type KonteksUji,
} from './bantuan';

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

describe('login', () => {
  it('berhasil: cookie httpOnly, sesi tersimpan sebagai hash, tercatat di audit', async () => {
    const user = await buatUser(ctx.prisma, 'cs');
    const res = await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: '  CS@Uji.Local ', password: PASSWORD_UJI })
      .expect(200);

    expect(res.body.user).toMatchObject({ email: 'cs@uji.local', role: 'cs' });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^oms_sesi=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const token = decodeURIComponent(cookie.split(';')[0]!.slice('oms_sesi='.length));
    const sesi = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(sesi.tokenHash).toBe(sha256(token));
    expect(sesi.tokenHash).not.toBe(token);

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { aksi: 'auth.login', userId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('gagal dengan pesan yang sama untuk password salah dan email tak dikenal', async () => {
    await buatUser(ctx.prisma, 'cs');
    const salahPassword = await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'cs@uji.local', password: 'bukan-password-ini' })
      .expect(401);
    const tidakAda = await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'siapa@uji.local', password: 'bukan-password-ini' })
      .expect(401);
    expect(salahPassword.body).toEqual(tidakAda.body);
    expect(salahPassword.body.error.kode).toBe('tidak_terautentikasi');
    expect(salahPassword.headers['set-cookie']).toBeUndefined();
    expect(await ctx.prisma.auditLog.count({ where: { aksi: 'auth.login_gagal' } })).toBe(2);
  });

  it('menolak user nonaktif', async () => {
    const user = await buatUser(ctx.prisma, 'cs');
    await ctx.prisma.user.update({ where: { id: user.id }, data: { aktif: false } });
    await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD_UJI })
      .expect(401);
  });

  it('validasi body', async () => {
    const res = await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'bukan-email' })
      .expect(400);
    expect(res.body.error.kode).toBe('validasi_gagal');
  });
});

describe('sesi', () => {
  it('GET /auth/me butuh login', async () => {
    await ctx.http().get('/api/v1/auth/me').expect(401);
    const cookie = await loginSebagai(ctx, 'finance');
    const res = await ctx.http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(res.body).toMatchObject({ role: 'finance', roleLabel: 'Finance' });
    expect(res.body.izin).toContain('ekspor.entitas');
    expect(res.body.izin).not.toContain('apikey.kelola');
  });

  it('logout mencabut sesi', async () => {
    const cookie = await loginSebagai(ctx, 'cs');
    await ctx.http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    await ctx.http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('sesi kedaluwarsa ditolak', async () => {
    const cookie = await loginSebagai(ctx, 'cs');
    await ctx.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await ctx.http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('token palsu ditolak', async () => {
    await ctx.http().get('/api/v1/auth/me').set('Cookie', 'oms_sesi=palsu').expect(401);
  });

  it('menonaktifkan user mencabut semua sesinya seketika', async () => {
    const admin = await loginSebagai(ctx, 'orkestrator');
    const cs = await buatUser(ctx.prisma, 'cs');
    const sesiCs1 = await login(ctx, cs.email);
    const sesiCs2 = await login(ctx, cs.email);
    await ctx.http().get('/api/v1/auth/me').set('Cookie', sesiCs1).expect(200);

    const res = await ctx
      .http()
      .patch(`/api/v1/users/${cs.id}`)
      .set('Cookie', admin)
      .send({ aktif: false })
      .expect(200);
    expect(res.body.aktif).toBe(false);

    await ctx.http().get('/api/v1/auth/me').set('Cookie', sesiCs1).expect(401);
    await ctx.http().get('/api/v1/auth/me').set('Cookie', sesiCs2).expect(401);
    expect(await ctx.prisma.session.count({ where: { userId: cs.id, dicabutAt: null } })).toBe(0);

    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { aksi: 'user.nonaktif', objekId: cs.id },
    });
    expect(audit.sesudah).toMatchObject({ aktif: false, sesiDicabut: 2 });
  });

  it('mengganti password mencabut sesi lama', async () => {
    const admin = await loginSebagai(ctx, 'orkestrator');
    const cs = await buatUser(ctx.prisma, 'cs');
    const sesiCs = await login(ctx, cs.email);
    await ctx
      .http()
      .patch(`/api/v1/users/${cs.id}`)
      .set('Cookie', admin)
      .send({ password: 'password-baru-yang-panjang' })
      .expect(200);
    await ctx.http().get('/api/v1/auth/me').set('Cookie', sesiCs).expect(401);
    await login(ctx, cs.email, 'password-baru-yang-panjang');
  });
});
