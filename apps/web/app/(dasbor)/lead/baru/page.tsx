'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Isian, Kartu, PesanGalat, Tombol, kelasInput, useData } from '@/components/ui';
import { api, GalatApi } from '@/lib/api';
import { LABEL_KANAL } from '@/lib/format';
import type { DetailLead, Produk } from '@/lib/tipe';

export default function LeadBaru() {
  const router = useRouter();
  const { data: produk } = useData<Produk[]>('/products');
  const [form, setForm] = useState({
    noWa: '',
    nama: '',
    skuDitanya: '',
    kanal: 'organik',
    campaignId: '',
    adId: '',
    catatan: '',
  });
  const [galat, setGalat] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);
  const ubah = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function simpan(e: FormEvent) {
    e.preventDefault();
    setKirim(true);
    setGalat(null);
    try {
      const lead = await api<DetailLead>('/app/leads', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      router.push(`/lead/${lead.id}`);
    } catch (err) {
      setGalat(err instanceof GalatApi ? err.message : 'Gagal menyimpan lead');
      setKirim(false);
    }
  }

  return (
    <form onSubmit={simpan} className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Input lead</h1>
      <Kartu>
        <div className="grid gap-3 sm:grid-cols-2">
          <Isian label="Nomor WhatsApp *">
            <input
              required
              className={kelasInput}
              value={form.noWa}
              onChange={ubah('noWa')}
              placeholder="0812…"
            />
          </Isian>
          <Isian label="Nama">
            <input className={kelasInput} value={form.nama} onChange={ubah('nama')} />
          </Isian>
          <Isian label="Produk yang ditanyakan">
            <select className={kelasInput} value={form.skuDitanya} onChange={ubah('skuDitanya')}>
              <option value="">–</option>
              {produk
                ?.filter((p) => p.tipe === 'satuan')
                .map((p) => (
                  <option key={p.id} value={p.sku}>
                    {p.nama}
                  </option>
                ))}
            </select>
          </Isian>
          <Isian label="Kanal">
            <select className={kelasInput} value={form.kanal} onChange={ubah('kanal')}>
              {Object.entries(LABEL_KANAL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Isian>
          <Isian label="Campaign ID">
            <input className={kelasInput} value={form.campaignId} onChange={ubah('campaignId')} />
          </Isian>
          <Isian label="Ad ID">
            <input className={kelasInput} value={form.adId} onChange={ubah('adId')} />
          </Isian>
          <div className="sm:col-span-2">
            <Isian label="Catatan">
              <textarea
                className={kelasInput}
                rows={3}
                value={form.catatan}
                onChange={ubah('catatan')}
              />
            </Isian>
          </div>
        </div>
      </Kartu>
      <PesanGalat pesan={galat} />
      <div className="flex gap-2">
        <Tombol type="submit" disabled={kirim}>
          {kirim ? 'Menyimpan…' : 'Simpan lead'}
        </Tombol>
        <Tombol type="button" varian="garis" onClick={() => router.back()}>
          Batal
        </Tombol>
      </div>
    </form>
  );
}
