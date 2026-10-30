import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUS,
  STATUS_BOLEH_BATAL,
  STATUS_PEGANG_STOK,
  TRANSISI,
  akibatEventEthix,
  awalHariWib,
  bagiSebanding,
  bolehTransisi,
  hariCover,
  nomorOrder,
  pecahCheckout,
  rentangPeriode,
  statusAkhir,
  statusCover,
  tandaSlaResi,
  tanggalWib,
  tersediaKomponen,
  tersediaPaket,
  type ItemCheckout,
  type OrderStatus,
} from '../src';

describe('alur status', () => {
  const diizinkan: [OrderStatus, OrderStatus][] = [
    ['baru', 'terverifikasi'],
    ['baru', 'batal'],
    ['terverifikasi', 'di_gudang'],
    ['terverifikasi', 'dikirim'],
    ['terverifikasi', 'batal'],
    ['di_gudang', 'dikirim'],
    ['dikirim', 'terkirim'],
    ['dikirim', 'rts'],
  ];

  it('hanya transisi di tabel yang diizinkan', () => {
    for (const dari of ORDER_STATUS) {
      for (const ke of ORDER_STATUS) {
        const boleh = diizinkan.some(([a, b]) => a === dari && b === ke);
        expect(bolehTransisi(dari, ke), `${dari} → ${ke}`).toBe(boleh);
      }
    }
  });

  it('terkirim, batal, dan rts adalah status akhir', () => {
    expect(ORDER_STATUS.filter(statusAkhir)).toEqual(['terkirim', 'batal', 'rts']);
  });

  it('tidak ada status selesai (OMS tanpa uang)', () => {
    expect(ORDER_STATUS).not.toContain('selesai');
    expect(Object.keys(TRANSISI)).not.toContain('selesai');
  });

  it('batal hanya sebelum Ethix menerima order', () => {
    expect(STATUS_BOLEH_BATAL).toEqual(['baru', 'terverifikasi']);
    for (const s of STATUS_BOLEH_BATAL) expect(bolehTransisi(s, 'batal')).toBe(true);
  });

  it('stok dipegang sampai barang keluar gudang', () => {
    expect(STATUS_PEGANG_STOK).toEqual(['baru', 'terverifikasi', 'di_gudang']);
  });
});

describe('event Ethix', () => {
  it('memajukan status sesuai kontrak', () => {
    expect(akibatEventEthix('terverifikasi', 'diterima_gudang')).toEqual({
      jenis: 'ubah',
      ke: 'di_gudang',
    });
    expect(akibatEventEthix('di_gudang', 'dikirim')).toEqual({ jenis: 'ubah', ke: 'dikirim' });
    expect(akibatEventEthix('dikirim', 'terkirim')).toEqual({ jenis: 'ubah', ke: 'terkirim' });
    expect(akibatEventEthix('dikirim', 'rts')).toEqual({ jenis: 'ubah', ke: 'rts' });
  });

  it('boleh melompat bila event sebelumnya belum datang', () => {
    expect(akibatEventEthix('terverifikasi', 'dikirim')).toEqual({ jenis: 'ubah', ke: 'dikirim' });
    expect(akibatEventEthix('terverifikasi', 'dikemas')).toEqual({
      jenis: 'ubah',
      ke: 'di_gudang',
    });
  });

  it('dikemas, gagal antar, dan diterima kembali hanya dicatat', () => {
    expect(akibatEventEthix('di_gudang', 'dikemas')).toEqual({ jenis: 'catat' });
    expect(akibatEventEthix('dikirim', 'gagal_antar')).toEqual({ jenis: 'catat' });
    expect(akibatEventEthix('rts', 'diterima_kembali')).toEqual({ jenis: 'catat' });
  });

  it('mengabaikan event yang sudah terlewati', () => {
    const lewat = { jenis: 'abaikan', kode: 'status_sudah_lewat' };
    expect(akibatEventEthix('di_gudang', 'diterima_gudang')).toEqual(lewat);
    expect(akibatEventEthix('dikirim', 'diterima_gudang')).toEqual(lewat);
    expect(akibatEventEthix('dikirim', 'dikemas')).toEqual(lewat);
    expect(akibatEventEthix('terkirim', 'dikirim')).toEqual(lewat);
    expect(akibatEventEthix('terkirim', 'gagal_antar')).toEqual(lewat);
  });

  it('menolak event untuk order batal atau yang belum waktunya', () => {
    expect(akibatEventEthix('batal', 'diterima_gudang')).toEqual({
      jenis: 'tolak',
      kode: 'order_batal',
    });
    const tidakValid = { jenis: 'tolak', kode: 'transisi_tidak_valid' };
    expect(akibatEventEthix('baru', 'diterima_gudang')).toEqual(tidakValid);
    expect(akibatEventEthix('di_gudang', 'terkirim')).toEqual(tidakValid);
    expect(akibatEventEthix('terkirim', 'rts')).toEqual(tidakValid);
    expect(akibatEventEthix('rts', 'terkirim')).toEqual(tidakValid);
    expect(akibatEventEthix('di_gudang', 'gagal_antar')).toEqual(tidakValid);
    expect(akibatEventEthix('dikirim', 'diterima_kembali')).toEqual(tidakValid);
  });
});

