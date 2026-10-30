import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Order, OrderStatus, Prisma } from '@grason/db';
import { bolehTransisi } from '@grason/shared';
import { galat } from '../common/galat';
import { kolomPelaku, type Pelaku } from '../common/pelaku';

type Db = Prisma.TransactionClient;

export interface KonteksUbah {
  pelaku?: Pelaku;
  /** Waktu kejadian (UTC). */
  waktu: Date;
  catatan?: string | null;
  /** Konteks untuk webhook CS AI, mis. resi_terbit, gagal_antar, cod_ditolak. */
  alasan?: string | null;
  /** Kolom order lain yang ikut berubah bersama status. */
  data?: Prisma.OrderUpdateInput;
}

type OrderRingkas = Pick<Order, 'id' | 'status' | 'sumber'>;

/**
 * Satu-satunya jalan mengubah status order: cek tabel transisi, catat riwayat, dan
 * antrekan webhook order.status_changed untuk order dari SaaS CS AI.
 */
@Injectable()
export class StatusService {
  async ubah(tx: Db, order: OrderRingkas, ke: OrderStatus, ktx: KonteksUbah): Promise<Order> {
    if (!bolehTransisi(order.status, ke)) {
      throw new ConflictException(
        galat('status_tidak_sesuai', `Order berstatus ${order.status} tidak bisa menjadi ${ke}`, {
          status: order.status,
          ke,
        }),
      );
    }
    // Kunci baris dan pastikan status belum berubah sejak dibaca.
    const hasil = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: ke },
    });
    if (hasil.count === 0) {
      throw new ConflictException(galat('status_berubah', 'Status order baru saja berubah'));
    }
    const baru = await tx.order.update({ where: { id: order.id }, data: ktx.data ?? {} });
    await this.catatRiwayat(tx, order.id, order.status, ke, ktx);
    if (order.sumber === 'cs_ai') await this.antrekanWebhook(tx, baru, order.status, ktx);
    return baru;
  }

  /** Riwayat tanpa perubahan status (dikemas, gagal antar, diterima kembali). */
  async catat(tx: Db, order: OrderRingkas, ktx: KonteksUbah): Promise<void> {
    await this.catatRiwayat(tx, order.id, order.status, order.status, ktx);
    if (order.sumber === 'cs_ai' && ktx.alasan === 'gagal_antar') {
      const o = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      await this.antrekanWebhook(tx, o, order.status, ktx);
    }
  }

  async catatRiwayat(
    tx: Db,
    orderId: string,
    dari: OrderStatus | null,
    ke: OrderStatus,
    ktx: KonteksUbah,
  ): Promise<void> {
    const p = kolomPelaku(ktx.pelaku);
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        dariStatus: dari,
        keStatus: ke,
        olehTipe: p.pelakuTipe,
        olehUserId: p.userId,
        olehApiKeyId: p.apiKeyId,
        catatan: ktx.catatan ?? null,
        waktu: ktx.waktu,
      },
    });
  }

  /**
   * Outbox webhook (cs-ai.v1 `order.status_changed`). Fase 1 hanya mencatat event di
   * integration_events; pengiriman ke SaaS CS AI dibangun di Fase 3.
   */
  private async antrekanWebhook(
    tx: Db,
    order: Order,
    sebelum: OrderStatus,
    ktx: KonteksUbah,
  ): Promise<void> {
    const [grup, lead, kiriman] = await Promise.all([
      tx.orderGroup.findUnique({ where: { id: order.orderGroupId } }),
      order.leadId ? tx.lead.findUnique({ where: { id: order.leadId } }) : null,
      tx.shipment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const eventId = randomUUID();
    await tx.integrationEvent.create({
      data: {
        sistem: 'cs_ai',
        arah: 'keluar',
        jenis: 'order.status_changed',
        externalId: order.externalId,
        idempotencyKey: eventId,
        payload: {
          event_id: eventId,
          jenis: 'order.status_changed',
          terjadi_at: ktx.waktu.toISOString(),
          data: {
            order_id: order.id,
            nomor: order.nomor,
            order_group_id: order.orderGroupId,
            checkout_external_id: grup?.externalId ?? null,
            lead_id: order.leadId,
            lead_external_id: lead?.externalId ?? null,
            status_sebelum: sebelum,
            status: order.status,
            alasan: ktx.alasan ?? null,
            kurir: kiriman?.kurir ?? null,
            resi: kiriman?.resi ?? null,
            percobaan_antar: kiriman?.percobaanAntar ?? null,
          },
        },
        createdAt: ktx.waktu,
      },
    });
  }
}
