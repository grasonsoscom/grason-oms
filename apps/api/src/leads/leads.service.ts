import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Lead, LeadStatus, Prisma, Segmen } from '@grason/db';
import { normalisasiNoWa } from '@grason/shared';
import { galat } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';

export interface InputLead {
  externalId?: string | null;
  noWa: string;
  nama?: string | null;
  kanal?: string | null;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  skuDitanya?: string | null;
  masukAt: Date;
  /** Segmen menurut CS AI (cs-ai.v2). */
  segmen?: Segmen | null;
  catatan?: string | null;
}

export interface UbahLead {
  status?: LeadStatus;
  responPertamaAt?: Date;
  handover?: { alasan: string; terjadiAt?: Date };
  catatan?: string;
}

export const INCLUDE_LEAD = {
  customer: true,
  produkDitanya: { select: { sku: true, nama: true } },
  csUser: { select: { id: true, nama: true } },
} satisfies Prisma.LeadInclude;

export type LeadLengkap = Prisma.LeadGetPayload<{ include: typeof INCLUDE_LEAD }>;

/** Status yang tidak bisa dikembalikan ke status awal lewat update biasa. */
const STATUS_AWAL: readonly LeadStatus[] = ['baru', 'direspon'];

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lead dari SaaS CS AI. Idempoten di (cs_ai, external_id). */
  async buatDariCsAi(input: InputLead & { externalId: string }, waktu: Date) {
    const ada = await this.prisma.client.lead.findUnique({
      where: { sumber_externalId: { sumber: 'cs_ai', externalId: input.externalId } },
      include: INCLUDE_LEAD,
    });
    if (ada) return { lead: ada, baru: false };
    const lead = await this.buat(input, { sumber: 'cs_ai', agen: 'cs_ai', csUserId: null }, waktu);
    return { lead, baru: true };
  }

  /** Lead yang diinput CS manusia dari web. */
  async buatManual(input: InputLead, pelaku: Pelaku, waktu: Date) {
    const csUserId = pelaku.tipe === 'user' && pelaku.role === 'cs' ? pelaku.userId : null;
    return this.buat(
      { ...input, externalId: null },
      { sumber: 'cs_manusia', agen: 'cs_manusia', csUserId },
      waktu,
    );
  }

  private async buat(
    input: InputLead,
    asal: { sumber: 'cs_ai' | 'cs_manusia'; agen: 'cs_ai' | 'cs_manusia'; csUserId: string | null },
    waktu: Date,
  ): Promise<LeadLengkap> {
    const noWa = normalisasiNoWa(input.noWa);
    if (!noWa) {
      throw new BadRequestException(
        galat('validasi_gagal', 'Data tidak valid', [
          { field: 'no_wa', pesan: 'Nomor WA tidak valid' },
        ]),
      );
    }
    let produkDitanyaId: string | null = null;
    if (input.skuDitanya) {
      const p = await this.prisma.client.product.findUnique({ where: { sku: input.skuDitanya } });
      if (!p) {
        throw new BadRequestException(
          galat('validasi_gagal', 'Data tidak valid', [
            { field: 'sku_ditanya', pesan: 'SKU tidak dikenal' },
          ]),
        );
      }
      produkDitanyaId = p.id;
    }

    return this.prisma.client.$transaction(async (tx) => {
      const ada = await tx.customer.findUnique({ where: { noWa } });
      const customer =
        ada ??
        (await tx.customer.create({
          data: { noWa, nama: input.nama ?? null, createdAt: waktu },
        }));
      if (ada && !ada.nama && input.nama) {
        await tx.customer.update({ where: { id: ada.id }, data: { nama: input.nama } });
      }
      return tx.lead.create({
        data: {
          sumber: asal.sumber,
          externalId: input.externalId ?? null,
          customerId: customer.id,
          kanal: input.kanal ?? null,
          campaignId: input.campaignId ?? null,
          adsetId: input.adsetId ?? null,
          adId: input.adId ?? null,
          produkDitanyaId,
          agen: asal.agen,
          csUserId: asal.csUserId,
          masukAt: input.masukAt.getTime() <= waktu.getTime() ? input.masukAt : waktu,
          segmen: input.segmen ?? null,
          catatan: input.catatan ?? null,
          createdAt: waktu,
        },
        include: INCLUDE_LEAD,
      });
    });
  }

  async ambil(id: string): Promise<LeadLengkap> {
    const lead = await this.prisma.client.lead.findUnique({ where: { id }, include: INCLUDE_LEAD });
    if (!lead) throw new NotFoundException(galat('tidak_ditemukan', 'Lead tidak ditemukan'));
    return lead;
  }

  /**
   * Update sesuai cs-ai.v1 PATCH /leads/{id}: hanya field yang dikirim berubah,
   * respon pertama hanya sekali, handover tidak bisa dibatalkan.
   */
  async ubah(lead: Lead, u: UbahLead, waktu: Date): Promise<LeadLengkap> {
    const data: Prisma.LeadUpdateInput = {};
    if (u.status && u.status !== lead.status) {
      if (lead.status === 'closing' && u.status !== 'closing') {
        throw new ConflictException(
          galat('lead_sudah_closing', 'Lead yang sudah closing tidak bisa diubah statusnya'),
        );
      }
      if (u.status === 'closing') {
        throw new ConflictException(
          galat('closing_lewat_order', 'Status closing terisi otomatis saat order dibuat'),
        );
      }
      if (STATUS_AWAL.includes(u.status) && !STATUS_AWAL.includes(lead.status)) {
        throw new ConflictException(
          galat('status_mundur', `Lead berstatus ${lead.status} tidak bisa kembali ke ${u.status}`),
        );
      }
      data.status = u.status;
    }
    if (u.responPertamaAt && !lead.responPertamaAt) {
      data.responPertamaAt = u.responPertamaAt;
      if (lead.status === 'baru' && !data.status) data.status = 'direspon';
    }
    if (u.handover && !lead.handover) {
      data.handover = true;
      data.handoverAt = u.handover.terjadiAt ?? waktu;
      data.handoverAlasan = u.handover.alasan;
    }
    if (u.catatan !== undefined) data.catatan = u.catatan;
    return this.prisma.client.lead.update({ where: { id: lead.id }, data, include: INCLUDE_LEAD });
  }

  /**
   * Bagi lead ke CS (CS Leader). Order lead yang belum diverifikasi ikut pindah,
   * supaya CS tujuan bisa memverifikasinya.
   */
  async bagi(leadId: string, csUserId: string): Promise<LeadLengkap> {
    const cs = await this.prisma.client.user.findUnique({
      where: { id: csUserId },
      include: { role: true },
    });
    if (!cs || !cs.aktif || cs.role.kode !== 'cs') {
      throw new BadRequestException(galat('validasi_gagal', 'User tujuan bukan CS aktif'));
    }
    await this.ambil(leadId);
    return this.prisma.client.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { leadId, status: 'baru' },
        data: { csUserId, agen: 'cs_manusia' },
      });
      return tx.lead.update({ where: { id: leadId }, data: { csUserId }, include: INCLUDE_LEAD });
    });
  }

  /** CS Leader mengambil sendiri lead handover. */
  async ambilAlih(leadId: string, pelaku: Pelaku): Promise<LeadLengkap> {
    if (pelaku.tipe !== 'user') throw new ForbiddenException();
    const lead = await this.ambil(leadId);
    if (!lead.handover) {
      throw new ConflictException(galat('bukan_handover', 'Lead ini tidak sedang di-handover'));
    }
    return this.prisma.client.lead.update({
      where: { id: leadId },
      data: { csUserId: pelaku.userId },
      include: INCLUDE_LEAD,
    });
  }
}

/** CS hanya boleh menyentuh lead miliknya. */
export function pastikanLeadMilik(pelaku: Pelaku, lead: { csUserId: string | null }): void {
  if (pelaku.tipe !== 'user' || pelaku.izin.includes('lead.lihat_semua')) return;
  if (lead.csUserId === pelaku.userId) return;
  throw new ForbiddenException(galat('tidak_diizinkan', 'Lead ini bukan milik Anda'));
}
