import { Inject, Injectable } from '@nestjs/common';
import { IZIN_ROLE, ROLE, type Role } from '@grason/shared';
import { CONFIG, type ConfigApi } from '../config';
import type { PelakuUser } from '../common/pelaku';
import { sha256, tokenAcak } from '../common/token';
import { PrismaService } from '../prisma/prisma.service';

export const COOKIE_SESI = 'oms_sesi';

/** dipakai_at hanya diperbarui bila lebih tua dari ini, agar tiap request tidak menulis ke DB. */
const JEDA_UPDATE_DIPAKAI_MS = 5 * 60 * 1000;

@Injectable()
export class SesiService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: ConfigApi,
  ) {}

  get ttlMs(): number {
    return this.config.sesiTtlMs;
  }

  async buat(userId: string, info: { ip?: string; userAgent?: string }) {
    const token = tokenAcak();
    const sesi = await this.prisma.client.session.create({
      data: {
        tokenHash: sha256(token),
        userId,
        expiresAt: new Date(Date.now() + this.config.sesiTtlMs),
        ip: info.ip,
        userAgent: info.userAgent?.slice(0, 500),
      },
    });
    return { token, sesi };
  }

  /** Pelaku dari token cookie, atau null bila sesi tidak ada, dicabut, kedaluwarsa, atau user nonaktif. */
  async validasi(token: string): Promise<PelakuUser | null> {
    const sesi = await this.prisma.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { role: true } } },
    });
    const sekarang = Date.now();
    if (!sesi || sesi.dicabutAt || sesi.expiresAt.getTime() <= sekarang || !sesi.user.aktif) {
      return null;
    }
    const role = sesi.user.role.kode;
    if (!(ROLE as readonly string[]).includes(role)) return null;

    if (sekarang - sesi.dipakaiAt.getTime() > JEDA_UPDATE_DIPAKAI_MS) {
      await this.prisma.client.session.update({
        where: { id: sesi.id },
        data: { dipakaiAt: new Date(sekarang) },
      });
    }

    return {
      tipe: 'user',
      userId: sesi.user.id,
      email: sesi.user.email,
      nama: sesi.user.nama,
      role: role as Role,
      izin: IZIN_ROLE[role as Role],
      sesiId: sesi.id,
    };
  }

  async cabut(sesiId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { id: sesiId, dicabutAt: null },
      data: { dicabutAt: new Date() },
    });
  }

  /** Cabut semua sesi aktif milik user. Mengembalikan jumlah sesi yang dicabut. */
  async cabutSemuaMilik(userId: string): Promise<number> {
    const hasil = await this.prisma.client.session.updateMany({
      where: { userId, dicabutAt: null },
      data: { dicabutAt: new Date() },
    });
    return hasil.count;
  }
}
