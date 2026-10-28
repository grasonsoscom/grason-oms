import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { buatPrismaClient, type PrismaClient } from '@grason/db';
import { CONFIG, type ConfigApi } from '../config';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(CONFIG) config: ConfigApi) {
    this.client = buatPrismaClient(config.databaseUrl);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
