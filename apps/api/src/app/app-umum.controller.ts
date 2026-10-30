import { Controller, Get } from '@nestjs/common';
import { Perlu, WaktuSaatIni } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { StokService } from '../stok/stok.service';

@Controller('app')
export class AppUmumController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stok: StokService,
  ) {}

  @Perlu('stok.lihat')
  @Get('stok')
  async daftarStok(@WaktuSaatIni() sekarang: Date) {
    return { data: await this.stok.hitung(sekarang) };
  }

  /** Daftar CS aktif untuk filter dan pembagian lead. */
  @Perlu('lead.bagi', 'lead.lihat_semua', 'order.lihat_semua')
  @Get('cs')
  async daftarCs() {
    return {
      data: await this.prisma.client.user.findMany({
        where: { aktif: true, role: { kode: 'cs' } },
        select: { id: true, nama: true },
        orderBy: { nama: 'asc' },
      }),
    };
  }
}
