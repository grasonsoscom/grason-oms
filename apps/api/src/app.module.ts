import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiKeysController, SistemController } from './api-keys/api-keys.controller';
import { ApiKeysService } from './api-keys/api-keys.service';
import { AuditModule } from './audit/audit.service';
import { AksesGuard } from './auth/akses.guard';
import { AuthController } from './auth/auth.controller';
import { SesiService } from './auth/sesi.service';
import { Publik } from './common/decorators';
import { FilterGalat } from './common/galat';
import { ConfigModule } from './config.module';
import { AppIntegrasiController } from './app/app-integrasi.controller';
import { AppLeadsController } from './app/app-leads.controller';
import { AppOrdersController } from './app/app-orders.controller';
import { AppRingkasanController } from './app/app-ringkasan.controller';
import { AppUmumController } from './app/app-umum.controller';
import { CustomersController } from './customers/customers.controller';
import { EthixService } from './ethix/ethix.service';
import { CsAiController } from './kontrak/cs-ai.controller';
import { EthixController } from './kontrak/ethix.controller';
import { LeadsService } from './leads/leads.service';
import { OrdersService } from './orders/orders.service';
import { StatusService } from './orders/status.service';
import { PrismaModule } from './prisma/prisma.service';
import { ProductsController } from './products/products.controller';
import { StokService } from './stok/stok.service';
import { UsersController } from './users/users.controller';

@Controller('health')
class HealthController {
  @Publik()
  @Get()
  cek() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    ApiKeysController,
    SistemController,
    ProductsController,
    CustomersController,
    CsAiController,
    EthixController,
    AppLeadsController,
    AppOrdersController,
    AppUmumController,
    AppRingkasanController,
    AppIntegrasiController,
  ],
  providers: [
    SesiService,
    ApiKeysService,
    StokService,
    StatusService,
    OrdersService,
    LeadsService,
    EthixService,
    { provide: APP_GUARD, useClass: AksesGuard },
    { provide: APP_FILTER, useClass: FilterGalat },
  ],
})
export class AppModule {}