describe('bagiSebanding', () => {
  it('jumlahnya selalu tepat dan integer', () => {
    expect(bagiSebanding(10_000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(bagiSebanding(15_000, [500, 250])).toEqual([10_000, 5000]);
    expect(bagiSebanding(0, [3, 4])).toEqual([0, 0]);
  });

  it('tanpa bobot menaruh semuanya di bagian pertama', () => {
    expect(bagiSebanding(9000, [0, 0])).toEqual([9000, 0]);
  });
});

describe('pecahCheckout', () => {
  const vvg: ItemCheckout = {
    productId: 'vvg',
    sku: 'VVG-01',
    entitas: 'SSR',
    qty: 2,
    hargaSatuan: 42_000,
    beratGram: 250,
  };
  const bsr: ItemCheckout = {
    productId: 'bsr',
    sku: 'BSR-01',
    entitas: 'FHI',
    qty: 1,
    hargaSatuan: 95_000,
    beratGram: 250,
  };
  const kkt: ItemCheckout = {
    productId: 'kkt',
    sku: 'KKT-01',
    entitas: 'FHI',
    qty: 1,
    hargaSatuan: 220_000,
    beratGram: 150,
  };

  it('satu entitas = satu order, nilai COD = total', () => {
    const [o, ...lain] = pecahCheckout({
      items: [bsr, kkt],
      metodeBayar: 'cod',
      diskon: 15_000,
      ongkir: 12_000,
    });
    expect(lain).toEqual([]);
    expect(o).toMatchObject({
      entitas: 'FHI',
      subtotal: 315_000,
      diskon: 15_000,
      ongkir: 12_000,
      total: 312_000,
      nilaiCod: 312_000,
      beratGram: 400,
    });
  });

  it('checkout campur dipecah per entitas; diskon per subtotal, ongkir per berat', () => {
    const hasil = pecahCheckout({
      items: [bsr, vvg],
      metodeBayar: 'cod',
      diskon: 10_000,
      ongkir: 20_000,
    });
    expect(hasil.map((o) => o.entitas)).toEqual(['SSR', 'FHI']);
    const [ssr, fhi] = hasil;
    // subtotal 84.000 vs 95.000; berat 500 vs 250
    expect(ssr).toMatchObject({ subtotal: 84_000, diskon: 4693, ongkir: 13_333 });
    expect(fhi).toMatchObject({ subtotal: 95_000, diskon: 5307, ongkir: 6667 });
    expect(ssr!.diskon + fhi!.diskon).toBe(10_000);
    expect(ssr!.ongkir + fhi!.ongkir).toBe(20_000);
    for (const o of hasil) expect(o.nilaiCod).toBe(o.subtotal - o.diskon + o.ongkir);
  });

  it('transfer: nilai COD 0', () => {
    const [o] = pecahCheckout({ items: [vvg], metodeBayar: 'transfer', diskon: 0, ongkir: 9000 });
    expect(o).toMatchObject({ total: 93_000, nilaiCod: 0 });
  });

  it('SKU yang sama digabung', () => {
    const [o] = pecahCheckout({ items: [vvg, vvg], metodeBayar: 'cod', diskon: 0, ongkir: 0 });
    expect(o!.items).toHaveLength(1);
    expect(o!.items[0]).toMatchObject({ qty: 4, subtotal: 168_000 });
  });

  it('menolak diskon melebihi subtotal', () => {
    expect(() =>
      pecahCheckout({ items: [vvg], metodeBayar: 'cod', diskon: 100_000, ongkir: 0 }),
    ).toThrow('Diskon melebihi subtotal');
  });
});

describe('stok', () => {
  it('tersedia tidak pernah negatif', () => {
    expect(tersediaKomponen(10, 3)).toBe(7);
    expect(tersediaKomponen(2, 5)).toBe(0);
  });

  it('paket dihitung dari komponen, dibulatkan ke bawah', () => {
    const tersedia = new Map([['vvg', 7]]);
    expect(tersediaPaket([{ componentId: 'vvg', qty: 2 }], tersedia)).toBe(3);
    expect(tersediaPaket([{ componentId: 'vvg', qty: 3 }], tersedia)).toBe(2);
    expect(tersediaPaket([{ componentId: 'lain', qty: 1 }], tersedia)).toBe(0);
  });

  it('hari cover dan statusnya', () => {
    expect(hariCover(70, 70)).toBe(7);
    expect(hariCover(10, 0)).toBeNull();
    expect(statusCover(70, 7)).toBe('aman');
    expect(statusCover(60, 6)).toBe('waspada');
    expect(statusCover(30, 3)).toBe('kritis');
    expect(statusCover(0, null)).toBe('habis');
    expect(statusCover(5, null)).toBe('belum_ada_penjualan');
  });
});

describe('waktu WIB', () => {
  it('tanggal dan nomor order mengikuti WIB', () => {
    const lewatTengahMalamWib = new Date('2026-10-28T17:30:00Z'); // 29 Okt 00.30 WIB
    expect(tanggalWib(lewatTengahMalamWib)).toBe('2026-10-29');
    expect(nomorOrder(lewatTengahMalamWib, 7)).toBe('GRS-20261029-0007');
    expect(awalHariWib(lewatTengahMalamWib).toISOString()).toBe('2026-10-28T17:00:00.000Z');
  });

  it('tanda SLA resi kuning lewat 18 jam, merah lewat 24 jam', () => {
    const t = new Date('2026-10-28T00:00:00Z');
    const jam = (n: number) => new Date(t.getTime() + n * 3_600_000);
    expect(tandaSlaResi(t, jam(18))).toBe('aman');
    expect(tandaSlaResi(t, jam(19))).toBe('kuning');
    expect(tandaSlaResi(t, jam(25))).toBe('merah');
  });
});

describe('rentangPeriode', () => {
  // 30 Okt 2026, 14.00 WIB
  const sekarang = new Date('2026-10-30T07:00:00Z');
  const iso = (r: { dari: Date; sampai: Date }) => [r.dari.toISOString(), r.sampai.toISOString()];

  it('hari ini dibandingkan kemarin sampai jam yang sama', () => {
    const r = rentangPeriode('hari_ini', sekarang);
    expect(iso(r.ini)).toEqual(['2026-10-29T17:00:00.000Z', '2026-10-30T07:00:00.001Z']);
    expect(iso(r.sebelumnya)).toEqual(['2026-10-28T17:00:00.000Z', '2026-10-29T07:00:00.001Z']);
  });

  it('kemarin satu hari penuh WIB', () => {
    const r = rentangPeriode('kemarin', sekarang);
    expect(iso(r.ini)).toEqual(['2026-10-28T17:00:00.000Z', '2026-10-29T17:00:00.000Z']);
    expect(iso(r.sebelumnya)).toEqual(['2026-10-27T17:00:00.000Z', '2026-10-28T17:00:00.000Z']);
  });

  it('7 hari termasuk hari ini, dibanding 7 hari sebelumnya', () => {
    const r = rentangPeriode('7_hari', sekarang);
    expect(iso(r.ini)[0]).toBe('2026-10-23T17:00:00.000Z');
    expect(iso(r.sebelumnya)).toEqual(['2026-10-16T17:00:00.000Z', '2026-10-23T07:00:00.001Z']);
  });

  it('bulan ini dibanding bulan lalu di tanggal yang sama, tidak melewati akhir bulan', () => {
    const r = rentangPeriode('bulan_ini', sekarang);
    expect(iso(r.ini)[0]).toBe('2026-09-30T17:00:00.000Z');
    expect(iso(r.sebelumnya)[0]).toBe('2026-08-31T17:00:00.000Z');
    // 30 Okt → 30 Sep 14.00 WIB
    expect(iso(r.sebelumnya)[1]).toBe('2026-09-30T07:00:00.001Z');
    // 31 Mar → bulan lalu (Februari) berhenti di akhir Februari.
    const maret = rentangPeriode('bulan_ini', new Date('2026-03-31T07:00:00Z'));
    expect(maret.sebelumnya.sampai.toISOString()).toBe('2026-02-28T17:00:00.000Z');
    // Januari dibanding Desember tahun lalu.
    const jan = rentangPeriode('bulan_ini', new Date('2026-01-10T07:00:00Z'));
    expect(jan.sebelumnya.dari.toISOString()).toBe('2025-11-30T17:00:00.000Z');
  });
});
