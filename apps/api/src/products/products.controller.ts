import { Controller, Get } from '@nestjs/common';
import { Perlu } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Perlu('produk.lihat')
  @Get()
  daftar() {
    return this.prisma.client.product.findMany({
      where: { aktif: true },
      select: {
        id: true,
        sku: true,
        nama: true,
        tipe: true,
        entitas: true,
        hargaJual: true,
        beratGram: true,
        bundleItems: { select: { qty: true, komponen: { select: { sku: true } } } },
      },
      orderBy: [{ nama: 'asc' }],
    });
  }
}
