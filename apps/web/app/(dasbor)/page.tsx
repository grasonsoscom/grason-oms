'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { LABEL_PERIODE, PERIODE, type Periode } from '@grason/shared';
import { useSesi } from '@/components/sesi';
import { Kartu, Lencana, PesanGalat, kelasInput, useData } from '@/components/ui';
import {
  LABEL_COVER,
  WARNA_COVER,
  WARNA_STATUS_ORDER,
  labelStatusOrder,
  perbandingan,
  queryString,
  rupiah,
  umur,
  waktu,
  type Arah,
} from '@/lib/format';
import type { Banding, Produk, Ringkasan, StatusAktif } from '@/lib/tipe';

/** Kartu mengisi baris penuh (auto-fit), jadi tidak ada slot kosong berapa pun jumlahnya. */
const GRID = 'grid gap-3 grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]';

const NADA = {
  biasa: 'border-slate-200 bg-white',
  kuning: 'border-amber-300 bg-amber-50',
  merah: 'border-red-300 bg-red-50',
} as const;

const WARNA_ARAH: Record<Arah, string> = {
  naik: 'text-emerald-700',
  turun: 'text-red-700',
  sama: 'text-slate-500',
  baru: 'text-emerald-700',
  kosong: 'text-slate-400',
};

