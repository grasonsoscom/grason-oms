import {
  Body,
  Controller,
  Get,
  Inject,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { cocokPassword, hashPassword } from '@grason/db';
import { ROLE_LABEL } from '@grason/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { PelakuSaatIni, Perlu, Publik } from '../common/decorators';
import { galat, validasi } from '../common/galat';
import { tokenAcak } from '../common/token';
import type { Pelaku } from '../common/pelaku';
import { CONFIG, type ConfigApi } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { SesiService } from './sesi.service';

const skemaLogin = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Format email tidak valid')),
  password: z.string().min(1, 'Password wajib diisi').max(256),
});

// Hash dari string acak, dihitung sekali; dipakai saat email tidak dikenal
// supaya waktu respon tidak membocorkan email mana yang terdaftar.
let hashPengalih: Promise<string> | undefined;
function ambilHashPengalih(): Promise<string> {
  hashPengalih ??= hashPassword(tokenAcak());
  return hashPengalih;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesi: SesiService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: ConfigApi,
  ) {}

  @Publik()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, password } = validasi(skemaLogin, body);
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      include: { role: true },
    });

    const passwordCocok = await cocokPassword(
      user?.passwordHash ?? (await ambilHashPengalih()),
      password,
    );
    if (!user || !passwordCocok || !user.aktif) {
      await this.audit.catat({
        aksi: 'auth.login_gagal',
        userId: user?.id,
        sesudah: {
          email,
          alasan: !user ? 'email_tidak_dikenal' : !passwordCocok ? 'password_salah' : 'nonaktif',
        },
        ip: req.ip,
      });
      throw new UnauthorizedException(galat('tidak_terautentikasi', 'Email atau password salah'));
    }

    const { token, sesi } = await this.sesi.buat(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { loginTerakhirAt: new Date() },
    });
    await this.audit.catat({
      aksi: 'auth.login',
      userId: user.id,
      objekTipe: 'session',
      objekId: sesi.id,
      ip: req.ip,
    });

    res.cookie(this.config.cookieSesi, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.lingkungan === 'production',
      path: '/',
      maxAge: this.sesi.ttlMs,
    });
    return {
      user: { id: user.id, email: user.email, nama: user.nama, role: user.role.kode },
      sesiBerakhirAt: sesi.expiresAt,
    };
  }

  @Perlu()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @PelakuSaatIni() pelaku: Pelaku,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (pelaku.tipe === 'user') {
      await this.sesi.cabut(pelaku.sesiId);
      await this.audit.catat({
        aksi: 'auth.logout',
        pelaku,
        objekTipe: 'session',
        objekId: pelaku.sesiId,
        ip: req.ip,
      });
    }
    res.clearCookie(this.config.cookieSesi, { path: '/' });
  }

  @Perlu()
  @Get('me')
  me(@PelakuSaatIni() pelaku: Pelaku) {
    if (pelaku.tipe !== 'user') throw new UnauthorizedException();
    return {
      id: pelaku.userId,
      email: pelaku.email,
      nama: pelaku.nama,
      role: pelaku.role,
      roleLabel: ROLE_LABEL[pelaku.role],
      izin: pelaku.izin,
    };
  }
}
