/**
 * pnpm sim [opsi]
 *   --lead 200 --hari 7        jumlah lead dalam N hari terakhir (butuh DEMO_MODE=true di API)
 *   --seed 42                  seed sama = data sama
 *   --closing 0.45 --gagal 0.2 --handover 0.12 --cod 0.85 --campur 0.12 --rts 0.12
 *   --manual 0.1 --repeat 0.08 peluang tiap kejadian (0–1)
 *   --stok-awal 150            stok awal SKU pertama di gudang Ethix palsu (SKU lain 50/25/12%)
 *   --api http://localhost:3001
 *   --langsung                 jalan terus dengan jam nyata (Ctrl+C untuk berhenti)
 *   --lead-per-jam 30 --percepat 60   hanya untuk --langsung
 *
 * Keadaan gudang Ethix palsu disimpan di .demo/gudang-ethix.json. --langsung memakainya
 * untuk melanjutkan order yang masih di gudang atau di jalan dari run sebelumnya.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config as muatEnv } from 'dotenv';
import { AKAR_REPO, muatGudang, muatKonfigurasi, simpanGudang } from './konfigurasi';
import { PELUANG_DEFAULT, Simulasi, type Laporan, type Peluang } from './simulasi';

muatEnv({ path: path.join(AKAR_REPO, '.env'), quiet: true });

const PELUANG = Object.keys(PELUANG_DEFAULT) as (keyof Peluang)[];

function angka(
  nama: string,
  nilai: string | undefined,
  bawaan: number,
  min = 0,
  maks = Infinity,
): number {
  if (nilai === undefined) return bawaan;
  const n = Number(nilai);
  if (!Number.isFinite(n) || n < min || n > maks) {
    console.error(`--${nama} harus angka ${min}–${maks}`);
    process.exit(1);
  }
  return n;
}

function cetak(l: Laporan): void {
  console.log(`
Ringkasan simulasi
  Lead            ${l.lead} (manual ${l.leadManual}, handover ${l.handover})
  Checkout/order  ${l.checkout} checkout → ${l.order} order (ditolak stok ${l.ditolakStok}, batal ${l.batal})
  Terverifikasi   ${l.terverifikasi} (menunggu CS manusia ${l.menungguVerifikasiManusia})
  Pengiriman      dikirim ${l.dikirim}, terkirim ${l.terkirim}, RTS ${l.rts}
  Masih berjalan  ${l.masihBerjalan} langkah terjadwal setelah sekarang
  Permintaan API  ${l.permintaan} (galat ${l.galat})`);
}

async function main(): Promise<void> {
  const { values: v } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      lead: { type: 'string' },
      hari: { type: 'string' },
      seed: { type: 'string' },
      'stok-awal': { type: 'string' },
      api: { type: 'string' },
      langsung: { type: 'boolean' },
      'lead-per-jam': { type: 'string' },
      percepat: { type: 'string' },
      ...Object.fromEntries(PELUANG.map((k) => [k, { type: 'string' as const }])),
    },
  });
  const baseUrl =
    (v.api as string | undefined) ?? `http://localhost:${process.env.API_PORT ?? 3001}`;
  const sehat = await fetch(`${baseUrl}/api/v1/health`).catch(() => null);
  if (!sehat?.ok) {
    console.error(`API OMS tidak bisa dihubungi di ${baseUrl}. Jalankan dulu \`pnpm dev\`.`);
    process.exit(1);
  }

  const konfig = muatKonfigurasi(process.env);
  if (!konfig.akun) {
    console.warn(
      'Akun demo tidak ditemukan (DEMO_PASSWORD / pnpm demo:reset); bagian CS manusia dilewati.',
    );
  }
  const peluang = Object.fromEntries(
    PELUANG.map((k) => [
      k,
      angka(k, (v as Record<string, string | undefined>)[k], PELUANG_DEFAULT[k], 0, 1),
    ]),
  ) as unknown as Peluang;

  const sim = new Simulasi({
    baseUrl,
    kunci: konfig.kunci,
    akun: konfig.akun,
    lead: angka('lead', v.lead as string | undefined, 200, 1, 20_000),
    hari: angka('hari', v.hari as string | undefined, 7, 1, 90),
    seed: angka('seed', v.seed as string | undefined, Math.floor(Date.now() / 1000) % 1_000_000),
    peluang,
    stokAwal: angka('stok-awal', v['stok-awal'] as string | undefined, 150, 1),
    log: (p) => console.log(`  · ${p}`),
    // Mode langsung melanjutkan gudang Ethix dari run sebelumnya (mis. pengisian 7 hari).
    gudang: v.langsung ? muatGudang() : null,
    simpanGudang: (k) => simpanGudang(k),
  });

  if (v.langsung) {
    let berhenti = false;
    process.on('SIGINT', () => {
      berhenti = true;
    });
    const leadPerJam = angka('lead-per-jam', v['lead-per-jam'] as string | undefined, 30, 0.1);
    const percepat = angka('percepat', v.percepat as string | undefined, 60, 1);
    console.log(
      `Mode langsung: ~${leadPerJam} lead/jam, waktu proses dipercepat ${percepat}×. Ctrl+C untuk berhenti.`,
    );
    cetak(await sim.jalankanLangsung({ leadPerJam, percepat, berhenti: () => berhenti }));
    return;
  }

  console.log('Mengisi data simulasi…');
  const mulai = Date.now();
  cetak(await sim.jalankan());
  console.log(`  Selesai dalam ${((Date.now() - mulai) / 1000).toFixed(1)} detik.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
