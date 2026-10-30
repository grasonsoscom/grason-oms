import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

// Validasi respons API terhadap docs/api-contract/*.yaml. Dipakai lagi oleh tes
// kontrak adaptor nyata di Fase 3.

const DIR_KONTRAK = path.resolve(__dirname, '../../../docs/api-contract');
/** Nama tanpa versi = v1. */
const SPEK = ['cs-ai', 'cs-ai.v2', 'ethix', 'adv-ai', 'adv-ai.v2'] as const;
export type Spek = (typeof SPEK)[number];

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
for (const nama of SPEK) {
  const file = nama.includes('.v') ? `${nama}.yaml` : `${nama}.v1.yaml`;
  const isi = parse(readFileSync(path.join(DIR_KONTRAK, file), 'utf8')) as object;
  ajv.addSchema({ ...isi, $id: nama });
}

/** Lempar galat berisi daftar pelanggaran bila `data` tidak sesuai skema kontrak. */
export function cocokKontrak(spek: Spek, skema: string, data: unknown): void {
  const validasi = ajv.getSchema(`${spek}#/components/schemas/${skema}`);
  if (!validasi) throw new Error(`Skema ${spek}#${skema} tidak ada`);
  if (!validasi(data)) {
    throw new Error(
      `Respons tidak sesuai ${spek} ${skema}:\n${ajv.errorsText(validasi.errors, { separator: '\n' })}\n${JSON.stringify(data, null, 2)}`,
    );
  }
}

/** Untuk respons yang skemanya inline di path: validasi item array `data`. */
export function cocokDaftar(spek: Spek, skema: string, body: { data: unknown[] }): void {
  for (const item of body.data) cocokKontrak(spek, skema, item);
}
