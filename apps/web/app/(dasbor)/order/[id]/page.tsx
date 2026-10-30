'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Isian, Kartu, Lencana, PesanGalat, Tombol, kelasInput, useData } from '@/components/ui';
import { api, GalatApi } from '@/lib/api';
import {
  LABEL_AGEN,
  LABEL_SLA,
  WARNA_SLA,
  WARNA_STATUS_ORDER,
  labelStatusOrder,
  rupiah,
  waktu,
} from '@/lib/format';
import type { DetailOrder } from '@/lib/tipe';

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const LABEL_KONDISI: Record<string, string> = {
  layak_jual: 'Layak jual',
  rusak: 'Rusak',
  tidak_lengkap: 'Tidak lengkap',
};

export default function DetailOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: o, galat, muatUlang } = useData<DetailOrder>(`/app/orders/${id}`);
  const [pesan, setPesan] = useState<string | null>(null);
  const [mode, setMode] = useState<'verifikasi' | 'batal' | 'alamat' | null>(null);

  async function kirim(path: string, body: object, method = 'POST') {
    setPesan(null);
    try {
      await api(path, { method, body: JSON.stringify(body) });
      setMode(null);
      await muatUlang();
    } catch (e) {
      setPesan(e instanceof GalatApi ? e.message : 'Gagal');
    }
  }

  if (galat) return <PesanGalat pesan={galat} />;
  if (!o) return <p className="text-slate-500">Memuat…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/order" className="text-sm text-slate-500 hover:underline">
            ← Order
          </Link>
          <h1 className="font-mono text-xl font-semibold">{o.nomor}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Lencana warna={WARNA_STATUS_ORDER[o.status]}>{labelStatusOrder(o.status)}</Lencana>
            <Lencana warna="bg-slate-100 text-slate-700">Entitas {o.entitas}</Lencana>
            {o.sla && <Lencana warna={WARNA_SLA[o.sla]}>{LABEL_SLA[o.sla]}</Lencana>}
            {o.perluVerifikasiManusia && (
              <Lencana warna="bg-red-100 text-red-800">
                Pelanggan riwayat RTS · verifikasi CS manusia
              </Lencana>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.aksi.verifikasi && <Tombol onClick={() => setMode('verifikasi')}>Verifikasi</Tombol>}
          {o.aksi.koreksiAlamat && (
            <Tombol varian="garis" onClick={() => setMode('alamat')}>
              Koreksi alamat
            </Tombol>
          )}
          {o.aksi.batal && (
            <Tombol varian="bahaya" onClick={() => setMode('batal')}>
              Batalkan
            </Tombol>
          )}
        </div>
      </div>
      <PesanGalat pesan={pesan} />

      {mode === 'verifikasi' && <FormVerifikasi o={o} kirim={kirim} tutup={() => setMode(null)} />}
      {mode === 'batal' && <FormBatal o={o} kirim={kirim} tutup={() => setMode(null)} />}
      {mode === 'alamat' && <FormAlamat o={o} kirim={kirim} tutup={() => setMode(null)} />}

      {o.grup.length > 0 && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Satu checkout dengan{' '}
          {o.grup.map((g) => (
            <Link key={g.id} href={`/order/${g.id}`} className="font-mono underline">
              {g.nomor} ({g.entitas}, {labelStatusOrder(g.status)})
            </Link>
          ))}
          . Pembeli membayar dua nilai COD terpisah.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Kartu judul="Order">
          <dl className="divide-y divide-slate-100">
            <Baris label="Dibuat">{waktu(o.dibuatAt)}</Baris>
            <Baris label="Terverifikasi">{waktu(o.terverifikasiAt)}</Baris>
            <Baris label="Terkirim">{waktu(o.terkirimAt)}</Baris>
            <Baris label="Agen / CS">
              {LABEL_AGEN[o.agen]}
              {o.cs && ` · ${o.cs.nama}`}
            </Baris>
            <Baris label="Metode bayar">{o.metodeBayar === 'cod' ? 'COD' : 'Transfer'}</Baris>
            <Baris label="Ref Ethix">
              <span className="font-mono">{o.ethixRef ?? '–'}</span>
            </Baris>
            {o.lead && (
              <Baris label="Lead">
                <Link href={`/lead/${o.lead.id}`} className="underline">
                  Lihat lead
                </Link>
                {o.lead.adId && (
                  <span className="ml-2 font-mono text-xs text-slate-500">ad {o.lead.adId}</span>
                )}
              </Baris>
            )}
            {o.alasanBatal && <Baris label="Alasan batal">{o.alasanBatal}</Baris>}
            {o.catatan && <Baris label="Catatan">{o.catatan}</Baris>}
          </dl>
        </Kartu>
        <Kartu judul="Penerima">
          <dl className="divide-y divide-slate-100">
            <Baris label="Nama">{o.penerima.nama}</Baris>
            <Baris label="Nomor WA">
              <span className="font-mono">{o.penerima.noWa}</span>
            </Baris>
            <Baris label="Alamat">{o.penerima.alamat}</Baris>
            <Baris label="Kel. / Kec.">
              {[o.penerima.kelurahan, o.penerima.kecamatan].filter(Boolean).join(', ') || '–'}
            </Baris>
            <Baris label="Kota">
              {o.penerima.kota}, {o.penerima.provinsi} {o.penerima.kodePos}
            </Baris>
          </dl>
        </Kartu>
      </div>

      <Kartu judul="Item">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2">Produk</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Harga</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {o.items.map((i) => (
                <tr key={i.sku}>
                  <td className="py-2">
                    {i.nama} <span className="font-mono text-xs text-slate-500">{i.sku}</span>
                  </td>
                  <td className="text-right">{i.qty}</td>
                  <td className="text-right">{rupiah(i.hargaSatuan)}</td>
                  <td className="text-right">{rupiah(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td colSpan={3} className="pt-2 text-right text-slate-500">
                  Subtotal
                </td>
                <td className="pt-2 text-right">{rupiah(o.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right text-slate-500">
                  Diskon
                </td>
                <td className="text-right">−{rupiah(o.diskon)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right text-slate-500">
                  Ongkir
                </td>
                <td className="text-right">{rupiah(o.ongkir)}</td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={3} className="text-right">
                  Total{o.metodeBayar === 'cod' && ' / nilai COD'}
                </td>
                <td className="text-right">{rupiah(o.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Kartu>

      {(o.pengiriman.length > 0 || o.retur.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {o.pengiriman.map((s) => (
            <Kartu key={s.resi} judul="Pengiriman">
              <dl className="divide-y divide-slate-100">
                <Baris label="Kurir / resi">
                  {s.kurir} · <span className="font-mono">{s.resi}</span>
                </Baris>
                <Baris label="Dikirim">{waktu(s.dikirimAt)}</Baris>
                <Baris label="Diterima">{waktu(s.diterimaAt)}</Baris>
                <Baris label="Percobaan antar">{s.percobaanAntar}</Baris>
                <Baris label="Status kurir">{s.statusKurir ?? '–'}</Baris>
              </dl>
            </Kartu>
          ))}
          {o.retur.map((r) => (
            <Kartu key={r.jenis} judul="RTS">
              <dl className="divide-y divide-slate-100">
                <Baris label="Alasan">{r.alasan}</Baris>
                <Baris label="Kembali di gudang">{waktu(r.diterimaGudangAt)}</Baris>
                <Baris label="Kondisi barang">
                  {r.kondisiBarang ? LABEL_KONDISI[r.kondisiBarang] : '–'}
                </Baris>
                <Baris label="Ongkir balik">{rupiah(r.ongkirBalik)}</Baris>
              </dl>
            </Kartu>
          ))}
        </div>
      )}

      <Kartu judul="Riwayat status">
        <ol className="space-y-3">
          {o.riwayat.map((h, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {h.dari === h.ke ? (
                    <span className="text-slate-600">Catatan</span>
                  ) : (
                    <Lencana warna={WARNA_STATUS_ORDER[h.ke]}>{labelStatusOrder(h.ke)}</Lencana>
                  )}
                  <span className="text-slate-500">{waktu(h.waktu)}</span>
                  <span className="text-xs text-slate-400">oleh {h.oleh}</span>
                </div>
                {h.catatan && <div className="text-slate-600">{h.catatan}</div>}
              </div>
            </li>
          ))}
        </ol>
      </Kartu>
    </div>
  );
}

type Kirim = (path: string, body: object, method?: string) => Promise<void>;

function FormVerifikasi({ o, kirim, tutup }: { o: DetailOrder; kirim: Kirim; tutup: () => void }) {
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [catatan, setCatatan] = useState('');
  return (
    <Kartu judul="Verifikasi order">
      <div className="space-y-3 text-sm">
        <p>
          Pastikan pembeli sudah mengonfirmasi alamat lengkap,{' '}
          {o.metodeBayar === 'cod' ? (
            <>
              nilai COD <strong>{rupiah(o.nilaiCod)}</strong>, dan kesediaan bayar.
            </>
          ) : (
            <>pembayaran transfer sudah diterima.</>
          )}
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={konfirmasi}
            onChange={(e) => setKonfirmasi(e.target.checked)}
          />
          Pembeli sudah mengonfirmasi
        </label>
        <Isian label="Catatan (opsional)">
          <input
            className={kelasInput}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
          />
        </Isian>
        <div className="flex gap-2">
          <Tombol
            disabled={!konfirmasi}
            onClick={() =>
              kirim(`/app/orders/${o.id}/verifikasi`, {
                nilaiCodDikonfirmasi: o.nilaiCod,
                ...(catatan ? { catatan } : {}),
              })
            }
          >
            Tandai terverifikasi
          </Tombol>
          <Tombol varian="garis" onClick={tutup}>
            Tutup
          </Tombol>
        </div>
      </div>
    </Kartu>
  );
}

function FormBatal({ o, kirim, tutup }: { o: DetailOrder; kirim: Kirim; tutup: () => void }) {
  const [alasan, setAlasan] = useState('');
  return (
    <Kartu judul="Batalkan order">
      <form
        className="space-y-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void kirim(`/app/orders/${o.id}/batal`, { alasan });
        }}
      >
        <Isian label="Alasan *">
          <input
            required
            className={kelasInput}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
          />
        </Isian>
        <div className="flex gap-2">
          <Tombol varian="bahaya" type="submit">
            Batalkan order
          </Tombol>
          <Tombol varian="garis" type="button" onClick={tutup}>
            Tutup
          </Tombol>
        </div>
      </form>
    </Kartu>
  );
}

function FormAlamat({ o, kirim, tutup }: { o: DetailOrder; kirim: Kirim; tutup: () => void }) {
  const [a, setA] = useState({
    alamat: o.penerima.alamat ?? '',
    kelurahan: o.penerima.kelurahan ?? '',
    kecamatan: o.penerima.kecamatan ?? '',
    kota: o.penerima.kota ?? '',
    provinsi: o.penerima.provinsi ?? '',
    kodePos: o.penerima.kodePos ?? '',
  });
  const ubah = (k: keyof typeof a) => (e: { target: { value: string } }) =>
    setA((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Kartu judul="Koreksi alamat">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void kirim(`/app/orders/${o.id}/alamat`, { alamat: a }, 'PATCH');
        }}
      >
        <div className="sm:col-span-2">
          <Isian label="Alamat *">
            <input required className={kelasInput} value={a.alamat} onChange={ubah('alamat')} />
          </Isian>
        </div>
        <Isian label="Kelurahan">
          <input className={kelasInput} value={a.kelurahan} onChange={ubah('kelurahan')} />
        </Isian>
        <Isian label="Kecamatan">
          <input className={kelasInput} value={a.kecamatan} onChange={ubah('kecamatan')} />
        </Isian>
        <Isian label="Kota *">
          <input required className={kelasInput} value={a.kota} onChange={ubah('kota')} />
        </Isian>
        <Isian label="Provinsi *">
          <input required className={kelasInput} value={a.provinsi} onChange={ubah('provinsi')} />
        </Isian>
        <Isian label="Kode pos">
          <input className={kelasInput} value={a.kodePos} onChange={ubah('kodePos')} />
        </Isian>
        <div className="flex items-end gap-2">
          <Tombol type="submit">Simpan</Tombol>
          <Tombol varian="garis" type="button" onClick={tutup}>
            Tutup
          </Tombol>
        </div>
      </form>
    </Kartu>
  );
}
