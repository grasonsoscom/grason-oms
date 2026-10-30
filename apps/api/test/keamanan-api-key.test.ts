import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SCOPE_SISTEM, type Scope } from '@grason/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { AppModule } from '../src/app.module';
import { PembatasLaju } from '../src/auth/pembatas-laju';
import { META_SCOPE } from '../src/common/decorators';
import { AKUN_DEMO, DOMAIN_DEMO } from '../src/demo/demo';
import {
  buatAppUji,
  buatUser,
  kunciSistem,
  login,
  PASSWORD_UJI,
  resetData,
  type KonteksUji,
} from './bantuan';

// Persiapan membuka API ke internet (Cloudflare Tunnel) untuk uji sambung SaaS CS AI.
// DEMO_MODE aktif di sini supaya terbukti X-Sim-Waktu tetap ditolak untuk kunci biasa.

let ctx: KonteksUji;
let urut = 0;

beforeAll(async () => {
  process.env.DEMO_MODE = 'true';
  ctx = await buatAppUji();
});

afterAll(async () => {
  await ctx.app.close();
  delete process.env.DEMO_MODE;
});

beforeEach(async () => {
  await resetData(ctx.prisma);
});

const LALU = '2026-10-01T03:00:00.000Z';

async function leadDenganWaktu(kunci: string) {
  urut += 1;
  const res = await ctx
    .http()
    .post('/api/v1/leads')
    .set('X-Api-Key', kunci)
    .set('X-Sim-Waktu', LALU)
    .send({
      external_id: `aman-${urut}`,
      no_wa: `0812777${String(urut).padStart(5, '0')}`,
      sku_ditanya: 'BSR-01',
      masuk_at: new Date().toISOString(),
    })
    .expect(201);
  return ctx.prisma.lead.findUniqueOrThrow({ where: { id: res.body.id as string } });
}

describe('X-Sim-Waktu', () => {
  it('ditolak dari API key CS AI biasa meskipun DEMO_MODE=true', async () => {
    const lead = await leadDenganWaktu(await kunciSistem(ctx, 'cs_ai'));
    expect(Date.now() - lead.createdAt.getTime()).toBeLessThan(60_000);
  });

  it('diterima dari API key simulator di mode demo', async () => {
    const { kunci } = await ctx.app
      .get(ApiKeysService)
      .buat({ nama: 'Simulator CS AI', sistem: 'cs_ai', simulator: true });
    const lead = await leadDenganWaktu(kunci);
    expect(lead.createdAt.toISOString()).toBe(LALU);
  });

  it('nama kunci "Simulator …" saja tidak cukup; tanda simulator tidak bisa diset lewat API', async () => {
    const lead = await leadDenganWaktu(
      (await ctx.app.get(ApiKeysService).buat({ nama: 'Simulator palsu', sistem: 'cs_ai' })).kunci,
    );
    expect(Date.now() - lead.createdAt.getTime()).toBeLessThan(60_000);

    await buatUser(ctx.prisma, 'orkestrator', 'admin@uji.local');
    const admin = await login(ctx, 'admin@uji.local');
    const dibuat = await ctx
      .http()
      .post('/api/v1/api-keys')
      .set('Cookie', admin)
      .send({ nama: 'Coba simulator', sistem: 'cs_ai', simulator: true })
      .expect(201);
    expect(dibuat.body.simulator).toBe(false);
  });

  it('dari sesi login hanya untuk akun demo', async () => {
    const lewat = async (email: string) => {
      const cookie = await login(ctx, email);
      const res = await ctx
        .http()
        .get('/api/v1/app/ringkasan')
        .set('Cookie', cookie)
        .set('X-Sim-Waktu', LALU)
        .expect(200);
      return res.body.waktu as string;
    };
    await buatUser(ctx.prisma, 'cs_leader', 'leader@uji.local');
    expect(await lewat('leader@uji.local')).not.toBe(LALU);
    const demo = AKUN_DEMO.find((a) => a.role === 'cs_leader')!;
    expect(demo.email.endsWith(`@${DOMAIN_DEMO}`)).toBe(true);
    await buatUser(ctx.prisma, 'cs_leader', demo.email);
    expect(await lewat(demo.email)).toBe(LALU);
  });
});

