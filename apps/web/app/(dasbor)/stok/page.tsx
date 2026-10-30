'use client';

import { BATAS_COVER } from '@grason/shared';
import { Kartu, Lencana, PesanGalat, Tombol, useData } from '@/components/ui';
import { LABEL_COVER, WARNA_COVER, waktu } from '@/lib/format';
import type { Stok } from '@/lib/tipe';

export default function HalamanStok() {
  const { data, galat, memuat, muatUlang } = useData<{ data: Stok[] }>('/app/stok');
  const satuan = data?.data.filter((s) => s.tipe === 'satuan') ?? [];
  const paket = data?.data.filter((s) => s.tipe === 'paket') ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stok</h1>
          <p className="text-sm text-slate-500">
            Tersedia = stok fisik Ethix − order yang belum keluar gudang. Hari cover di bawah{' '}
            {BATAS_COVER.waspada} hari waspada, di bawah {BATAS_COVER.kritis} hari kritis.
          </p>
        </div>
        <Tombol varian="garis" onClick={() => void muatUlang()} disabled={memuat}>
          Muat ulang
        </Tombol>
      </div>
      <PesanGalat pesan={galat} />

      <Kartu judul="Produk satuan (SKU komponen di Ethix)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-3">Produk</th>
                <th className="pr-3">Entitas</th>
                <th className="pr-3 text-right">Stok Ethix</th>
                <th className="pr-3 text-right">Dipesan</th>
                <th className="pr-3 text-right">Tersedia</th>
                <th className="pr-3 text-right">Terjual 7 hari</th>
                <th className="pr-3 text-right">Hari cover</th>
                <th className="pr-3">Status</th>
                <th>Sinkron Ethix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {satuan.map((s) => (
                <tr key={s.sku}>
                  <td className="py-2 pr-3">
                    {s.nama} <div className="font-mono text-xs text-slate-500">{s.sku}</div>
                  </td>
                  <td className="pr-3">{s.entitas}</td>
                  <td className="pr-3 text-right">{s.stokEthix}</td>
                  <td className="pr-3 text-right">{s.dipesan}</td>
                  <td className="pr-3 text-right font-semibold">{s.tersedia}</td>
                  <td className="pr-3 text-right">{s.terjual7Hari}</td>
                  <td className="pr-3 text-right">{s.hariCover ?? '–'}</td>
                  <td className="pr-3">
                    <Lencana warna={WARNA_COVER[s.status]}>{LABEL_COVER[s.status]}</Lencana>
                  </td>
                  <td className="whitespace-nowrap text-slate-500">
                    {s.diperbaruiAt ? waktu(s.diperbaruiAt) : 'Belum pernah'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kartu>

      <Kartu judul="Paket (dihitung dari komponen)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-3">Paket</th>
                <th className="pr-3">Entitas</th>
                <th className="pr-3 text-right">Tersedia</th>
                <th className="pr-3 text-right">Hari cover</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paket.map((s) => (
                <tr key={s.sku}>
                  <td className="py-2 pr-3">
                    {s.nama} <span className="font-mono text-xs text-slate-500">{s.sku}</span>
                  </td>
                  <td className="pr-3">{s.entitas}</td>
                  <td className="pr-3 text-right font-semibold">{s.tersedia}</td>
                  <td className="pr-3 text-right">{s.hariCover ?? '–'}</td>
                  <td>
                    <Lencana warna={WARNA_COVER[s.status]}>{LABEL_COVER[s.status]}</Lencana>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kartu>
    </div>
  );
}
