import { Global, Module } from '@nestjs/common';
import { CONFIG, muatConfig } from './config';

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => muatConfig(process.env) }],
  exports: [CONFIG],
})
export class ConfigModule {}