describe('API key CS AI hanya untuk endpoint kontraknya', () => {
  it('login web ditolak bila membawa API key', async () => {
    await buatUser(ctx.prisma, 'orkestrator', 'admin@uji.local');
    const res = await ctx
      .http()
      .post('/api/v1/auth/login')
      .set('X-Api-Key', await kunciSistem(ctx, 'cs_ai'))
      .send({ email: 'admin@uji.local', password: PASSWORD_UJI })
      .expect(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('setiap endpoint di luar scope CS AI menolak kuncinya', async () => {
    const kunci = await kunciSistem(ctx, 'cs_ai');
    const scopeCsAi: readonly string[] = SCOPE_SISTEM.cs_ai;
    const metode: Record<number, 'get' | 'post' | 'put' | 'delete' | 'patch'> = {
      [RequestMethod.GET]: 'get',
      [RequestMethod.POST]: 'post',
      [RequestMethod.PUT]: 'put',
      [RequestMethod.DELETE]: 'delete',
      [RequestMethod.PATCH]: 'patch',
    };
    const controllers = Reflect.getMetadata('controllers', AppModule) as (new (
      ...a: never[]
    ) => object)[];
    const diperiksa: string[] = [];
    for (const c of controllers) {
      const dasar = (Reflect.getMetadata(PATH_METADATA, c) as string).replace(/^\/|\/$/g, '');
      for (const nama of Object.getOwnPropertyNames(c.prototype)) {
        const fn = (c.prototype as Record<string, unknown>)[nama];
        if (typeof fn !== 'function' || nama === 'constructor') continue;
        const m = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
        if (m === undefined) continue;
        const scope = (Reflect.getMetadata(META_SCOPE, fn) ??
          Reflect.getMetadata(META_SCOPE, c)) as Scope[] | undefined;
        if (scope && scope.every((s) => scopeCsAi.includes(s))) continue; // endpoint kontrak CS AI
        const sub = (Reflect.getMetadata(PATH_METADATA, fn) as string).replace(/^\/|\/$/g, '');
        const url = `/api/v1/${[dasar, sub].filter(Boolean).join('/')}`.replace(
          /:[A-Za-z]+/g,
          '00000000-0000-4000-8000-000000000000',
        );
        const res = await ctx.http()[metode[m]!](url).set('X-Api-Key', kunci).send({});
        expect({ url, m, status: res.status }).toEqual({ url, m, status: 403 });
        diperiksa.push(`${metode[m]} ${url}`);
      }
    }
    // Termasuk login, dashboard, kelola API key, dan endpoint Ethix.
    expect(diperiksa).toContain('post /api/v1/auth/login');
    expect(diperiksa).toContain('get /api/v1/app/ringkasan');
    expect(diperiksa).toContain('post /api/v1/api-keys');
    expect(diperiksa.some((d) => d.includes('/ethix/'))).toBe(true);
  });

  it('tidak ada endpoint HTTP untuk demo:reset', () => {
    const controllers = Reflect.getMetadata('controllers', AppModule) as { name: string }[];
    expect(controllers.map((c) => c.name).join(' ')).not.toMatch(/demo/i);
  });
});

describe('rate limit per API key', () => {
  it('60 permintaan per menit, lalu 429 dengan Retry-After; kunci lain tidak terpengaruh', async () => {
    const a = await kunciSistem(ctx, 'cs_ai');
    const b = await kunciSistem(ctx, 'cs_ai');
    const harga = (k: string) => ctx.http().get('/api/v1/prices').set('X-Api-Key', k);
    for (let i = 0; i < 60; i += 1) await harga(a).expect(200);
    const lewat = await harga(a).expect(429);
    expect(lewat.body.error.kode).toBe('terlalu_banyak_permintaan');
    expect(Number(lewat.headers['retry-after'])).toBeGreaterThan(0);
    await harga(b).expect(200);
  });

  it('kunci simulator di mode demo tidak dibatasi', async () => {
    const { kunci } = await ctx.app
      .get(ApiKeysService)
      .buat({ nama: 'Simulator CS AI', sistem: 'cs_ai', simulator: true });
    for (let i = 0; i < 70; i += 1) {
      await ctx.http().get('/api/v1/prices').set('X-Api-Key', kunci).expect(200);
    }
  });

  it('jendela geser 60 detik', () => {
    const p = new PembatasLaju(2);
    expect(p.ambil('k', 0)).toBeNull();
    expect(p.ambil('k', 30_000)).toBeNull();
    expect(p.ambil('k', 59_000)).toBe(1);
    expect(p.ambil('k', 60_001)).toBeNull(); // permintaan pertama sudah keluar jendela
    expect(p.ambil('k', 60_002)).toBe(30);
    expect(new PembatasLaju(0).ambil('k')).toBeNull();
  });
});
