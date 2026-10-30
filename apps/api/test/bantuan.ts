import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashPassword, seed, type PrismaClient } from '@grason/db';
import { kosongkanDatabase, urlDatabaseTes } from '@grason/db/testing';
import type { Role, Sistem } from '@grason/shared';
import request from 'supertest';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { AppModule } from '../src/app.module';
import { siapkanApp } from '../src/buat-app';
import { CONFIG, type ConfigApi } from '../src/config';
import { PrismaService } from '../src/prisma/prisma.service';

export const PASSWORD_UJI = 'password-uji-panjang';

export interface KonteksUji {
  app: INestApplication;
  prisma: PrismaClient;
  http: () => ReturnType<typeof request>;
}

export async function buatAppUji(): Promise<KonteksUji> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = urlDatabaseTes();
  const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modul.createNestApplication({ logger: false });
  siapkanApp(app, app.get<ConfigApi>(CONFIG));
  await app.init();
  const prisma = app.get(PrismaService).client;
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

export async function resetData(prisma: PrismaClient): Promise<void> {
  await kosongkanDatabase(prisma);
  await seed(prisma);
}

export async function buatUser(prisma: PrismaClient, role: Role, email = `${role}@uji.local`) {
  const r = await prisma.role.findUniqueOrThrow({ where: { kode: role } });
  return prisma.user.create({
    data: {
      email,
      nama: `Uji ${role}`,
      roleId: r.id,
      passwordHash: await hashPassword(PASSWORD_UJI),
    },
  });
}

/** Login dan kembalikan header Cookie untuk request berikutnya. */
export async function login(
  ctx: KonteksUji,
  email: string,
  password = PASSWORD_UJI,
): Promise<string> {
  const res = await ctx.http().post('/api/v1/auth/login').send({ email, password }).expect(200);
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.find((c) => c.startsWith('oms_sesi='));
  if (!cookie) throw new Error('Cookie sesi tidak ada');
  return cookie.split(';')[0]!;
}

export async function loginSebagai(ctx: KonteksUji, role: Role): Promise<string> {
  const user = await buatUser(ctx.prisma, role);
  return login(ctx, user.email);
}

/** API key sistem langsung lewat service (kunci utuh hanya dikembalikan sekali). */
export async function kunciSistem(ctx: KonteksUji, sistem: Sistem): Promise<string> {
  const { kunci } = await ctx.app.get(ApiKeysService).buat({ nama: `Uji ${sistem}`, sistem });
  return kunci;
}

/** Snapshot stok Ethix untuk SKU komponen. */
export async function isiStok(
  ctx: KonteksUji,
  kunciEthix: string,
  stok: Record<string, number>,
  snapshotAt = new Date(),
): Promise<void> {
  await ctx
    .http()
    .post('/api/v1/ethix/stock')
    .set('X-Api-Key', kunciEthix)
    .send({
      snapshot_at: snapshotAt.toISOString(),
      items: Object.entries(stok).map(([sku, qty]) => ({ sku, stok_layak_jual: qty })),
    })
    .expect(200);
}

let urutEvent = 0;

/** Kirim satu event pengiriman Ethix dan kembalikan HasilBatch. */
export async function eventEthix(
  ctx: KonteksUji,
  kunciEthix: string,
  orderNomor: string,
  jenis: string,
  tambahan: Record<string, unknown> = {},
) {
  urutEvent += 1;
  const res = await ctx
    .http()
    .post('/api/v1/ethix/shipment-events')
    .set('X-Api-Key', kunciEthix)
    .send({
      events: [
        {
          event_id: `ev-${urutEvent}-${Date.now()}`,
          order_nomor: orderNomor,
          jenis,
          terjadi_at: new Date().toISOString(),
          ...tambahan,
        },
      ],
    })
    .expect(200);
  return res.body as {
    diterima: number;
    duplikat: number;
    gagal: { id: string; error: { kode: string } }[];
  };
}
