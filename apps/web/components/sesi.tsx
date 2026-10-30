'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Izin } from '@grason/shared';
import { api, GalatApi, type UserSaya } from '@/lib/api';

const KonteksSesi = createContext<UserSaya | null>(null);

/** User yang sedang login. Hanya dipakai di dalam <Sesi>. */
export function useSesi(): UserSaya & { boleh: (...izin: Izin[]) => boolean } {
  const user = useContext(KonteksSesi);
  if (!user) throw new Error('useSesi di luar <Sesi>');
  return { ...user, boleh: (...izin) => izin.some((i) => user.izin.includes(i)) };
}

const MENU: { href: string; label: string; izin: Izin[] }[] = [
  { href: '/', label: 'Ringkasan', izin: [] },
  { href: '/lead', label: 'Lead', izin: ['lead.lihat_semua', 'lead.lihat_milik'] },
  { href: '/order', label: 'Order', izin: ['order.lihat_semua', 'order.lihat_milik'] },
  { href: '/stok', label: 'Stok', izin: ['stok.lihat'] },
  { href: '/integrasi', label: 'Integrasi', izin: ['integrasi.lihat'] },
];

/** Cek sesi sekali, lalu tampilkan navigasi sesuai izin role. */
export function Sesi({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [user, setUser] = useState<UserSaya | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    api<UserSaya>('/auth/me')
      .then(setUser)
      .catch((err: unknown) => {
        if (err instanceof GalatApi && err.status === 401) router.replace('/login');
        else setGalat(err instanceof Error ? err.message : 'Gagal memuat sesi');
      });
  }, [router]);

  async function keluar() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  if (galat) return <main className="p-6 text-red-700">{galat}</main>;
  if (!user) return <main className="p-6 text-slate-500">Memuat…</main>;

  const menu = MENU.filter((m) => m.izin.length === 0 || m.izin.some((i) => user.izin.includes(i)));
  const aktif = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <KonteksSesi.Provider value={user}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            OMS GRASON
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
            {menu.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className={`rounded-md px-3 py-1.5 whitespace-nowrap ${
                  aktif(m.href) ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {m.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {user.nama} · {user.roleLabel}
            </span>
            <button
              onClick={keluar}
              className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </KonteksSesi.Provider>
  );
}
