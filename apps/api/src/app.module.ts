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
import { CustomersController } from './customers/customers.controller';
import { PrismaModule } from './prisma/prisma.service';
import { ProductsController } from './products/products.controller';
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
  ],
  providers: [
    SesiService,
    ApiKeysService,
    { provide: APP_GUARD, useClass: AksesGuard },
    { provide: APP_FILTER, useClass: FilterGalat },
  ],
})
export class AppModule {}
