import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashPassword, seed, type PrismaClient } from '@grason/db';
import { kosongkanDatabase, urlDatabaseTes } from '@grason/db/testing';
import type { Role } from '@grason/shared';
import request from 'supertest';
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
