'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ORDER_STATUS } from '@grason/shared';
import { useSesi } from '@/components/sesi';
import { Halaman, Isian, Kartu, Lencana, PesanGalat, kelasInput, useData } from '@/components/ui';
import {
  LABEL_AGEN,
  LABEL_SLA,
  WARNA_SLA,
  WARNA_STATUS_ORDER,
  labelStatusOrder,
  queryString,
  ringkasItem,
  rupiah,
  waktu,
} from '@/lib/format';
import type { BarisOrder, Daftar, Orang, Produk } from '@/lib/tipe';

const FILTER = [
  'status',
  'produk',
  'cs',
  'entitas',
  'metode',
  'dari',
  'sampai',
  'sla',
  'verifikasi_manusia',
  'cari',
  'halaman',
] as const;

function DaftarOrder() {
  const user = useSesi();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const f = Object.fromEntries(FILTER.map((k) => [k, sp.get(k) ?? ''])) as Record<
    (typeof FILTER)[number],
    string
  >;
  const { data, galat, memuat } = useData<Daftar<BarisOrder>>(`/app/orders${queryString(f)}`);
  const { data: produk } = useData<Produk[]>('/products');
  const lihatSemua = user.boleh('order.lihat_semua');
  const { data: cs } = useData<{ data: Orang[] }>(lihatSemua ? '/app/cs' : null);

  const atur = (k: string, v: string) =>
    router.replace(`${path}${queryString({ ...f, [k]: v, halaman: k === 'halaman' ? v : '' })}`);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Order</h1>

      <Kartu>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Isian label="Status">
            <select
              className={kelasInput}
              value={f.status}
              onChange={(e) => atur('status', e.target.value)}
            >
              <option value="">Semua</option>
              {ORDER_STATUS.map((s) => (
                <option key={s} value={s}>
                  {labelStatusOrder(s)}
                </option>
              ))}
            </select>
          </Isian>
          <Isian label="Produk">
            <select
              className={kelasInput}
              value={f.produk}
              onChange={(e) => atur('produk', e.target.value)}
            >
              <option value="">Semua</option>
              {produk
                ?.filter((p) => p.tipe === 'satuan')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
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
                <option value="cs_ai">CS AI</option>
                {cs?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </select>
            </Isian>
          )}
          <Isian label="Entitas">
            <select
              className={kelasInput}
              value={f.entitas}
              onChange={(e) => atur('entitas', e.target.value)}
            >
              <option value="">Semua</option>
              <option value="SSR">SSR</option>
              <option value="FHI">FHI</option>
            </select>
          </Isian>
          <Isian label="Bayar">
            <select
              className={kelasInput}
              value={f.metode}
              onChange={(e) => atur('metode', e.target.value)}
            >
              <option value="">Semua</option>
              <option value="cod">COD</option>
              <option value="transfer">Transfer</option>
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
          <Isian label="Cari nomor / penerima">
            <input
              className={kelasInput}
              defaultValue={f.cari}
              onKeyDown={(e) => e.key === 'Enter' && atur('cari', e.currentTarget.value)}
              placeholder="Enter untuk cari"
            />
          </Isian>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            SLA resi
            <select
              className={`${kelasInput} w-auto py-1`}
              value={f.sla}
              onChange={(e) => atur('sla', e.target.value)}
            >
              <option value="">Semua</option>
              <option value="terlambat">Lewat 18 jam</option>
              <option value="kuning">18–24 jam (kuning)</option>
              <option value="merah">Lewat 24 jam (merah)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.verifikasi_manusia === 'ya'}
              onChange={(e) => atur('verifikasi_manusia', e.target.checked ? 'ya' : '')}
            />
            Wajib verifikasi CS manusia
          </label>
        </div>
      </Kartu>

      <PesanGalat pesan={galat} />
      <Kartu>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-3">Nomor</th>
                <th className="pr-3">Dibuat</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Penerima</th>
                <th className="pr-3">Item</th>
                <th className="pr-3">Agen / CS</th>
                <th className="pr-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-slate-100 ${memuat ? 'opacity-60' : ''}`}>
              {data?.data.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-3">
                    <Link href={`/order/${o.id}`} className="font-mono hover:underline">
                      {o.nomor}
                    </Link>
                    <div className="text-xs text-slate-500">{o.entitas}</div>
                  </td>
                  <td className="pr-3 whitespace-nowrap">{waktu(o.dibuatAt)}</td>
                  <td className="space-y-1 pr-3">
                    <Lencana warna={WARNA_STATUS_ORDER[o.status]}>
                      {labelStatusOrder(o.status)}
                    </Lencana>
                    {o.sla && o.sla !== 'aman' && (
                      <div>
                        <Lencana warna={WARNA_SLA[o.sla]}>{LABEL_SLA[o.sla]}</Lencana>
                      </div>
                    )}
                    {o.perluVerifikasiManusia && o.status === 'baru' && (
                      <div>
                        <Lencana warna="bg-red-100 text-red-800">Verifikasi CS manusia</Lencana>
                      </div>
                    )}
                    {o.tertahan && (
                      <div>
                        <Lencana warna="bg-amber-100 text-amber-800">
                          Belum diverifikasi &gt; 24 jam
                        </Lencana>
                      </div>
                    )}
                  </td>
                  <td className="pr-3">
                    {o.penerimaNama}
                    <div className="text-xs text-slate-500">{o.kota}</div>
                  </td>
                  <td className="pr-3 font-mono text-xs">{ringkasItem(o.items)}</td>
                  <td className="pr-3">
                    {LABEL_AGEN[o.agen]}
                    {o.cs && <div className="text-xs text-slate-500">{o.cs.nama}</div>}
                  </td>
                  <td className="pr-3 text-right whitespace-nowrap">
                    {rupiah(o.total)}
                    <div className="text-xs text-slate-500">
                      {o.metodeBayar === 'cod' ? 'COD' : 'Transfer'}
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Tidak ada order.
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

export default function HalamanOrder() {
  return (
    <Suspense>
      <DaftarOrder />
    </Suspense>
  );
}
