import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { ConfigApi } from './config';

export const PREFIX_API = 'api/v1';

/** Pengaturan bersama untuk main.ts dan tes. */
export function siapkanApp(app: INestApplication, config: ConfigApi): INestApplication {
  app.setGlobalPrefix(PREFIX_API);
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  return app;
}
