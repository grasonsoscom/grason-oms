import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Order, Prisma } from '@grason/db';
import { akibatEventEthix, type JenisEventEthix } from '@grason/shared';
import type { Pelaku } from '../common/pelaku';
import { StatusService } from '../orders/status.service';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient;

export interface EventPengiriman {
  eventId: string;
  orderNomor: string;
  ethixRef?: string | null;
  jenis: JenisEventEthix;
  terjadiAt: Date;
  kurir?: string | null;
  resi?: string | null;
  statusKurir?: string | null;
  percobaanAntar?: number | null;
  alasan?: string | null;
  kondisiBarang?: 'layak_jual' | 'rusak' | 'tidak_lengkap' | null;
  ongkirBalik?: number | null;
}

export interface HasilBatch {
  diterima: number;
  duplikat: number;
  gagal: { id: string; error: { kode: string; pesan: string } }[];
}

class GagalEvent extends Error {
  constructor(
    readonly kode: string,
    pesan: string,
  ) {
    super(pesan);
  }
}

const LABEL_EVENT: Record<JenisEventEthix, string> = {
  diterima_gudang: 'Diterima gudang Ethix',
  dikemas: 'Dikemas di gudang Ethix',
  dikirim: 'Resi terbit',
  terkirim: 'Paket diterima pembeli',
  gagal_antar: 'Gagal antar',
  rts: 'RTS',
  diterima_kembali: 'Barang RTS diterima kembali di gudang',
};

export const INCLUDE_ORDER_ETHIX = {
  items: { include: { product: { include: { bundleItems: { include: { komponen: true } } } } } },
} satisfies Prisma.OrderInclude;

export type OrderEthix = Prisma.OrderGetPayload<{ include: typeof INCLUDE_ORDER_ETHIX }>;

