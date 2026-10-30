'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useState } from 'react';
import {
  Halaman,
  Isian,
  Kartu,
  Lencana,
  PesanGalat,
  Tombol,
  kelasInput,
  useData,
} from '@/components/ui';
import { api, GalatApi } from '@/lib/api';
import { queryString, waktu } from '@/lib/format';
import type { Daftar, EventIntegrasi, RekapIntegrasi } from '@/lib/tipe';

const FILTER = ['sistem', 'arah', 'status', 'jenis', 'cari', 'dari', 'sampai', 'halaman'] as const;

const LABEL_SISTEM = { cs_ai: 'CS AI', ethix: 'Ethix', adv_ai: 'ADV AI' } as const;
const LABEL_STATUS: Record<EventIntegrasi['status'], string> = {
  diterima: 'Menunggu',
  diproses: 'Diproses',
  berhasil: 'Berhasil',
  gagal: 'Gagal',
  duplikat: 'Kiriman ulang',
};
const WARNA_STATUS: Record<EventIntegrasi['status'], string> = {
  diterima: 'bg-amber-100 text-amber-800',
  diproses: 'bg-sky-100 text-sky-800',
  berhasil: 'bg-emerald-100 text-emerald-800',
  gagal: 'bg-red-100 text-red-800',
  duplikat: 'bg-slate-100 text-slate-700',
};

