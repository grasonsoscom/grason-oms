import 'reflect-metadata';
import path from 'node:path';
import { config as muatEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { siapkanApp } from './buat-app';
import { CONFIG, type ConfigApi } from './config';

muatEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigApi>(CONFIG);
  siapkanApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`API OMS GRASON berjalan di http://localhost:${config.port}`);
}

void main();