@Injectable()
export class EthixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: StatusService,
  ) {}

  /**
   * Order untuk polling Ethix. siap_kirim = terverifikasi dan belum diterima Ethix;
   * batal = order yang sudah pernah siap kirim lalu dibatalkan.
   */
  async daftarOrder(q: {
    status: 'siap_kirim' | 'batal';
    sejak?: Date;
    kursor?: string;
    batas: number;
  }) {
    const where: Prisma.OrderWhereInput =
      q.status === 'siap_kirim'
        ? { status: 'terverifikasi', ethixRef: null }
        : { status: 'batal', terverifikasiAt: { not: null } };
    if (q.sejak) where.updatedAt = { gte: q.sejak };
    const kursor = q.kursor ? bacaKursor(q.kursor) : null;
    if (kursor) {
      where.OR = [
        { updatedAt: { gt: kursor.waktu } },
        { updatedAt: kursor.waktu, id: { gt: kursor.id } },
      ];
    }
    const data = await this.prisma.client.order.findMany({
      where,
      include: INCLUDE_ORDER_ETHIX,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: q.batas + 1,
    });
    const ada = data.length > q.batas;
    const halaman = data.slice(0, q.batas);
    const akhir = halaman.at(-1);
    return {
      data: halaman,
      kursorBerikutnya: ada && akhir ? tulisKursor(akhir.updatedAt, akhir.id) : null,
    };
  }

  async ambilOrder(nomor: string) {
    return this.prisma.client.order.findUnique({ where: { nomor }, include: INCLUDE_ORDER_ETHIX });
  }

  /** Batch event pengiriman. Tiap event diproses terpisah dan idempoten di event_id. */
  async terimaEvent(events: EventPengiriman[], pelaku: Pelaku, waktu: Date): Promise<HasilBatch> {
    const hasil: HasilBatch = { diterima: 0, duplikat: 0, gagal: [] };
    const apiKeyId = pelaku.tipe === 'api_key' ? pelaku.apiKeyId : null;
    for (const ev of events) {
      const ada = await this.prisma.client.integrationEvent.findUnique({
        where: {
          sistem_arah_idempotencyKey: {
            sistem: 'ethix',
            arah: 'masuk',
            idempotencyKey: ev.eventId,
          },
        },
      });
      if (ada) {
        hasil.duplikat += 1;
        continue;
      }
      const payload = JSON.parse(JSON.stringify(ev)) as Prisma.InputJsonObject;
      try {
        await this.prisma.client.$transaction(async (tx) => {
          const keterangan = await this.prosesEvent(tx, ev, pelaku, waktu);
          await tx.integrationEvent.create({
            data: {
              sistem: 'ethix',
              arah: 'masuk',
              jenis: `shipment.${ev.jenis}`,
              externalId: ev.orderNomor,
              idempotencyKey: ev.eventId,
              payload,
              status: 'berhasil',
              error: keterangan,
              apiKeyId,
              createdAt: waktu,
              diprosesAt: waktu,
            },
          });
        });
        hasil.diterima += 1;
      } catch (e) {
        if (!(e instanceof GagalEvent)) throw e;
        hasil.gagal.push({ id: ev.eventId, error: { kode: e.kode, pesan: e.message } });
        // Event gagal tetap tercatat (tanpa kunci idempotensi) supaya bisa diperiksa.
        await this.prisma.client.integrationEvent.create({
          data: {
            sistem: 'ethix',
            arah: 'masuk',
            jenis: `shipment.${ev.jenis}`,
            externalId: ev.orderNomor,
            idempotencyKey: `gagal:${ev.eventId}:${randomUUID()}`,
            payload,
            status: 'gagal',
            error: `${e.kode}: ${e.message}`,
            apiKeyId,
            createdAt: waktu,
            diprosesAt: waktu,
          },
        });
      }
    }
    return hasil;
  }

  /** Kembalikan keterangan untuk log (mis. event diabaikan), null bila biasa. */
  private async prosesEvent(
    tx: Db,
    ev: EventPengiriman,
    pelaku: Pelaku,
    waktu: Date,
  ): Promise<string | null> {
    const order = await tx.order.findUnique({ where: { nomor: ev.orderNomor } });
    if (!order) throw new GagalEvent('order_tidak_dikenal', `Order ${ev.orderNomor} tidak dikenal`);
    if (ev.jenis === 'dikirim' && (!ev.resi || !ev.kurir)) {
      throw new GagalEvent('data_tidak_lengkap', 'Event dikirim wajib membawa resi dan kurir');
    }
    if ((ev.jenis === 'gagal_antar' || ev.jenis === 'rts') && !ev.alasan) {
      throw new GagalEvent('data_tidak_lengkap', `Event ${ev.jenis} wajib membawa alasan`);
    }

    const akibat = akibatEventEthix(order.status, ev.jenis);
    if (akibat.jenis === 'tolak') {
      throw new GagalEvent(
        akibat.kode,
        akibat.kode === 'order_batal'
          ? `Order ${order.nomor} sudah batal`
          : `Event ${ev.jenis} tidak valid untuk order berstatus ${order.status}`,
      );
    }
    if (akibat.jenis === 'abaikan') return `${akibat.kode}: order sudah ${order.status}`;

    const pada = ev.terjadiAt.getTime() <= waktu.getTime() ? ev.terjadiAt : waktu;
    const catatan = [LABEL_EVENT[ev.jenis], ev.alasan, ev.statusKurir].filter(Boolean).join(' – ');
    await this.efekSamping(tx, order, ev, pada);

    if (akibat.jenis === 'catat') {
      await this.status.catat(tx, order, {
        pelaku,
        waktu: pada,
        catatan,
        alasan: ev.jenis === 'gagal_antar' ? 'gagal_antar' : null,
      });
      return null;
    }

    const data: Prisma.OrderUpdateInput = {};
    if (ev.ethixRef && !order.ethixRef) data.ethixRef = ev.ethixRef;
    if (!order.dikirimKeEthixAt) data.dikirimKeEthixAt = pada;
    if (akibat.ke === 'terkirim') data.terkirimAt = pada;
    await this.status.ubah(tx, order, akibat.ke, {
      pelaku,
      waktu: pada,
      catatan,
      data,
      alasan:
        akibat.ke === 'dikirim'
          ? 'resi_terbit'
          : akibat.ke === 'rts'
            ? /cod/i.test(ev.alasan ?? '')
              ? 'cod_ditolak'
              : 'rts'
            : akibat.ke,
    });
    return null;
  }

  private async efekSamping(tx: Db, order: Order, ev: EventPengiriman, pada: Date): Promise<void> {
    const kiriman = await tx.shipment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
    const dataKurir = {
      ...(ev.statusKurir ? { statusKurir: ev.statusKurir } : {}),
      ...(ev.percobaanAntar != null ? { percobaanAntar: ev.percobaanAntar } : {}),
    };
    switch (ev.jenis) {
      case 'dikirim':
        if (kiriman?.resi === ev.resi) break;
        await tx.shipment.create({
          data: {
            orderId: order.id,
            kurir: ev.kurir!,
            resi: ev.resi!,
            dikirimAt: pada,
            ...dataKurir,
            createdAt: pada,
          },
        });
        break;
      case 'terkirim':
        if (kiriman) {
          await tx.shipment.update({
            where: { id: kiriman.id },
            data: { diterimaAt: pada, ...dataKurir },
          });
        }
        break;
      case 'gagal_antar':
        if (kiriman) {
          await tx.shipment.update({
            where: { id: kiriman.id },
            data: {
              ...dataKurir,
              percobaanAntar: ev.percobaanAntar ?? kiriman.percobaanAntar + 1,
            },
          });
        }
        break;
      case 'rts':
        await tx.return.upsert({
          where: { orderId_jenis: { orderId: order.id, jenis: 'rts' } },
          update: { alasan: ev.alasan!, ongkirBalik: ev.ongkirBalik ?? undefined },
          create: {
            orderId: order.id,
            jenis: 'rts',
            alasan: ev.alasan!,
            ongkirBalik: ev.ongkirBalik ?? 0,
            createdAt: pada,
          },
        });
        // Pelanggan dengan riwayat RTS wajib diverifikasi CS manusia berikutnya.
        await tx.customer.update({ where: { id: order.customerId }, data: { tandaRts: true } });
        if (kiriman && Object.keys(dataKurir).length > 0) {
          await tx.shipment.update({ where: { id: kiriman.id }, data: dataKurir });
        }
        break;
      case 'diterima_kembali':
        await tx.return.update({
          where: { orderId_jenis: { orderId: order.id, jenis: 'rts' } },
          data: {
            diterimaGudangAt: pada,
            kondisiBarang: ev.kondisiBarang ?? null,
            ...(ev.ongkirBalik != null ? { ongkirBalik: ev.ongkirBalik } : {}),
          },
        });
        break;
      default:
        break;
    }
  }

  /** Snapshot stok. Snapshot lebih lama dari yang tersimpan diabaikan (duplikat). */
  async terimaStok(
    snapshotAt: Date,
    items: { sku: string; stokLayakJual: number; stokReturLayak?: number | null }[],
    waktu: Date,
  ): Promise<HasilBatch> {
    const hasil: HasilBatch = { diterima: 0, duplikat: 0, gagal: [] };
    const produk = await this.prisma.client.product.findMany({
      where: { sku: { in: items.map((i) => i.sku) } },
    });
    const perSku = new Map(produk.map((p) => [p.sku, p]));
    for (const item of items) {
      const p = perSku.get(item.sku);
      if (!p) {
        hasil.gagal.push({
          id: item.sku,
          error: { kode: 'sku_tidak_dikenal', pesan: `SKU ${item.sku} tidak dikenal` },
        });
        continue;
      }
      if (p.tipe !== 'satuan') {
        hasil.gagal.push({
          id: item.sku,
          error: { kode: 'bukan_sku_komponen', pesan: 'Stok paket dihitung OMS dari komponennya' },
        });
        continue;
      }
      const terakhir = await this.prisma.client.stockSnapshot.findFirst({
        where: { productId: p.id },
        orderBy: { disinkronAt: 'desc' },
      });
      if (terakhir && terakhir.disinkronAt.getTime() >= snapshotAt.getTime()) {
        hasil.duplikat += 1;
        continue;
      }
      await this.prisma.client.stockSnapshot.create({
        data: {
          productId: p.id,
          stokEthix: item.stokLayakJual,
          stokReturLayak: item.stokReturLayak ?? 0,
          disinkronAt: snapshotAt,
          createdAt: waktu,
        },
      });
      hasil.diterima += 1;
    }
    return hasil;
  }
}

function tulisKursor(waktu: Date, id: string): string {
  return Buffer.from(`${waktu.toISOString()}|${id}`).toString('base64url');
}

function bacaKursor(kursor: string): { waktu: Date; id: string } | null {
  const [w, id] = Buffer.from(kursor, 'base64url').toString().split('|');
  const waktu = new Date(w ?? '');
  return id && !Number.isNaN(waktu.getTime()) ? { waktu, id } : null;
}
