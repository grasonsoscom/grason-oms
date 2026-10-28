'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, GalatApi } from '@/lib/api';

export default function HalamanLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setGalat(null);
    setMemuat(true);
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.replace('/');
    } catch (err) {
      setGalat(err instanceof GalatApi ? err.message : 'Login gagal. Coba lagi.');
    } finally {
      setMemuat(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form
        onSubmit={kirim}
        className="w-full max-w-sm space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold">OMS GRASON</h1>
          <p className="text-sm text-slate-500">Masuk dengan akun tim GRASON</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
        </label>

        {galat && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {galat}
          </p>
        )}

        <button
          type="submit"
          disabled={memuat}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
        >
          {memuat ? 'Memproses…' : 'Masuk'}
        </button>
      </form>
    </main>
  );
}
