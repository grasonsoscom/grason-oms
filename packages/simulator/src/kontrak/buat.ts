import { readFileSync } from 'node:fs';
import path from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';

/** Nama file kontrak tanpa .yaml; tipe ditulis ke src/kontrak/<nama>.ts. */
export const SPEK_KONTRAK = ['cs-ai.v2', 'ethix.v1'] as const;

const DIR_KONTRAK = path.resolve(__dirname, '../../../../docs/api-contract');

const KEPALA = '// Dibuat otomatis dari docs/api-contract oleh gen-kontrak.ts. Jangan diedit.\n\n';

export async function buatTipeKontrak(spek: (typeof SPEK_KONTRAK)[number]): Promise<string> {
  const yaml = readFileSync(path.join(DIR_KONTRAK, `${spek}.yaml`), 'utf8');
  const ast = await openapiTS(yaml);
  return KEPALA + astToString(ast);
}
