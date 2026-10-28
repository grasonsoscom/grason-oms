import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { SCOPE, SISTEM, scopeValidUntukSistem } from '@grason/shared';
import { z } from 'zod';
import { PelakuSaatIni, Perlu, PerluScope } from '../common/decorators';
import { galat, validasi } from '../common/galat';
import type { Pelaku } from '../common/pelaku';
import { ApiKeysService } from './api-keys.service';

const skemaBuat = z.object({
  nama: z.string().trim().min(3).max(100),
  sistem: z.enum(SISTEM),
  scopes: z.array(z.enum(SCOPE)).min(1).optional(),
});

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Perlu('apikey.kelola')
  @Get()
  daftar() {
    return this.apiKeys.daftar();
  }

  @Perlu('apikey.kelola')
  @Post()
  buat(@Body() body: unknown, @PelakuSaatIni() pelaku: Pelaku) {
    const input = validasi(skemaBuat, body);
    if (input.scopes && !scopeValidUntukSistem(input.sistem, input.scopes)) {
      throw new BadRequestException(
        galat('validasi_gagal', `Scope tidak sesuai untuk sistem ${input.sistem}`),
      );
    }
    return this.apiKeys.buat(input, pelaku);
  }

  @Perlu('apikey.kelola')
  @Delete(':id')
  cabut(@Param('id', ParseUUIDPipe) id: string, @PelakuSaatIni() pelaku: Pelaku) {
    return this.apiKeys.cabut(id, pelaku);
  }
}

/** Dipakai sistem luar untuk memeriksa kuncinya sendiri. */
@Controller('sistem')
export class SistemController {
  @PerluScope()
  @Get('saya')
  saya(@PelakuSaatIni() pelaku: Pelaku) {
    if (pelaku.tipe !== 'api_key') return null;
    return { nama: pelaku.nama, sistem: pelaku.sistem, scopes: pelaku.scopes };
  }
}
