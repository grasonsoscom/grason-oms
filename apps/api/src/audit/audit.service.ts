import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@grason/db';
import { kolomPelaku, type Pelaku } from '../common/pelaku';
import { PrismaService } from '../prisma/prisma.service';

export interface EntriAudit {
  aksi: string;
  pelaku?: Pelaku;
  /** Untuk aksi tanpa pelaku login, mis. login gagal. */
  userId?: string;
  objekTipe?: string;
  objekId?: string;
  sebelum?: Prisma.InputJsonValue;
  sesudah?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async catat(entri: EntriAudit, tx: Prisma.TransactionClient = this.prisma.client): Promise<void> {
    const pelaku = kolomPelaku(entri.pelaku);
    await tx.auditLog.create({
      data: {
        ...pelaku,
        userId: pelaku.userId ?? entri.userId ?? null,
        aksi: entri.aksi,
        objekTipe: entri.objekTipe,
        objekId: entri.objekId,
        sebelum: entri.sebelum,
        sesudah: entri.sesudah,
        ip: entri.ip,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
