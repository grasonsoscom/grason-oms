import { Injectable, NotFoundException } from '@nestjs/common';
import { SCOPE, SCOPE_SISTEM, type Scope, type Sistem } from '@grason/shared';
import { randomBytes } from 'node:crypto';
import { galat } from '../common/galat';
import type { Pelaku, PelakuApiKey } from '../common/pelaku';
import { samaAman, sha256, tokenAcak } from '../common/token';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** gok_<prefix 12 hex>_<secret 43 karakter base64url> */
const POLA_KUNCI = /^gok_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

const JEDA_UPDATE_DIPAKAI_MS = 5 * 60 * 1000;

export interface InputBuatApiKey {
  nama: string;
  sistem: Sistem;
  /** Kunci simulator (hanya dari pnpm demo:reset); boleh mengirim X-Sim-Waktu di mode demo. */
  simulator?: boolean;
  /** Default: semua scope sistem tersebut. */
  scopes?: Scope[];
}

export function buatKunci(): { kunci: string; prefix: string } {
  const prefix = randomBytes(6).toString('hex');
  return { kunci: `gok_${prefix}_${tokenAcak(32)}`, prefix };
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Kunci utuh hanya dikembalikan di sini, sekali. */
  async buat(input: InputBuatApiKey, pelaku?: Pelaku) {
    const scopes = input.scopes ?? [...SCOPE_SISTEM[input.sistem]];
    const { kunci, prefix } = buatKunci();
    const apiKey = await this.prisma.client.$transaction(async (tx) => {
      const dibuat = await tx.apiKey.create({
        data: {
          nama: input.nama,
          sistem: input.sistem,
          prefix,
          keyHash: sha256(kunci),
          simulator: input.simulator ?? false,
          scopes,
          dibuatOlehId: pelaku?.tipe === 'user' ? pelaku.userId : null,
        },
      });
      await this.audit.catat(
        {
          aksi: 'apikey.buat',
          pelaku,
          objekTipe: 'api_key',
          objekId: dibuat.id,
          sesudah: { nama: dibuat.nama, sistem: dibuat.sistem, prefix, scopes },
        },
        tx,
      );
      return dibuat;
    });
    return { ...this.tampilan(apiKey), kunci };
  }

  async daftar() {
    const semua = await this.prisma.client.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return semua.map((k) => this.tampilan(k));
  }

  async cabut(id: string, pelaku: Pelaku) {
    const ada = await this.prisma.client.apiKey.findUnique({ where: { id } });
    if (!ada) throw new NotFoundException(galat('tidak_ditemukan', 'API key tidak ditemukan'));
    if (ada.dicabutAt) return this.tampilan(ada);

    const dicabut = await this.prisma.client.$transaction(async (tx) => {
      const hasil = await tx.apiKey.update({ where: { id }, data: { dicabutAt: new Date() } });
      await this.audit.catat(
        { aksi: 'apikey.cabut', pelaku, objekTipe: 'api_key', objekId: id },
        tx,
      );
      return hasil;
    });
    return this.tampilan(dicabut);
  }

  /** Pelaku dari kunci, atau null bila format salah, tidak dikenal, atau dicabut. */
  async validasi(kunci: string): Promise<PelakuApiKey | null> {
    const cocok = POLA_KUNCI.exec(kunci);
    if (!cocok) return null;
    const apiKey = await this.prisma.client.apiKey.findUnique({ where: { prefix: cocok[1] } });
    if (!apiKey || apiKey.dicabutAt || !samaAman(apiKey.keyHash, sha256(kunci))) return null;

    const sekarang = Date.now();
    if (!apiKey.dipakaiAt || sekarang - apiKey.dipakaiAt.getTime() > JEDA_UPDATE_DIPAKAI_MS) {
      await this.prisma.client.apiKey.update({
        where: { id: apiKey.id },
        data: { dipakaiAt: new Date(sekarang) },
      });
    }

    return {
      tipe: 'api_key',
      apiKeyId: apiKey.id,
      nama: apiKey.nama,
      sistem: apiKey.sistem,
      simulator: apiKey.simulator,
      scopes: apiKey.scopes.filter((s): s is Scope => (SCOPE as readonly string[]).includes(s)),
    };
  }

  private tampilan(k: {
    id: string;
    nama: string;
    sistem: Sistem;
    simulator: boolean;
    prefix: string;
    scopes: string[];
    dipakaiAt: Date | null;
    dicabutAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: k.id,
      nama: k.nama,
      sistem: k.sistem,
      simulator: k.simulator,
      prefix: k.prefix,
      scopes: k.scopes,
      dipakaiAt: k.dipakaiAt,
      dicabutAt: k.dicabutAt,
      createdAt: k.createdAt,
    };
  }
}
