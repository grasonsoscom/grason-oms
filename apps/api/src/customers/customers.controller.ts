import { Controller, Get, Query } from '@nestjs/common';
import { samarkanPii } from '@grason/shared';
import { z } from 'zod';
import { PelakuSaatIni, Perlu } from '../common/decorators';
import { validasi } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';

const skemaQuery = z.object({
  halaman: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().min(1).max(100).default(25),
});

@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nomor WA dan alamat disamarkan untuk role tanpa izin pelanggan.pii.lihat.
   * Pembatasan CS ke pelanggan miliknya sendiri dibangun bersama modul lead di Fase 1.
   */
  @Perlu('lead.lihat_semua', 'order.lihat_semua')
  @Get()
  async daftar(@Query() query: unknown, @PelakuSaatIni() pelaku: Pelaku) {
    const { halaman, per } = validasi(skemaQuery, query);
    const data = await this.prisma.client.customer.findMany({
      select: {
        id: true,
        noWa: true,
        nama: true,
        alamat: true,
        kelurahan: true,
        kecamatan: true,
        kota: true,
        provinsi: true,
        kodePos: true,
        tandaRts: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (halaman - 1) * per,
      take: per,
    });
    const bolehPii = pelaku.tipe === 'user' && pelaku.izin.includes('pelanggan.pii.lihat');
    return { data: bolehPii ? data : data.map((c) => samarkanPii(c)), halaman, per };
  }
}
