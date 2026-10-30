import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Agen, MetodeBayar, Prisma, Sumber } from '@grason/db';
import {
  GalatCheckout,
  STATUS_BOLEH_BATAL,
  STATUS_BOLEH_KOREKSI_ALAMAT,
  nomorOrder,
  normalisasiNoWa,
  pecahCheckout,
  tanggalWib,
  type ItemCheckout,
} from '@grason/shared';
import { AuditService } from '../audit/audit.service';
import { galat } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';
import { StokService, type StokProduk } from '../stok/stok.service';
import { StatusService } from './status.service';

type Db = Prisma.TransactionClient;

export interface AlamatInput {
  alamat: string;
  kelurahan?: string | null;
  kecamatan?: string | null;
  kota: string;
  provinsi: string;
  kodePos?: string | null;
}

export interface InputCheckout {
  sumber: Sumber;
  externalId?: string | null;
  leadId: string;
  agen: Agen;
  csUserId?: string | null;
  metodeBayar: MetodeBayar;
  penerima: { nama: string; noWa: string };
  alamat: AlamatInput;
  items: { sku: string; qty: number }[];
  ongkir: number;
  diskon: number;
  catatan?: string | null;
}

export const INCLUDE_ORDER = {
  items: { include: { product: { select: { sku: true, nama: true } } } },
  shipments: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.OrderInclude;

export type OrderLengkap = Prisma.OrderGetPayload<{ include: typeof INCLUDE_ORDER }>;

interface ItemSiap {
  items: ItemCheckout[];
  stok: Map<string, StokProduk>;
  /** productId → komponen satuan (produk satuan = dirinya sendiri). */
  komponen: Map<string, { id: string; qty: number }[]>;
}

export interface HasilCheckout {
  baru: boolean;
  grup: { id: string; externalId: string | null };
  orders: OrderLengkap[];
}

/** Hasil pemecahan tanpa menyimpan, untuk pratinjau form order. */
export interface Pratinjau {
  orders: ReturnType<typeof pecahCheckout>;
  kurang: { sku: string; diminta: number; tersedia: number }[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stok: StokService,
    private readonly status: StatusService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Buat checkout: cek stok seluruh checkout sekaligus, pecah per entitas, simpan
   * satu order_group dengan 1–2 order. Idempoten di (sumber, external_id).
   */
  async buatCheckout(input: InputCheckout, pelaku: Pelaku, waktu: Date): Promise<HasilCheckout> {
    if (input.externalId) {
      const ada = await this.cariGrup(input.sumber, input.externalId);
      if (ada) return { ...ada, baru: false };
    }

    const lead = await this.prisma.client.lead.findUnique({
      where: { id: input.leadId },
      include: { customer: true },
    });
    if (!lead) throw new NotFoundException(galat('lead_tidak_ditemukan', 'Lead tidak ditemukan'));

    const noWaPenerima = normalisasiNoWa(input.penerima.noWa);
    if (!noWaPenerima) {
      throw new UnprocessableEntityException(
        galat('validasi_gagal', 'Nomor WA penerima tidak valid', [
          { field: 'penerima.no_wa', pesan: 'Nomor WA tidak valid' },
        ]),
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      await this.stok.kunci(tx);
      const siap = await this.siapkanItem(tx, input.items, waktu);
      const kurang = this.cekStok(input.items, siap);
      const { items } = siap;
      if (kurang.length > 0) {
        throw new UnprocessableEntityException(
          galat('stok_tidak_cukup', 'Stok tidak cukup', kurang),
        );
      }
      const pecahan = this.pecah(items, input);

      const grup = await tx.orderGroup.create({
        data: {
          sumber: input.sumber,
          externalId: input.externalId ?? null,
          leadId: lead.id,
          customerId: lead.customerId,
          metodeBayar: input.metodeBayar,
          subtotal: pecahan.reduce((a, o) => a + o.subtotal, 0),
          diskon: input.diskon,
          ongkir: input.ongkir,
          total: pecahan.reduce((a, o) => a + o.total, 0),
          createdAt: waktu,
        },
      });

      const ids: string[] = [];
      for (const o of pecahan) {
        const order = await tx.order.create({
          data: {
            nomor: await this.nomorBerikutnya(tx, waktu),
            orderGroupId: grup.id,
            sumber: input.sumber,
            externalId: input.externalId ? `${input.externalId}:${o.entitas}` : null,
            leadId: lead.id,
            customerId: lead.customerId,
            agen: input.agen,
            csUserId: input.csUserId ?? lead.csUserId,
            entitas: o.entitas,
            metodeBayar: input.metodeBayar,
            subtotal: o.subtotal,
            diskon: o.diskon,
            ongkir: o.ongkir,
            total: o.total,
            nilaiCod: o.nilaiCod,
            perluVerifikasiManusia: lead.customer.tandaRts,
            catatan: input.catatan ?? null,
            penerimaNama: input.penerima.nama,
            penerimaNoWa: noWaPenerima,
            ...this.kolomAlamat(input.alamat),
            createdAt: waktu,
            items: {
              create: o.items.map((i) => ({
                productId: i.productId,
                qty: i.qty,
                hargaSatuan: i.hargaSatuan,
                subtotal: i.subtotal,
              })),
            },
          },
        });
        await this.status.catatRiwayat(tx, order.id, null, 'baru', { pelaku, waktu });
        ids.push(order.id);
      }

      // Alamat terakhir pelanggan dan status lead ikut diperbarui.
      await tx.customer.update({
        where: { id: lead.customerId },
        data: {
          nama: lead.customer.nama ?? input.penerima.nama,
          ...this.kolomAlamat(input.alamat),
        },
      });
      if (lead.status !== 'closing') {
        await tx.lead.update({ where: { id: lead.id }, data: { status: 'closing' } });
      }

      const orders = await tx.order.findMany({
        where: { id: { in: ids } },
        include: INCLUDE_ORDER,
        orderBy: { nomor: 'asc' },
      });
      return { baru: true, grup: { id: grup.id, externalId: grup.externalId }, orders };
    });
  }

  /** Pratinjau pemecahan dan kecukupan stok, tanpa menyimpan. */
  async pratinjau(
    input: Pick<InputCheckout, 'items' | 'metodeBayar' | 'ongkir' | 'diskon'>,
    waktu: Date,
  ): Promise<Pratinjau> {
    const tx = this.prisma.client;
    const siap = await this.siapkanItem(tx, input.items, waktu);
    return { orders: this.pecah(siap.items, input), kurang: this.cekStok(input.items, siap) };
  }

  async verifikasi(
    orderId: string,
    v: { dikonfirmasiAt: Date; nilaiCodDikonfirmasi: number; catatan?: string | null },
    pelaku: Pelaku,
    waktu: Date,
  ): Promise<OrderLengkap> {
    return this.prisma.client.$transaction(async (tx) => {
      const order = await this.ambilUntukUbah(tx, orderId);
      if (order.status === 'terverifikasi') return this.lengkap(tx, orderId);
      if (order.status !== 'baru') {
        throw new ConflictException(
          galat('status_tidak_sesuai', `Order berstatus ${order.status} tidak bisa diverifikasi`),
        );
      }
      if (order.perluVerifikasiManusia && pelaku.tipe === 'api_key') {
        throw new UnprocessableEntityException(
          galat(
            'perlu_verifikasi_manusia',
            'Pelanggan punya riwayat RTS; verifikasi wajib oleh CS manusia',
          ),
        );
      }
      if (v.nilaiCodDikonfirmasi !== order.nilaiCod) {
        throw new UnprocessableEntityException(
          galat('nilai_cod_tidak_cocok', 'Nilai COD yang dikonfirmasi tidak sama dengan order', {
            nilai_cod: order.nilaiCod,
            dikonfirmasi: v.nilaiCodDikonfirmasi,
          }),
        );
      }
      const pada = v.dikonfirmasiAt.getTime() <= waktu.getTime() ? v.dikonfirmasiAt : waktu;
      await this.status.ubah(tx, order, 'terverifikasi', {
        pelaku,
        waktu: pada,
        catatan: v.catatan,
        data: { terverifikasiAt: pada },
      });
      return this.lengkap(tx, orderId);
    });
  }

  async batal(orderId: string, alasan: string, pelaku: Pelaku, waktu: Date): Promise<OrderLengkap> {
    return this.prisma.client.$transaction(async (tx) => {
      const order = await this.ambilUntukUbah(tx, orderId);
      if (!STATUS_BOLEH_BATAL.includes(order.status)) {
        throw new ConflictException(
          galat(
            'tidak_bisa_dibatalkan',
            order.status === 'di_gudang'
              ? 'Order sudah diterima Ethix; pembatalan lewat Ethix menyusul di Fase 3'
              : `Order berstatus ${order.status} tidak bisa dibatalkan`,
          ),
        );
      }
      await this.status.ubah(tx, order, 'batal', {
        pelaku,
        waktu,
        catatan: alasan,
        alasan: 'dibatalkan',
        data: { dibatalkanAt: waktu, alasanBatal: alasan },
      });
      return this.lengkap(tx, orderId);
    });
  }

  async koreksiAlamat(
    orderId: string,
    data: { penerimaNama?: string; penerimaNoWa?: string; alamat: AlamatInput },
    pelaku: Pelaku,
  ): Promise<OrderLengkap> {
    return this.prisma.client.$transaction(async (tx) => {
      const order = await this.ambilUntukUbah(tx, orderId);
      if (!STATUS_BOLEH_KOREKSI_ALAMAT.includes(order.status)) {
        throw new ConflictException(
          galat('alamat_terkunci', 'Alamat tidak bisa diubah setelah order diterima Ethix'),
        );
      }
      let noWa: string | undefined;
      if (data.penerimaNoWa !== undefined) {
        noWa = normalisasiNoWa(data.penerimaNoWa) ?? undefined;
        if (!noWa) {
          throw new UnprocessableEntityException(
            galat('validasi_gagal', 'Nomor WA penerima tidak valid'),
          );
        }
      }
      const sebelum = {
        penerimaNama: order.penerimaNama,
        alamat: order.alamat,
        kota: order.kota,
        provinsi: order.provinsi,
      };
      await tx.order.update({
        where: { id: orderId },
        data: {
          ...(data.penerimaNama ? { penerimaNama: data.penerimaNama } : {}),
          ...(noWa ? { penerimaNoWa: noWa } : {}),
          ...this.kolomAlamat(data.alamat),
        },
      });
      // Isi alamat tidak dicatat di audit (data pribadi); cukup jejak siapa mengubah.
      await this.audit.catat(
        {
          aksi: 'order.koreksi_alamat',
          pelaku,
          objekTipe: 'order',
          objekId: orderId,
          sebelum: { kota: sebelum.kota, provinsi: sebelum.provinsi },
          sesudah: { kota: data.alamat.kota, provinsi: data.alamat.provinsi },
        },
        tx,
      );
      return this.lengkap(tx, orderId);
    });
  }

  async lengkap(tx: Db, orderId: string): Promise<OrderLengkap> {
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: INCLUDE_ORDER });
  }

  private async ambilUntukUbah(tx: Db, orderId: string) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(galat('tidak_ditemukan', 'Order tidak ditemukan'));
    return order;
  }

  private async cariGrup(sumber: Sumber, externalId: string) {
    const grup = await this.prisma.client.orderGroup.findUnique({
      where: { sumber_externalId: { sumber, externalId } },
      include: { orders: { include: INCLUDE_ORDER, orderBy: { nomor: 'asc' } } },
    });
    return grup
      ? { grup: { id: grup.id, externalId: grup.externalId }, orders: grup.orders }
      : null;
  }

  private async siapkanItem(
    tx: Db,
    diminta: { sku: string; qty: number }[],
    waktu: Date,
  ): Promise<ItemSiap> {
    const skus = [...new Set(diminta.map((i) => i.sku))];
    const produk = await tx.product.findMany({
      where: { sku: { in: skus } },
      include: { bundleItems: true },
    });
    const perSku = new Map(produk.map((p) => [p.sku, p]));
    const tidakDikenal = skus.filter((s) => !perSku.has(s));
    if (tidakDikenal.length > 0) {
      throw new UnprocessableEntityException(
        galat('sku_tidak_dikenal', 'SKU tidak dikenal', { sku: tidakDikenal }),
      );
    }
    const nonaktif = produk.filter((p) => !p.aktif).map((p) => p.sku);
    if (nonaktif.length > 0) {
      throw new UnprocessableEntityException(
        galat('produk_nonaktif', 'Produk tidak aktif', { sku: nonaktif }),
      );
    }
    const stok = new Map((await this.stok.hitung(waktu, tx)).map((s) => [s.productId, s]));
    const items = diminta.map((i) => {
      const p = perSku.get(i.sku)!;
      return {
        productId: p.id,
        sku: p.sku,
        entitas: p.entitas,
        qty: i.qty,
        hargaSatuan: p.hargaJual,
        beratGram: p.beratGram,
      };
    });
    const komponen = new Map(
      produk.map((p) => [
        p.id,
        p.tipe === 'paket'
          ? p.bundleItems.map((b) => ({ id: b.componentProductId, qty: b.qty }))
          : [{ id: p.id, qty: 1 }],
      ]),
    );
    return { items, stok, komponen };
  }

  /**
   * Cek stok di level komponen: paket VVG-P2 dan VVG-01 dalam satu checkout memakai
   * stok komponen yang sama.
   */
  private cekStok(
    diminta: { sku: string; qty: number }[],
    { items, stok, komponen }: ItemSiap,
  ): Pratinjau['kurang'] {
    // Butuh per produk satuan dari seluruh checkout.
    const butuh = new Map<string, number>();
    const komponenDari = (productId: string) => komponen.get(productId) ?? [];
    for (const item of items) {
      for (const k of komponenDari(item.productId)) {
        butuh.set(k.id, (butuh.get(k.id) ?? 0) + k.qty * item.qty);
      }
    }
    const kurangKomponen = new Set(
      [...butuh].filter(([id, qty]) => qty > (stok.get(id)?.tersedia ?? 0)).map(([id]) => id),
    );
    if (kurangKomponen.size === 0) return [];
    const totalPerSku = new Map<string, number>();
    for (const d of diminta) totalPerSku.set(d.sku, (totalPerSku.get(d.sku) ?? 0) + d.qty);
    return items
      .filter((i, idx) => items.findIndex((x) => x.sku === i.sku) === idx)
      .filter((i) => komponenDari(i.productId).some((k) => kurangKomponen.has(k.id)))
      .map((i) => ({
        sku: i.sku,
        diminta: totalPerSku.get(i.sku)!,
        tersedia: stok.get(i.productId)?.tersedia ?? 0,
      }));
  }

  private pecah(
    items: ItemCheckout[],
    input: Pick<InputCheckout, 'metodeBayar' | 'ongkir' | 'diskon'>,
  ) {
    try {
      return pecahCheckout({
        items,
        metodeBayar: input.metodeBayar,
        ongkir: input.ongkir,
        diskon: input.diskon,
      });
    } catch (e) {
      if (e instanceof GalatCheckout) {
        throw new UnprocessableEntityException(galat(e.kode, e.message));
      }
      throw e;
    }
  }

  private kolomAlamat(a: AlamatInput) {
    return {
      alamat: a.alamat,
      kelurahan: a.kelurahan ?? null,
      kecamatan: a.kecamatan ?? null,
      kota: a.kota,
      provinsi: a.provinsi,
      kodePos: a.kodePos ?? null,
    };
  }

  /** Nomor urut harian WIB, atomik lewat upsert. */
  private async nomorBerikutnya(tx: Db, waktu: Date): Promise<string> {
    const tanggal = new Date(`${tanggalWib(waktu)}T00:00:00Z`);
    const [baris] = await tx.$queryRaw<{ terakhir: number }[]>`
      INSERT INTO order_number_counters (tanggal, terakhir) VALUES (${tanggal}::date, 1)
      ON CONFLICT (tanggal) DO UPDATE SET terakhir = order_number_counters.terakhir + 1
      RETURNING terakhir`;
    return nomorOrder(waktu, baris!.terakhir);
  }
}

/** Untuk controller: cek CS hanya boleh menyentuh order miliknya. */
export function pastikanMilik(
  pelaku: Pelaku,
  order: { csUserId: string | null },
  leadCsUserId?: string | null,
): void {
  if (pelaku.tipe !== 'user' || pelaku.izin.includes('order.lihat_semua')) return;
  if (order.csUserId === pelaku.userId || leadCsUserId === pelaku.userId) return;
  throw new ForbiddenException(galat('tidak_diizinkan', 'Order ini bukan milik Anda'));
}
