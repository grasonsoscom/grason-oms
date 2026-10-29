import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SCOPE_SISTEM } from '@grason/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { siapkanApp } from '../src/buat-app';
import { Perlu, PerluScope } from '../src/common/decorators';
import { CONFIG, type ConfigApi } from '../src/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginSebagai, resetData, type KonteksUji } from './bantuan';
import { sha256 } from '../src/common/token';
import { urlDatabaseTes } from '@grason/db/testing';

// Controller khusus tes untuk memeriksa penegakan scope dan pemisahan user/sistem.
@Controller('uji')
class UjiController {
  @PerluScope('stok.baca')
  @Get('stok')
  stok() {
    return { ok: true };
  }

  @PerluScope('stok.tulis')
  @Get('stok-ethix')
  stokEthix() {
    return { ok: true };
  }

  @Perlu('produk.lihat')
  @Get('khusus-user')
  khususUser() {
    return { ok: true };
  }

  @Get('tanpa-decorator')
  tanpaDecorator() {
    return { ok: true };
  }
}

@Module({ imports: [AppModule], controllers: [UjiController] })
class ModulUji {}

let ctx: KonteksUji;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = urlDatabaseTes();
  const modul = await Test.createTestingModule({ imports: [ModulUji] }).compile();
  const app = modul.createNestApplication({ logger: false });
  siapkanApp(app, app.get<ConfigApi>(CONFIG));
  await app.init();
  ctx = { app, prisma: app.get(PrismaService).client, http: () => request(app.getHttpServer()) };
});

afterAll(async () => {
  await ctx.app.close();
});

beforeEach(async () => {
  await resetData(ctx.prisma);
});

async function buatKunci(sistem: 'cs_ai' | 'ethix' | 'adv_ai', scopes?: string[]) {
  const admin = await loginSebagai(ctx, 'orkestrator');
  const res = await ctx
    .http()
    .post('/api/v1/api-keys')
    .set('Cookie', admin)
    .send({ nama: `Kunci ${sistem}`, sistem, scopes })
    .expect(201);
  return { admin, kunci: res.body.kunci as string, id: res.body.id as string, body: res.body };
}

describe('API key', () => {
  it('dibuat dengan scope default sistem; hanya hash yang disimpan', async () => {
    const { kunci, id, body } = await buatKunci('cs_ai');
    expect(kunci).toMatch(/^gok_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
    expect(body.scopes).toEqual([...SCOPE_SISTEM.cs_ai]);

    const tersimpan = await ctx.prisma.apiKey.findUniqueOrThrow({ where: { id } });
    expect(tersimpan.keyHash).toBe(sha256(kunci));
    expect(JSON.stringify(tersimpan)).not.toContain(kunci.split('_')[2]);
    expect(await ctx.prisma.auditLog.count({ where: { aksi: 'apikey.buat', objekId: id } })).toBe(
      1,
    );
  });

  it('daftar API key tidak pernah menampilkan kunci atau hash', async () => {
    const { admin } = await buatKunci('ethix');
    const res = await ctx.http().get('/api/v1/api-keys').set('Cookie', admin).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty('kunci');
    expect(res.body[0]).not.toHaveProperty('keyHash');
  });

  it('menolak scope milik sistem lain', async () => {
    const admin = await loginSebagai(ctx, 'orkestrator');
    await ctx
      .http()
      .post('/api/v1/api-keys')
      .set('Cookie', admin)
      .send({ nama: 'Salah', sistem: 'cs_ai', scopes: ['stok.tulis'] })
      .expect(400);
  });

  it('bisa dipakai lewat Authorization: Bearer dan X-Api-Key', async () => {
    const { kunci } = await buatKunci('cs_ai');
    const a = await ctx
      .http()
      .get('/api/v1/sistem/saya')
      .set('Authorization', `Bearer ${kunci}`)
      .expect(200);
    expect(a.body).toMatchObject({ sistem: 'cs_ai' });
    await ctx.http().get('/api/v1/sistem/saya').set('X-Api-Key', kunci).expect(200);
  });

  it('scope ditegakkan per endpoint', async () => {
    const { kunci } = await buatKunci('cs_ai');
    await ctx.http().get('/api/v1/uji/stok').set('X-Api-Key', kunci).expect(200);
    const res = await ctx.http().get('/api/v1/uji/stok-ethix').set('X-Api-Key', kunci).expect(403);
    expect(res.body.error.pesan).toContain('stok.tulis');
  });

  it('scope terbatas yang dipilih saat dibuat', async () => {
    const { kunci } = await buatKunci('cs_ai', ['lead.tulis']);
    await ctx.http().get('/api/v1/uji/stok').set('X-Api-Key', kunci).expect(403);
  });

  it('API key tidak bisa mengakses endpoint user, dan user tidak bisa endpoint sistem', async () => {
    const { kunci, admin } = await buatKunci('cs_ai');
    await ctx.http().get('/api/v1/uji/khusus-user').set('X-Api-Key', kunci).expect(403);
    await ctx.http().get('/api/v1/products').set('X-Api-Key', kunci).expect(403);
    await ctx.http().get('/api/v1/uji/stok').set('Cookie', admin).expect(403);
  });

  it('endpoint tanpa decorator akses ditolak untuk semua pelaku', async () => {
    const { kunci, admin } = await buatKunci('cs_ai');
    await ctx.http().get('/api/v1/uji/tanpa-decorator').set('X-Api-Key', kunci).expect(403);
    await ctx.http().get('/api/v1/uji/tanpa-decorator').set('Cookie', admin).expect(403);
    await ctx.http().get('/api/v1/uji/tanpa-decorator').expect(401);
  });

  it('kunci salah, rusak, atau dicabut ditolak', async () => {
    const { kunci, id, admin } = await buatKunci('ethix');
    const palsu = kunci.slice(0, -4) + 'AAAA';
    await ctx.http().get('/api/v1/sistem/saya').set('X-Api-Key', palsu).expect(401);
    await ctx.http().get('/api/v1/sistem/saya').set('X-Api-Key', 'gok_rusak').expect(401);

    await ctx.http().delete(`/api/v1/api-keys/${id}`).set('Cookie', admin).expect(200);
    await ctx.http().get('/api/v1/sistem/saya').set('X-Api-Key', kunci).expect(401);
    expect(await ctx.prisma.auditLog.count({ where: { aksi: 'apikey.cabut', objekId: id } })).toBe(
      1,
    );
  });

  it('hanya Orkestrator yang bisa membuat API key', async () => {
    const cookie = await loginSebagai(ctx, 'cs_leader');
    await ctx
      .http()
      .post('/api/v1/api-keys')
      .set('Cookie', cookie)
      .send({ nama: 'Coba', sistem: 'cs_ai' })
      .expect(403);
  });
});
