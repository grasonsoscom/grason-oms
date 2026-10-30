'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LEAD_STATUS } from '@grason/shared';
import { useSesi } from '@/components/sesi';
import { Halaman, Isian, Kartu, Lencana, PesanGalat, kelasInput, useData } from '@/components/ui';
import { LABEL_AGEN, WARNA_STATUS_LEAD, labelStatusLead, queryString, waktu } from '@/lib/format';
import type { BarisLead, Daftar, Orang } from '@/lib/tipe';

const FILTER = ['status', 'agen', 'cs', 'handover', 'dari', 'sampai', 'cari', 'halaman'] as const;

function DaftarLead() {
  const user = useSesi();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const f = Object.fromEntries(FILTER.map((k) => [k, sp.get(k) ?? ''])) as Record<
    (typeof FILTER)[number],
    string
  >;
  const { data, galat, memuat } = useData<Daftar<BarisLead>>(`/app/leads${queryString(f)}`);
  const lihatSemua = user.boleh('lead.lihat_semua');
  const { data: cs } = useData<{ data: Orang[] }>(lihatSemua ? '/app/cs' : null);

  const atur = (k: string, v: string) =>
    router.replace(`${path}${queryString({ ...f, [k]: v, halaman: k === 'halaman' ? v : '' })}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Lead</h1>
        {user.boleh('lead.buat') && (
          <Link
            href="/lead/baru"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Input lead
          </Link>
        )}
      </div>

      <Kartu>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Isian label="Status">
            <select
              className={kelasInput}
              value={f.status}
              onChange={(e) => atur('status', e.target.value)}
            >
              <option value="">Semua</option>
              {LEAD_STATUS.map((s) => (
                <option key={s} value={s}>
                  {labelStatusLead(s)}
                </option>
              ))}
            </select>
          </Isian>
          <Isian label="Agen">
            <select
              className={kelasInput}
              value={f.agen}
              onChange={(e) => atur('agen', e.target.value)}
            >
              <option value="">Semua</option>
              <option value="cs_ai">CS AI</option>
              <option value="cs_manusia">CS manusia</option>
            </select>
          </Isian>
          {lihatSemua && (
            <Isian label="CS">
              <select
                className={kelasInput}
                value={f.cs}
                onChange={(e) => atur('cs', e.target.value)}
              >
                <option value="">Semua</option>
                {cs?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </select>
            </Isian>
          )}
          <Isian label="Handover">
            <select
              className={kelasInput}
              value={f.handover}
              onChange={(e) => atur('handover', e.target.value)}
            >
              <option value="">Semua</option>
              <option value="ya">Di-handover</option>
              <option value="antrian">Antrian (belum dibagi)</option>
            </select>
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
          <Isian label="Cari nama / nomor">
            <input
              className={kelasInput}
              defaultValue={f.cari}
              onKeyDown={(e) => e.key === 'Enter' && atur('cari', e.currentTarget.value)}
              placeholder="Enter untuk cari"
            />
          </Isian>
        </div>
      </Kartu>

      <PesanGalat pesan={galat} />
      <Kartu>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-3">Masuk</th>
                <th className="pr-3">Pelanggan</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Agen / CS</th>
                <th className="pr-3">Produk</th>
                <th className="pr-3">Iklan</th>
                <th className="pr-3 text-right">Respon</th>
                <th className="text-right">Order</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-slate-100 ${memuat ? 'opacity-60' : ''}`}>
              {data?.data.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Link href={`/lead/${l.id}`} className="underline-offset-2 hover:underline">
                      {waktu(l.masukAt)}
                    </Link>
                  </td>
                  <td className="pr-3">
                    <div>{l.nama ?? '–'}</div>
                    <div className="font-mono text-xs text-slate-500">{l.noWa}</div>
                    {l.tandaRts && <Lencana warna="bg-red-100 text-red-800">Riwayat RTS</Lencana>}
                  </td>
                  <td className="pr-3">
                    <Lencana warna={WARNA_STATUS_LEAD[l.status]}>
                      {labelStatusLead(l.status)}
                    </Lencana>
                    {l.handover && (
                      <div className="mt-1">
                        <Lencana
                          warna={l.cs ? 'bg-violet-100 text-violet-800' : 'bg-red-100 text-red-800'}
                        >
                          {l.cs ? 'Handover' : 'Handover – belum dibagi'}
                        </Lencana>
                      </div>
                    )}
                  </td>
                  <td className="pr-3">
                    {LABEL_AGEN[l.agen]}
                    {l.cs && <div className="text-xs text-slate-500">{l.cs.nama}</div>}
                  </td>
                  <td className="pr-3 font-mono text-xs">{l.produkDitanya ?? '–'}</td>
                  <td className="pr-3 font-mono text-xs">{l.adId ?? '–'}</td>
                  <td className="pr-3 text-right">
                    {l.responMenit !== null ? `${l.responMenit} mnt` : '–'}
                  </td>
                  <td className="text-right">{l.jumlahOrder}</td>
                </tr>
              ))}
              {data && data.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Tidak ada lead.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

export default function HalamanLead() {
  return (
    <Suspense>
      <DaftarLead />
    </Suspense>
  );
}