function Angka({
  label,
  nilai,
  sub,
  href,
  nada = 'biasa',
}: {
  label: string;
  nilai: ReactNode;
  sub?: ReactNode;
  href?: string;
  nada?: keyof typeof NADA;
}) {
  const isi = (
    <div
      className={`h-full rounded-xl border p-4 ${NADA[nada]} ${href ? 'transition hover:border-slate-500' : ''}`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{nilai}</div>
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {isi}
    </Link>
  ) : (
    isi
  );
}

function Selisih({ b, label }: { b: Banding; label: string }) {
  const p = perbandingan(b.nilai, b.sebelumnya);
  return (
    <span className="text-slate-500">
      <span className={`font-medium ${WARNA_ARAH[p.arah]}`}>{p.teks}</span> vs {label}
    </span>
  );
}

const STATUS_AKTIF: StatusAktif[] = ['baru', 'terverifikasi', 'di_gudang', 'dikirim'];

function Isi() {
  const user = useSesi();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const periode = (PERIODE as readonly string[]).includes(sp.get('periode') ?? '')
    ? (sp.get('periode') as Periode)
    : 'hari_ini';
  const produk = sp.get('produk') ?? '';
  const { data, galat, memuat } = useData<Ringkasan>(
    `/app/ringkasan${queryString({ periode, produk })}`,
  );
  const { data: daftarProduk } = useData<Produk[]>('/products');

  const atur = (k: string, v: string) =>
    router.replace(`${path}${queryString({ periode, produk, [k]: v })}`);
  /** Tautan ke daftar terfilter, membawa filter produk. */
  const ke = (base: string, f: Record<string, string>) => `${base}${queryString({ ...f, produk })}`;

  const p = data?.periode;
  const t = data?.tindakan;
  const vs = p?.labelSebelumnya ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Ringkasan</h1>
          <p className="text-sm text-slate-500">
            {user.nama} · {user.roleLabel}
            {data && ` · per ${waktu(data.waktu)} WIB`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm"
            role="group"
            aria-label="Periode"
          >
            {PERIODE.map((k) => (
              <button
                key={k}
                onClick={() => atur('periode', k === 'hari_ini' ? '' : k)}
                aria-pressed={periode === k}
                className={`rounded-md px-3 py-1 whitespace-nowrap ${
                  periode === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {LABEL_PERIODE[k].ini}
              </button>
            ))}
          </div>
          <select
            aria-label="Produk"
            className={`${kelasInput} w-auto`}
            value={produk}
            onChange={(e) => atur('produk', e.target.value)}
          >
            <option value="">Semua produk</option>
            {daftarProduk
              ?.filter((x) => x.tipe === 'satuan')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nama}
                </option>
              ))}
          </select>
        </div>
      </div>
      <PesanGalat pesan={galat} />

      {p && (
        <section className={`space-y-2 ${memuat ? 'opacity-60' : ''}`}>
          <h2 className="text-sm font-medium text-slate-600">{p.label}</h2>
          <div className={GRID}>
            {p.leadMasuk && (
              <Angka
                label="Lead masuk"
                nilai={p.leadMasuk.nilai}
                sub={<Selisih b={p.leadMasuk} label={vs} />}
              />
            )}
            {p.orderDibuat && (
              <Angka
                label="Order dibuat"
                nilai={p.orderDibuat.nilai}
                sub={<Selisih b={p.orderDibuat} label={vs} />}
              />
            )}
            {p.orderTerkirim && (
              <Angka
                label="Order terkirim"
                nilai={p.orderTerkirim.nilai}
                sub={<Selisih b={p.orderTerkirim} label={vs} />}
              />
            )}
            {p.gmvTerkirim && (
              <Angka
                label="GMV terkirim"
                nilai={rupiah(p.gmvTerkirim.nilai)}
                sub={<Selisih b={p.gmvTerkirim} label={vs} />}
              />
            )}
          </div>
        </section>
      )}

      {t && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-600">Perlu tindakan sekarang</h2>
          <div className={GRID}>
            {t.leadBelumDirespon && (
              <Angka
                label="Lead belum direspon"
                nilai={t.leadBelumDirespon.jumlah}
                href={ke('/lead', { status: 'baru' })}
                nada={t.leadBelumDirespon.jumlah > 0 ? 'kuning' : 'biasa'}
                sub={
                  t.leadBelumDirespon.umurTerlamaMenit !== null && (
                    <span className="text-slate-600">
                      Terlama {umur(t.leadBelumDirespon.umurTerlamaMenit)}
                    </span>
                  )
                }
              />
            )}
            {t.antrianHandover !== null && (
              <Angka
                label="Antrian handover"
                nilai={t.antrianHandover}
                href={ke('/lead', { handover: 'antrian' })}
                nada={t.antrianHandover > 0 ? 'kuning' : 'biasa'}
              />
            )}
            {t.menungguVerifikasi !== null && (
              <Angka
                label="Menunggu verifikasi"
                nilai={t.menungguVerifikasi}
                href={ke('/order', { status: 'baru' })}
              />
            )}
            {t.perluVerifikasiManusia !== null && (
              <Angka
                label="Wajib diverifikasi CS manusia"
                nilai={t.perluVerifikasiManusia}
                href={ke('/order', { verifikasi_manusia: 'ya' })}
                nada={t.perluVerifikasiManusia > 0 ? 'merah' : 'biasa'}
              />
            )}
            {t.resiKuning !== null && (
              <Angka
                label="Resi lewat 18 jam"
                nilai={t.resiKuning}
                href={ke('/order', { sla: 'kuning' })}
                nada={t.resiKuning > 0 ? 'kuning' : 'biasa'}
                sub={<span className="text-slate-500">belum 24 jam</span>}
              />
            )}
            {t.resiMerah !== null && (
              <Angka
                label="Resi lewat 24 jam"
                nilai={t.resiMerah}
                href={ke('/order', { sla: 'merah' })}
                nada={t.resiMerah > 0 ? 'merah' : 'biasa'}
              />
            )}
          </div>
        </section>
      )}

      {data?.posisi && (
        <Kartu judul="Posisi order aktif saat ini">
          <p className="mb-3 text-xs text-slate-500">
            Semua order yang belum selesai, tanpa melihat tanggal dibuat.
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_AKTIF.map((s) => (
              <Link key={s} href={ke('/order', { status: s })} className="hover:opacity-80">
                <Lencana warna={`${WARNA_STATUS_ORDER[s]} px-3 py-1 text-sm`}>
                  {labelStatusOrder(s)}: {data.posisi![s]}
                </Lencana>
              </Link>
            ))}
          </div>
        </Kartu>
      )}

      {data?.stok && (
        <Kartu
          judul="Stok perlu perhatian"
          aksi={
            <Link href="/stok" className="text-sm text-slate-600 underline">
              Semua stok
            </Link>
          }
        >
          {data.stok.length === 0 ? (
            <p className="text-sm text-slate-500">Semua stok aman.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.stok.map((s) => (
                <li key={s.sku} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {s.nama} <span className="font-mono text-xs text-slate-500">{s.sku}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {s.tersedia} tersedia{s.hariCover !== null && ` · ${s.hariCover} hari`}
                    <Lencana warna={WARNA_COVER[s.status]}>{LABEL_COVER[s.status]}</Lencana>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Kartu>
      )}
    </div>
  );
}

export default function Beranda() {
  return (
    <Suspense>
      <Isi />
    </Suspense>
  );
}
