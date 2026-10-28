'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, GalatApi, type UserSaya } from '@/lib/api';

export default function Beranda() {
  const router = useRouter();
  const [user, setUser] = useState<UserSaya | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    api<UserSaya>('/auth/me')
      .then(setUser)
      .catch((err: unknown) => {
        if (err instanceof GalatApi && err.status === 401) router.replace('/login');
        else setGalat(err instanceof Error ? err.message : 'Gagal memuat data');
      });
  }, [router]);

  async function keluar() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  if (galat) {
    return <main className="p-6 text-red-700">{galat}</main>;
  }
  if (!user) {
    return <main className="p-6 text-slate-500">Memuat…</main>;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">OMS GRASON</h1>
          <p className="text-sm text-slate-500">
            {user.nama} · {user.roleLabel}
          </p>
        </div>
        <button
          onClick={keluar}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Keluar
        </button>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium">Fase 0 – Fondasi</h2>
        <p className="mt-1 text-sm text-slate-600">
          Login, role, dan API key sudah aktif. Modul lead, order, stok, dan dashboard menyusul di
          Fase 1.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium">Hak akses Anda ({user.izin.length})</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {user.izin.map((i) => (
            <li key={i} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs">
              {i}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
