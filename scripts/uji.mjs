/**
 * Lingkungan uji sambung dengan sistem nyata (Fase 3, keputusan 0007), terpisah dari demo:
 * database grason_oms_uji, Redis db 1, API :3002, web :3003, tanpa DEMO_MODE dan simulator.
 *
 *   pnpm uji:siapkan                       buat .env.uji, database, migrasi, seed
 *   pnpm uji                               jalankan API, worker, dan web
 *   pnpm uji apikey --sistem cs_ai --nama "…"   buat API key di database uji
 *
 * .env.uji (gitignored) hanya berisi nilai yang berbeda dari .env; sisanya dari .env.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE_ENV = path.join(AKAR, '.env');
const FILE_UJI = path.join(AKAR, '.env.uji');

function bacaEnv(file) {
  if (!existsSync(file)) return {};
  const hasil = {};
  for (const baris of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(baris);
    if (m) hasil[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return hasil;
}

/** .env.uji di atas .env; variabel yang sudah ada di proses tidak ditimpa dotenv anak. */
function envUji() {
  if (!existsSync(FILE_UJI)) {
    console.error('.env.uji belum ada. Jalankan dulu: pnpm uji:siapkan');
    process.exit(1);
  }
  return { ...process.env, ...bacaEnv(FILE_ENV), ...bacaEnv(FILE_UJI) };
}

/** shell: true dibutuhkan untuk pnpm.cmd di Windows; argumen berspasi harus dikutip sendiri. */
const kutip = (args) => args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));

function jalankan(perintah, args, env) {
  const r = spawnSync(perintah, kutip(args), { cwd: AKAR, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function siapkan() {
  const dasar = bacaEnv(FILE_ENV);
  if (!dasar.DATABASE_URL) {
    console.error('DATABASE_URL belum ada di .env');
    process.exit(1);
  }
  if (existsSync(FILE_UJI)) {
    console.log('.env.uji sudah ada; tidak ditimpa.');
  } else {
    const url = new URL(dasar.DATABASE_URL);
    url.pathname = '/grason_oms_uji';
    const redis = new URL(dasar.REDIS_URL ?? 'redis://localhost:6380');
    redis.pathname = '/1';
    writeFileSync(
      FILE_UJI,
      [
        '# Lingkungan uji sambung (pnpm uji). Jangan commit. Nilai lain diambil dari .env.',
        `DATABASE_URL=${url}`,
        `REDIS_URL=${redis}`,
        'API_PORT=3002',
        'WEB_ORIGIN=http://localhost:3003',
        'DEMO_MODE=false',
        'SESSION_COOKIE=oms_sesi_uji',
        '# Webhook order.status_changed ke GrasOn AI Chat. Kosong = belum dikirim.',
        'CS_AI_WEBHOOK_URL=',
        `CS_AI_WEBHOOK_SECRET=${randomBytes(32).toString('hex')}`,
        '',
      ].join('\n'),
    );
    console.log('.env.uji dibuat (database grason_oms_uji, API :3002, web :3003).');
  }
  const env = envUji();
  // migrate deploy membuat database bila belum ada.
  jalankan('pnpm', ['--filter', '@grason/db', 'exec', 'prisma', 'migrate', 'deploy'], env);
  jalankan('pnpm', ['--filter', '@grason/db', 'exec', 'prisma', 'db', 'seed'], env);
  console.log('\nSiap. Jalankan `pnpm uji`, lalu buat API key dengan `pnpm uji apikey …`.');
}

function mulai() {
  const env = envUji();
  const proses = [
    ['api', ['--filter', '@grason/api', 'exec', 'node', '-r', '@swc-node/register', 'src/main.ts']],
    ['worker', ['--filter', '@grason/worker', 'exec', 'tsx', 'src/main.ts']],
    [
      'web',
      ['--filter', '@grason/web', 'exec', 'next', 'dev', '--port', '3003'],
      { NEXT_DIST_DIR: '.next-uji', API_INTERNAL_URL: `http://localhost:${env.API_PORT}` },
    ],
  ];
  const anak = proses.map(([nama, args, tambahan]) => {
    const p = spawn('pnpm', kutip(args), { cwd: AKAR, env: { ...env, ...tambahan }, shell: true });
    const cetak = (data) => {
      for (const baris of String(data).split(/\r?\n/))
        if (baris) console.log(`[uji:${nama}] ${baris}`);
    };
    p.stdout.on('data', cetak);
    p.stderr.on('data', cetak);
    p.on('exit', (kode) => console.log(`[uji:${nama}] berhenti (${kode})`));
    return p;
  });
  console.log(`Uji sambung: API http://localhost:${env.API_PORT}, web http://localhost:3003`);
  process.on('SIGINT', () => {
    for (const p of anak) p.kill('SIGINT');
    process.exit(0);
  });
}

const [perintah, ...sisa] = process.argv.slice(2);
if (perintah === 'siapkan') siapkan();
else if (perintah === 'apikey')
  jalankan('pnpm', ['--filter', '@grason/api', 'apikey:create', ...sisa], envUji());
else if (!perintah || perintah === 'jalan') mulai();
else {
  console.error(
    'Pakai: pnpm uji [jalan] | pnpm uji:siapkan | pnpm uji apikey --sistem … --nama "…"',
  );
  process.exit(1);
}
