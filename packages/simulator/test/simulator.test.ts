import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Acak } from '../src/acak';
import { muatKonfigurasi } from '../src/konfigurasi';
import { buatTipeKontrak, SPEK_KONTRAK } from '../src/kontrak/buat';

describe('tipe kontrak', () => {
  it.each(SPEK_KONTRAK)('src/kontrak/%s.v1.ts sesuai docs/api-contract', async (spek) => {
    const tersimpan = readFileSync(path.resolve(__dirname, `../src/kontrak/${spek}.v1.ts`), 'utf8');
    // Gagal di sini: jalankan `pnpm --filter @grason/simulator gen:kontrak`.
    expect(tersimpan).toBe(await buatTipeKontrak(spek));
  });
});

describe('Acak', () => {
  it('seed sama = urutan sama', () => {
    const a = new Acak(42);
    const b = new Acak(42);
    const deretA = Array.from({ length: 5 }, () => a.antara(1, 100));
    expect(Array.from({ length: 5 }, () => b.antara(1, 100))).toEqual(deretA);
    expect(Array.from({ length: 5 }, () => new Acak(43).antara(1, 100))).not.toEqual(deretA);
  });

  it('antara inklusif dan pilihBobot menghormati bobot nol', () => {
    const a = new Acak(1);
    for (let i = 0; i < 200; i += 1) {
      const n = a.antara(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      expect(
        a.pilihBobot([
          ['x', 1],
          ['y', 0],
        ] as const),
      ).toBe('x');
    }
  });
});

describe('konfigurasi', () => {
  it('kunci dari env; akun hanya bila password demo ada', () => {
    const k = muatKonfigurasi({ SIM_CS_AI_KEY: 'gok_a', SIM_ETHIX_KEY: 'gok_b' });
    expect(k.kunci).toEqual({ csAi: 'gok_a', ethix: 'gok_b' });
  });
});
