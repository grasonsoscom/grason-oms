/**
 * Buat tipe TypeScript dari docs/api-contract/*.v1.yaml ke src/kontrak/.
 * Jalankan setelah kontrak berubah: pnpm --filter @grason/simulator gen:kontrak
 * Tes test/kontrak.test.ts memastikan hasilnya tidak tertinggal dari file kontrak.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buatTipeKontrak, SPEK_KONTRAK } from './kontrak/buat';

async function main(): Promise<void> {
  for (const spek of SPEK_KONTRAK) {
    const isi = await buatTipeKontrak(spek);
    const tujuan = path.resolve(__dirname, 'kontrak', `${spek}.v1.ts`);
    writeFileSync(tujuan, isi);
    console.log(`Ditulis ${path.relative(process.cwd(), tujuan)}`);
  }
}

void main();
