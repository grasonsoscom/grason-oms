'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useSesi } from '@/components/sesi';
import { Isian, Kartu, Lencana, PesanGalat, Tombol, kelasInput, useData } from '@/components/ui';
import { api, GalatApi } from '@/lib/api';
import {
  LABEL_AGEN,
  LABEL_KANAL,
  WARNA_STATUS_LEAD,
  WARNA_STATUS_ORDER,
  labelStatusLead,
  labelStatusOrder,
  rupiah,
  waktu,
} from '@/lib/format';
import type { DetailLead, Orang } from '@/lib/tipe';

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default function DetailLeadPage() {
  const { id } = useParams<{ id: string }>();
  const user = useSesi();
  const { data: l, galat, muatUlang } = useData<DetailLead>(`/app/leads/${id}`);
  const { data: cs } = useData<{ data: Orang[] }>(user.boleh('lead.bagi') ? '/app/cs' : null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [tujuan, setTujuan] = useState('');

  async function aksi(path: string, body: object, method = 'POST') {
    setPesan(null);
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await muatUlang();
    } catch (e) {
      setPesan(e instanceof GalatApi ? e.message : 'Gagal');
    }
  }

  if (galat) return <PesanGalat pesan={galat} />;
  if (!l) return <p className="text-slate-500">Memuat…</p>;

  const bisaUbah = user.boleh('lead.ubah') && l.status !== 'closing';
  const bisaOrder = user.boleh('order.buat') && l.status !== 'gagal';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/lead" className="text-sm text-slate-500 hover:underline">
            ← Lead
          </Link>
          <h1 className="text-xl font-semibold">{l.pelanggan.nama ?? l.pelanggan.noWa}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Lencana warna={WARNA_STATUS_LEAD[l.status]}>{labelStatusLead(l.status)}</Lencana>
            {l.handover && <Lencana warna="bg-violet-100 text-violet-800">Handover</Lencana>}
            {l.pelanggan.tandaRts && <Lencana warna="bg-red-100 text-red-800">Riwayat RTS</Lencana>}
          </div>
        </div>
        {bisaOrder && (
          <Link
            href={`/order/baru?lead=${l.id}`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Buat order
          </Link>
        )}
      </div>
      <PesanGalat pesan={pesan} />

      <div className="grid gap-4 md:grid-cols-2">
        <Kartu judul="Lead">
          <dl className="divide-y divide-slate-100">
            <Baris label="Masuk">{waktu(l.masukAt)}</Baris>
            <Baris label="Respon pertama">{waktu(l.responPertamaAt)}</Baris>
            <Baris label="Agen">{LABEL_AGEN[l.agen]}</Baris>
            <Baris label="CS">{l.cs?.nama ?? '–'}</Baris>
            <Baris label="Kanal">{l.kanal ? (LABEL_KANAL[l.kanal] ?? l.kanal) : '–'}</Baris>
            <Baris label="Campaign / Ad">
              <span className="font-mono text-xs">
                {l.campaignId ?? '–'} / {l.adId ?? '–'}
              </span>
            </Baris>
            <Baris label="Produk ditanya">{l.produkDitanya?.nama ?? '–'}</Baris>
            {l.handover && (
              <Baris label="Alasan handover">
                {l.handoverAlasan} ({waktu(l.handoverAt)})
              </Baris>
            )}
            {l.catatan && <Baris label="Catatan">{l.catatan}</Baris>}
          </dl>
        </Kartu>

        <Kartu judul="Pelanggan">
          <dl className="divide-y divide-slate-100">
            <Baris label="Nomor WA">
              <span className="font-mono">{l.pelanggan.noWa}</span>
            </Baris>
            <Baris label="Alamat terakhir">{l.pelanggan.alamat ?? '–'}</Baris>
            <Baris label="Kota">
              {[l.pelanggan.kota, l.pelanggan.provinsi].filter(Boolean).join(', ') || '–'}
            </Baris>
          </dl>
        </Kartu>
      </div>

      {(bisaUbah ||
        user.boleh('lead.bagi') ||
        (user.boleh('handover.ambil_alih') && l.handover)) && (
        <Kartu judul="Tindakan">
          <div className="flex flex-wrap items-end gap-3">
            {bisaUbah && (
              <>
                <Tombol
                  varian="garis"
                  onClick={() => aksi(`/app/leads/${l.id}`, { status: 'follow_up' }, 'PATCH')}
                >
                  Tandai follow-up
                </Tombol>
                <Tombol
                  varian="garis"
                  onClick={() => aksi(`/app/leads/${l.id}`, { status: 'gagal' }, 'PATCH')}
                >
                  Tandai gagal
                </Tombol>
              </>
            )}
            {user.boleh('lead.bagi') && (
              <div className="flex items-end gap-2">
                <Isian label="Bagi ke CS">
                  <select
                    className={kelasInput}
                    value={tujuan}
                    onChange={(e) => setTujuan(e.target.value)}
                  >
                    <option value="">Pilih CS</option>
                    {cs?.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </Isian>
                <Tombol
                  disabled={!tujuan}
                  onClick={() => aksi(`/app/leads/${l.id}/bagi`, { csUserId: tujuan })}
                >
                  Bagi
                </Tombol>
              </div>
            )}
            {user.boleh('handover.ambil_alih') && l.handover && l.cs?.id !== user.id && (
              <Tombol onClick={() => aksi(`/app/leads/${l.id}/ambil-alih`, {})}>Ambil alih</Tombol>
            )}
          </div>
        </Kartu>
      )}

      <Kartu judul="Order dari lead ini">
        {l.orders && l.orders.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {l.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <Link href={`/order/${o.id}`} className="font-mono hover:underline">
                  {o.nomor}
                </Link>
                <span className="flex items-center gap-2">
                  {o.entitas} · {rupiah(o.total)}
                  <Lencana warna={WARNA_STATUS_ORDER[o.status]}>
                    {labelStatusOrder(o.status)}
                  </Lencana>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Belum ada order.</p>
        )}
      </Kartu>
    </div>
  );
}