function DaftarIntegrasi() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const f = Object.fromEntries(FILTER.map((k) => [k, sp.get(k) ?? ''])) as Record<
    (typeof FILTER)[number],
    string
  >;
  const { data, galat, memuat, muatUlang } = useData<Daftar<EventIntegrasi>>(
    `/app/integrasi${queryString(f)}`,
  );
  const rentang = queryString({ dari: f.dari, sampai: f.sampai });
  const { data: rekap } = useData<RekapIntegrasi>(`/app/integrasi/rekap${rentang}`);
  const [buka, setBuka] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const atur = (k: string, v: string) =>
    router.replace(`${path}${queryString({ ...f, [k]: v, halaman: k === 'halaman' ? v : '' })}`);

  async function kirimUlang(id: string) {
    setPesan(null);
    try {
      await api(`/app/integrasi/${id}/kirim-ulang`, { method: 'POST' });
      await muatUlang();
    } catch (e) {
      setPesan(e instanceof GalatApi ? e.message : 'Gagal mengirim ulang');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Integrasi</h1>
          <p className="text-sm text-slate-500">
            Panggilan masuk dari CS AI dan Ethix, serta webhook keluar ke CS AI.
          </p>
        </div>
        <a
          href={`/api/v1/app/integrasi/ekspor.csv${rentang}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
        >
          Ekspor CSV rekonsiliasi
        </a>
      </div>

      {rekap && rekap.data.length > 0 && (
        <Kartu judul="Rekap CS AI per hari">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Tanggal</th>
                  <th className="pr-3">Arah</th>
                  <th className="pr-3">Jenis</th>
                  <th className="pr-3">Status</th>
                  <th className="text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rekap.data.map((r) => (
                  <tr key={`${r.tanggal}-${r.arah}-${r.jenis}-${r.status}`}>
                    <td className="py-1 pr-3 tabular-nums">{r.tanggal}</td>
                    <td className="pr-3">{r.arah === 'masuk' ? 'Masuk' : 'Keluar'}</td>
                    <td className="pr-3 font-mono text-xs">{r.jenis}</td>
                    <td className="pr-3">
                      {LABEL_STATUS[r.status as EventIntegrasi['status']] ?? r.status}
                    </td>
                    <td className="text-right tabular-nums">{r.jumlah}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kartu>
      )}

      <Kartu>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Isian label="Sistem">
            <select
              className={kelasInput}
              value={f.sistem}
              onChange={(e) => atur('sistem', e.target.value)}
            >
              <option value="">Semua</option>
              {Object.entries(LABEL_SISTEM).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Isian>
          <Isian label="Arah">
            <select
              className={kelasInput}
              value={f.arah}
              onChange={(e) => atur('arah', e.target.value)}
            >
              <option value="">Semua</option>
              <option value="masuk">Masuk</option>
              <option value="keluar">Keluar</option>
            </select>
          </Isian>
          <Isian label="Status">
            <select
              className={kelasInput}
              value={f.status}
              onChange={(e) => atur('status', e.target.value)}
            >
              <option value="">Semua</option>
              {Object.entries(LABEL_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Isian>
          <Isian label="Jenis">
            <input
              className={kelasInput}
              placeholder="mis. order.buat"
              defaultValue={f.jenis}
              onBlur={(e) => atur('jenis', e.target.value.trim())}
            />
          </Isian>
          <Isian label="External ID">
            <input
              className={kelasInput}
              defaultValue={f.cari}
              onBlur={(e) => atur('cari', e.target.value.trim())}
            />
          </Isian>
          <Isian label="Dari">
            <input
              type="date"
              className={kelasInput}
              value={f.dari}
              onChange={(e) => atur('dari', e.target.value)}
            />
          </Isian>
          <Isian label="Sampai">
            <input
              type="date"
              className={kelasInput}
              value={f.sampai}
              onChange={(e) => atur('sampai', e.target.value)}
            />
          </Isian>
        </div>
      </Kartu>

      <PesanGalat pesan={galat ?? pesan} />

      <Kartu>
        <div className={`overflow-x-auto ${memuat ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 pr-3">Waktu</th>
                <th className="pr-3">Sistem</th>
                <th className="pr-3">Jenis</th>
                <th className="pr-3">External ID</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Keterangan</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.data.map((e) => (
                <Fragment key={e.id}>
                  <tr className="align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {waktu(e.dibuatAt)}
                    </td>
                    <td className="pr-3 whitespace-nowrap">
                      {LABEL_SISTEM[e.sistem]} · {e.arah === 'masuk' ? 'masuk' : 'keluar'}
                    </td>
                    <td className="pr-3 font-mono text-xs">{e.jenis}</td>
                    <td className="pr-3 font-mono text-xs break-all">{e.externalId ?? '–'}</td>
                    <td className="pr-3">
                      <Lencana warna={WARNA_STATUS[e.status]}>{LABEL_STATUS[e.status]}</Lencana>
                    </td>
                    <td className="pr-3 text-slate-600">
                      {e.error && <div className="text-red-700">{e.error}</div>}
                      {e.arah === 'keluar' && (
                        <div className="text-xs">
                          Percobaan {e.percobaan}
                          {e.cobaLagiAt &&
                            e.status === 'diterima' &&
                            ` · coba lagi ${waktu(e.cobaLagiAt)}`}
                        </div>
                      )}
                      {e.apiKey && <div className="text-xs">Kunci {e.apiKey.nama}</div>}
                    </td>
                    <td className="space-x-2 text-right whitespace-nowrap">
                      {e.arah === 'keluar' && e.status === 'gagal' && (
                        <Tombol varian="garis" onClick={() => void kirimUlang(e.id)}>
                          Kirim ulang
                        </Tombol>
                      )}
                      <button
                        className="text-sm text-slate-600 underline"
                        onClick={() => setBuka(buka === e.id ? null : e.id)}
                      >
                        {buka === e.id ? 'Tutup' : 'Isi'}
                      </button>
                    </td>
                  </tr>
                  {buka === e.id && (
                    <tr>
                      <td colSpan={7} className="pb-3">
                        <pre className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {data && data.data.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Belum ada data.</p>
          )}
        </div>
        {data && (
          <Halaman
            halaman={data.halaman}
            per={data.per}
            total={data.total}
            ganti={(h) => atur('halaman', String(h))}
          />
        )}
      </Kartu>
    </div>
  );
}

export default function HalamanIntegrasi() {
  return (
    <Suspense>
      <DaftarIntegrasi />
    </Suspense>
  );
}
