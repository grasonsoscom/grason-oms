'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import type { MetodeBayar } from '@grason/shared';
import { Isian, Kartu, PesanGalat, Tombol, kelasInput, useData } from '@/components/ui';
import { api, GalatApi } from '@/lib/api';
import { rupiah } from '@/lib/format';
import type { DetailLead, PecahanPratinjau, Produk } from '@/lib/tipe';

interface Baris {
  sku: string;
  qty: number;
}

function FormOrder() {
  const router = useRouter();
  const leadId = useSearchParams().get('lead');
  const { data: lead, galat: galatLead } = useData<DetailLead>(
    leadId ? `/app/leads/${leadId}` : null,
  );
  const { data: produk } = useData<Produk[]>('/products');

  const [items, setItems] = useState<Baris[]>([{ sku: '', qty: 1 }]);
  const [metode, setMetode] = useState<MetodeBayar>('cod');
  const [ongkir, setOngkir] = useState(0);
  const [diskon, setDiskon] = useState(0);
  const [penerima, setPenerima] = useState({ nama: '', noWa: '' });
  const [alamat, setAlamat] = useState({
    alamat: '',
    kelurahan: '',
    kecamatan: '',
    kota: '',
    provinsi: '',
    kodePos: '',
  });
  const [catatan, setCatatan] = useState('');
  const [pratinjau, setPratinjau] = useState<{
    orders: PecahanPratinjau[];
    kurang: { sku: string; diminta: number; tersedia: number }[];
  } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);

  // Isi awal dari data pelanggan lead.
  useEffect(() => {
    if (!lead) return;
    const p = lead.pelanggan;
    setPenerima((x) => ({
      nama: x.nama || p.nama || '',
      noWa: x.noWa || (p.noWa.includes('*') ? '' : p.noWa),
    }));
    setAlamat((x) =>
      x.alamat
        ? x
        : {
            alamat: p.alamat ?? '',
            kelurahan: p.kelurahan ?? '',
            kecamatan: p.kecamatan ?? '',
            kota: p.kota ?? '',
            provinsi: p.provinsi ?? '',
            kodePos: p.kodePos ?? '',
          },
    );
    if (lead.produkDitanya)
      setItems((x) => (x[0]?.sku ? x : [{ sku: lead.produkDitanya!.sku, qty: 1 }]));
  }, [lead]);

  const itemValid = items.filter((i) => i.sku && i.qty > 0);
  const kunciPratinjau = JSON.stringify({ itemValid, metode, ongkir, diskon });
  useEffect(() => {
    if (itemValid.length === 0) {
      setPratinjau(null);
      return;
    }
    const t = setTimeout(() => {
      api<typeof pratinjau>('/app/orders/pratinjau', {
        method: 'POST',
        body: JSON.stringify({ items: itemValid, metodeBayar: metode, ongkir, diskon }),
      })
        .then((p) => {
          setPratinjau(p);
          setGalat(null);
        })
        .catch((e: unknown) => setGalat(e instanceof GalatApi ? e.message : 'Gagal menghitung'));
    }, 300);
    return () => clearTimeout(t);
    // Dihitung ulang hanya bila isi checkout berubah (kunciPratinjau).
  }, [kunciPratinjau]);

  async function simpan(e: FormEvent) {
    e.preventDefault();
    setKirim(true);
    setGalat(null);
    try {
      const hasil = await api<{ orders: { id: string }[] }>('/app/orders', {
        method: 'POST',
        body: JSON.stringify({
          leadId,
          metodeBayar: metode,
          penerima,
          alamat,
          items: itemValid,
          ongkir,
          diskon,
          ...(catatan ? { catatan } : {}),
        }),
      });
      router.push(`/order/${hasil.orders[0]!.id}`);
    } catch (err) {
      setGalat(err instanceof GalatApi ? err.message : 'Gagal menyimpan order');
      setKirim(false);
    }
  }

  if (!leadId) {
    return (
      <p className="text-sm text-slate-600">
        Order dibuat dari lead. Buka{' '}
        <Link href="/lead" className="underline">
          daftar lead
        </Link>
        , pilih lead, lalu klik &ldquo;Buat order&rdquo;.
      </p>
    );
  }
  if (galatLead) return <PesanGalat pesan={galatLead} />;

  const ubahAlamat = (k: keyof typeof alamat) => (e: { target: { value: string } }) =>
    setAlamat((x) => ({ ...x, [k]: e.target.value }));
  const kurang = new Set(pratinjau?.kurang.map((k) => k.sku));

  return (
    <form onSubmit={simpan} className="space-y-4">
      <div>
        <Link href={`/lead/${leadId}`} className="text-sm text-slate-500 hover:underline">
          ← Lead
        </Link>
        <h1 className="text-xl font-semibold">
          Buat order{lead?.pelanggan.nama && ` · ${lead.pelanggan.nama}`}
        </h1>
      </div>

      <Kartu judul="Produk">
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <select
                className={`${kelasInput} ${kurang.has(it.sku) ? 'border-red-500' : ''}`}
                value={it.sku}
                onChange={(e) =>
                  setItems((x) => x.map((y, j) => (j === i ? { ...y, sku: e.target.value } : y)))
                }
              >
                <option value="">Pilih produk</option>
                {produk?.map((p) => (
                  <option key={p.id} value={p.sku}>
                    {p.nama} ({p.sku}) – {rupiah(p.hargaJual)} · {p.entitas}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={100}
                className={`${kelasInput} w-20`}
                value={it.qty}
                onChange={(e) =>
                  setItems((x) =>
                    x.map((y, j) => (j === i ? { ...y, qty: Number(e.target.value) } : y)),
                  )
                }
              />
              <Tombol
                type="button"
                varian="garis"
                onClick={() => setItems((x) => x.filter((_, j) => j !== i))}
                disabled={items.length === 1}
              >
                Hapus
              </Tombol>
            </div>
          ))}
          <Tombol
            type="button"
            varian="garis"
            onClick={() => setItems((x) => [...x, { sku: '', qty: 1 }])}
          >
            + Tambah produk
          </Tombol>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Isian label="Metode bayar">
            <select
              className={kelasInput}
              value={metode}
              onChange={(e) => setMetode(e.target.value as MetodeBayar)}
            >
              <option value="cod">COD</option>
              <option value="transfer">Transfer</option>
            </select>
          </Isian>
          <Isian label="Ongkir (Rp)">
            <input
              type="number"
              min={0}
              className={kelasInput}
              value={ongkir}
              onChange={(e) => setOngkir(Number(e.target.value))}
            />
          </Isian>
          <Isian label="Diskon (Rp)">
            <input
              type="number"
              min={0}
              className={kelasInput}
              value={diskon}
              onChange={(e) => setDiskon(Number(e.target.value))}
            />
          </Isian>
        </div>
      </Kartu>

      {pratinjau && (
        <Kartu
          judul={
            pratinjau.orders.length > 1
              ? 'Dipecah menjadi 2 order (SSR dan FHI)'
              : 'Ringkasan order'
          }
        >
          {pratinjau.kurang.length > 0 && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Stok tidak cukup:{' '}
              {pratinjau.kurang
                .map((k) => `${k.sku} diminta ${k.diminta}, tersedia ${k.tersedia}`)
                .join('; ')}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {pratinjau.orders.map((o) => (
              <div key={o.entitas} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-medium">Entitas {o.entitas}</div>
                <ul className="mt-1 text-slate-600">
                  {o.items.map((i) => (
                    <li key={i.sku}>
                      {i.sku} ×{i.qty} – {rupiah(i.subtotal)}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 space-y-0.5 text-slate-600">
                  <div>
                    Diskon −{rupiah(o.diskon)} · Ongkir {rupiah(o.ongkir)}
                  </div>
                  <div className="font-semibold text-slate-900">
                    {metode === 'cod' ? 'Nilai COD' : 'Total'} {rupiah(o.total)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Kartu>
      )}

      <Kartu judul="Penerima & alamat">
        <div className="grid gap-3 sm:grid-cols-2">
          <Isian label="Nama penerima *">
            <input
              required
              className={kelasInput}
              value={penerima.nama}
              onChange={(e) => setPenerima((x) => ({ ...x, nama: e.target.value }))}
            />
          </Isian>
          <Isian label="Nomor WA penerima *">
            <input
              required
              className={kelasInput}
              value={penerima.noWa}
              onChange={(e) => setPenerima((x) => ({ ...x, noWa: e.target.value }))}
            />
          </Isian>
          <div className="sm:col-span-2">
            <Isian label="Alamat lengkap *">
              <input
                required
                className={kelasInput}
                value={alamat.alamat}
                onChange={ubahAlamat('alamat')}
                placeholder="Jalan, nomor, RT/RW, patokan"
              />
            </Isian>
          </div>
          <Isian label="Kelurahan">
            <input
              className={kelasInput}
              value={alamat.kelurahan}
              onChange={ubahAlamat('kelurahan')}
            />
          </Isian>
          <Isian label="Kecamatan">
            <input
              className={kelasInput}
              value={alamat.kecamatan}
              onChange={ubahAlamat('kecamatan')}
            />
          </Isian>
          <Isian label="Kota *">
            <input
              required
              className={kelasInput}
              value={alamat.kota}
              onChange={ubahAlamat('kota')}
            />
          </Isian>
          <Isian label="Provinsi *">
            <input
              required
              className={kelasInput}
              value={alamat.provinsi}
              onChange={ubahAlamat('provinsi')}
            />
          </Isian>
          <Isian label="Kode pos">
            <input className={kelasInput} value={alamat.kodePos} onChange={ubahAlamat('kodePos')} />
          </Isian>
          <Isian label="Catatan">
            <input
              className={kelasInput}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </Isian>
        </div>
      </Kartu>

      <PesanGalat pesan={galat} />
      <div className="flex gap-2">
        <Tombol
          type="submit"
          disabled={kirim || itemValid.length === 0 || (pratinjau?.kurang.length ?? 0) > 0}
        >
          {kirim ? 'Menyimpan…' : 'Simpan order'}
        </Tombol>
        <Tombol type="button" varian="garis" onClick={() => router.back()}>
          Batal
        </Tombol>
      </div>
    </form>
  );
}

export default function OrderBaru() {
  return (
    <Suspense>
      <FormOrder />
    </Suspense>
  );
}
