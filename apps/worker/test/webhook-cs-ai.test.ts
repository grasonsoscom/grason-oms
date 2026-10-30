import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@grason/db';
import { mulaiWebhookCsAi } from '../src/webhook-cs-ai';

describe('mulaiWebhookCsAi', () => {
  it('tidak aktif tanpa URL dan secret webhook', () => {
    const log: string[] = [];
    const prisma = {} as PrismaClient;
    expect(mulaiWebhookCsAi(prisma, {}, (p) => log.push(p))).toBeNull();
    expect(
      mulaiWebhookCsAi(prisma, { CS_AI_WEBHOOK_URL: 'https://x.test/w' }, (p) => log.push(p)),
    ).toBeNull();
    expect(log[0]).toContain('tidak aktif');
  });

  it('aktif bila keduanya diisi; secret tidak ditulis ke log', () => {
    const log: string[] = [];
    const henti = mulaiWebhookCsAi(
      {} as PrismaClient,
      {
        CS_AI_WEBHOOK_URL: 'https://ai-chat.test/api/webhooks/oms',
        CS_AI_WEBHOOK_SECRET: 'rahasia',
      },
      (p) => log.push(p),
    );
    expect(henti).toBeTypeOf('function');
    henti!();
    expect(log.join(' ')).toContain('https://ai-chat.test');
    expect(log.join(' ')).not.toContain('rahasia');
  });
});
