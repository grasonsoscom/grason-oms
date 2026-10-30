'use client';

import Link from 'next/link';
import { ORDER_STATUS } from '@grason/shared';
import { Kartu, Lencana, PesanGalat, useData } from '@/components/ui';
import { useSesi } from '@/components/sesi';
import {
  LABEL_COVER,
  WARNA_COVER,
  WARNA_STATUS_ORDER,
  labelStatusOrder,
  rupiah,
  waktu,
} from '@/lib/format';
import type { Ringkasan } from '@/lib/tipe';

function Angka({
  label,
  nilai,
  href,
  peringatan,
}: {
  label: string;
  nilai: string | number;
  href?: string;
  peringatan?: boolean;
}) {
  const isi = (
    <div
      className={`rounded-xl border p-4 ${peringatan ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'} ${href ? 'hover:border-slate-400' : ''}`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${peringatan ? 'text-red-700' : ''}`}>
        {nilai}
      </div>
    </div>
  );
  return href ? <Link href={href}>{isi}</Link> : isi;
}

export default function Beranda() {
  const user = useSesi();
  const { data, galat } = useData<Ringkasan>('/app/ringkasan');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Ringkasan hari ini</h1>
        <p className="text-sm text-slate-500">
          {user.nama} · {user.roleLabel}
          {data && ` · per ${waktu(data.waktu)} WIB`}
        </p>
      </div>
      <PesanGalat pesan={galat} />

      {data?.lead && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Angka label="Lead masuk hari ini" nilai={data.lead.hariIni} href="/lead" />
          <Angka
            label="Lead belum direspon"
            nilai={data.lead.belumDirespon}
            href="/lead?status=baru"
          />
          {data.lead.antrianHandover !== null && (
            <Angka
              label="Antrian handover"
              nilai={data.lead.antrianHandover}
              href="/lead?handover=antrian"
              peringatan={data.lead.antrianHandover > 0}
            />
          )}
        </div>
      )}

      {data?.order && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Angka label="Order terkirim hari ini" nilai={data.order.terkirimHariIni} />
            <Angka label="GMV terkirim hari ini" nilai={rupiah(data.order.gmvTerkirimHariIni)} />
            <Angka
              label="Menunggu verifikasi"
              nilai={data.order.menungguVerifikasi}
              href="/order?status=baru"
            />
            <Angka
              label="Wajib diverifikasi CS manusia"
              nilai={data.order.perluVerifikasiManusia}
              href="/order?verifikasi_manusia=ya"
              peringatan={data.order.perluVerifikasiManusia > 0}
            />
            <Angka
              label="Resi lewat 18 jam"
              nilai={data.order.slaTerlambat}
              href="/order?sla=terlambat"
              peringatan={data.order.slaTerlambat > 0}
            />
          </div>
          <Kartu judul="Order dibuat hari ini per status">
            <div className="flex flex-wrap gap-2">
              {ORDER_STATUS.map((s) => (
                <Link key={s} href={`/order?status=${s}`}>
                  <Lencana warna={WARNA_STATUS_ORDER[s]}>
                    {labelStatusOrder(s)}: {data.order!.hariIniPerStatus[s]}
                  </Lencana>
                </Link>
              ))}
            </div>
          </Kartu>
        </>
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
                <li key={s.sku} className="flex items-center justify-between py-2">
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
