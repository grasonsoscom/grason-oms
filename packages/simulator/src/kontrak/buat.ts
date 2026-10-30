import { readFileSync } from 'node:fs';
import path from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';

export const SPEK_KONTRAK = ['cs-ai', 'ethix'] as const;

const DIR_KONTRAK = path.resolve(__dirname, '../../../../docs/api-contract');

const KEPALA = '// Dibuat otomatis dari docs/api-contract oleh gen-kontrak.ts. Jangan diedit.\n\n';

export async function buatTipeKontrak(spek: (typeof SPEK_KONTRAK)[number]): Promise<string> {
  const yaml = readFileSync(path.join(DIR_KONTRAK, `${spek}.v1.yaml`), 'utf8');
  const ast = await openapiTS(yaml);
  return KEPALA + astToString(ast);
}
