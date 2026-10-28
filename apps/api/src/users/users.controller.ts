import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { hashPassword, PANJANG_PASSWORD_MINIMAL } from '@grason/db';
import { ROLE } from '@grason/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { PelakuSaatIni, Perlu } from '../common/decorators';
import { galat, validasi } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';

const password = z
  .string()
  .min(PANJANG_PASSWORD_MINIMAL, `Password minimal ${PANJANG_PASSWORD_MINIMAL} karakter`)
  .max(256);

const skemaBuat = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Format email tidak valid')),
  nama: z.string().trim().min(1).max(100),
  role: z.enum(ROLE),
  password,
});

const skemaUbah = z
  .object({
    nama: z.string().trim().min(1).max(100),
    role: z.enum(ROLE),
    aktif: z.boolean(),
    password,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Tidak ada perubahan');

const pilihUser = {
  id: true,
  email: true,
  nama: true,
  aktif: true,
  loginTerakhirAt: true,
  createdAt: true,
  role: { select: { kode: true, nama: true } },
} as const;

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Perlu('user.kelola')
  @Get()
  daftar() {
    return this.prisma.client.user.findMany({ select: pilihUser, orderBy: { nama: 'asc' } });
  }

  @Perlu('user.kelola')
  @Post()
  async buat(@Body() body: unknown, @PelakuSaatIni() pelaku: Pelaku) {
    const input = validasi(skemaBuat, body);
    const ada = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (ada) throw new ConflictException(galat('konflik', 'Email sudah terdaftar'));

    const role = await this.prisma.client.role.findUniqueOrThrow({ where: { kode: input.role } });
    const passwordHash = await hashPassword(input.password);
    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, nama: input.nama, roleId: role.id, passwordHash },
        select: pilihUser,
      });
      await this.audit.catat(
        {
          aksi: 'user.buat',
          pelaku,
          objekTipe: 'user',
          objekId: user.id,
          sesudah: { email: user.email, nama: user.nama, role: input.role },
        },
        tx,
      );
      return user;
    });
  }

  /** Menonaktifkan user atau mengganti password mencabut semua sesinya seketika. */
  @Perlu('user.kelola')
  @Patch(':id')
  async ubah(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @PelakuSaatIni() pelaku: Pelaku,
  ) {
    const input = validasi(skemaUbah, body);
    const sebelum = await this.prisma.client.user.findUnique({ where: { id }, select: pilihUser });
    if (!sebelum) throw new NotFoundException(galat('tidak_ditemukan', 'User tidak ditemukan'));
    if (pelaku.tipe === 'user' && pelaku.userId === id && (input.aktif === false || input.role)) {
      throw new BadRequestException(
        galat('validasi_gagal', 'Tidak bisa menonaktifkan atau mengganti role akun sendiri'),
      );
    }

    const roleId = input.role
      ? (await this.prisma.client.role.findUniqueOrThrow({ where: { kode: input.role } })).id
      : undefined;
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { nama: input.nama, aktif: input.aktif, roleId, passwordHash },
        select: pilihUser,
      });
      let sesiDicabut = 0;
      if (input.aktif === false || input.password) {
        const hasil = await tx.session.updateMany({
          where: { userId: id, dicabutAt: null },
          data: { dicabutAt: new Date() },
        });
        sesiDicabut = hasil.count;
      }
      await this.audit.catat(
        {
          aksi: input.aktif === false ? 'user.nonaktif' : 'user.ubah',
          pelaku,
          objekTipe: 'user',
          objekId: id,
          sebelum: { nama: sebelum.nama, aktif: sebelum.aktif, role: sebelum.role.kode },
          sesudah: {
            nama: user.nama,
            aktif: user.aktif,
            role: user.role.kode,
            passwordDiganti: Boolean(input.password),
            sesiDicabut,
          },
        },
        tx,
      );
      return user;
    });
  }
}
