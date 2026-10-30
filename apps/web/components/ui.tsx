'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, GalatApi } from '@/lib/api';

/** Ambil data GET dan muat ulang saat `path` berubah. */
export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const muat = useCallback(async () => {
    if (!path) return;
    setMemuat(true);
    try {
      setData(await api<T>(path));
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof GalatApi ? e.message : 'Gagal memuat data');
    } finally {
      setMemuat(false);
    }
  }, [path]);
  useEffect(() => {
    void muat();
  }, [muat]);
  return { data, galat, memuat, muatUlang: muat };
}

export function Lencana({ warna, children }: { warna: string; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${warna}`}
    >
      {children}
    </span>
  );
}

export function Kartu({
  judul,
  aksi,
  children,
}: {
  judul?: string;
  aksi?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      {(judul || aksi) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {judul && <h2 className="font-medium">{judul}</h2>}
          {aksi}
        </div>
      )}
      {children}
    </section>
  );
}

export function PesanGalat({ pesan }: { pesan: string | null }) {
  if (!pesan) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {pesan}
    </p>
  );
}

export function Tombol({
  varian = 'utama',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { varian?: 'utama' | 'garis' | 'bahaya' }) {
  const gaya = {
    utama: 'bg-slate-900 text-white hover:bg-slate-700',
    garis: 'border border-slate-300 bg-white hover:bg-slate-100',
    bahaya: 'bg-red-600 text-white hover:bg-red-700',
  }[varian];
  return (
    <button
      {...props}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${gaya} ${props.className ?? ''}`}
    />
  );
}

export const kelasInput =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500';

export function Isian({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Halaman({
  halaman,
  per,
  total,
  ganti,
}: {
  halaman: number;
  per: number;
  total: number;
  ganti: (h: number) => void;
}) {
  const akhir = Math.max(1, Math.ceil(total / per));
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm text-slate-600">
      <span>
        {total} data · halaman {halaman} dari {akhir}
      </span>
      <div className="flex gap-2">
        <Tombol varian="garis" disabled={halaman <= 1} onClick={() => ganti(halaman - 1)}>
          Sebelumnya
        </Tombol>
        <Tombol varian="garis" disabled={halaman >= akhir} onClick={() => ganti(halaman + 1)}>
          Berikutnya
        </Tombol>
      </div>
    </div>
  );
}
