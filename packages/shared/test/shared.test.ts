import { describe, expect, it } from 'vitest';
import {
  IZIN,
  IZIN_ROLE,
  ROLE,
  SCOPE,
  SCOPE_SISTEM,
  normalisasiNoWa,
  pastikanRupiah,
  punyaIzin,
  samarkanNoWa,
  samarkanPii,
  scopeValidUntukSistem,
  tampilkanRupiah,
  tampilkanWaktu,
} from '../src';

describe('matriks role', () => {
  it('setiap role hanya memakai izin yang terdaftar', () => {
    for (const role of ROLE) {
      for (const izin of IZIN_ROLE[role]) expect(IZIN).toContain(izin);
    }
  });

  it('hanya Orkestrator yang mengelola user dan API key', () => {
    for (const role of ROLE) {
      expect(punyaIzin(role, 'user.kelola')).toBe(role === 'orkestrator');
      expect(punyaIzin(role, 'apikey.kelola')).toBe(role === 'orkestrator');
    }
  });

  it('tidak ada izin COD, HPP, atau profit; uang di luar OMS', () => {
    expect(IZIN.filter((i) => /^(cod|hpp|profit|asumsi_biaya)\./.test(i))).toEqual([]);
    expect(SCOPE.filter((s) => s.startsWith('cod.'))).toEqual([]);
  });

  it('Finance hanya melihat order dan mengekspor per entitas', () => {
    expect([...IZIN_ROLE.finance].sort()).toEqual(
      ['ekspor.entitas', 'order.lihat_semua', 'produk.lihat'].sort(),
    );
  });

  it('Finance dan PIC Iklan tidak melihat nomor WA dan alamat', () => {
    expect(punyaIzin('finance', 'pelanggan.pii.lihat')).toBe(false);
    expect(punyaIzin('pic_iklan', 'pelanggan.pii.lihat')).toBe(false);
    expect(punyaIzin('sales_ops', 'pelanggan.pii.lihat')).toBe(true);
  });

  it('PIC Iklan tidak punya izin ubah apa pun', () => {
    const ubah = IZIN_ROLE.pic_iklan.filter((i) => !i.endsWith('.lihat') && !i.includes('lihat_'));
    expect(ubah).toEqual([]);
  });
});

describe('scope API key', () => {
  it('scope tiap sistem terdaftar dan tidak tumpang tindih', () => {
    const semua = Object.values(SCOPE_SISTEM).flat();
    for (const s of semua) expect(SCOPE).toContain(s);
    expect(new Set(semua).size).toBe(semua.length);
  });

  it('menolak scope sistem lain', () => {
    expect(scopeValidUntukSistem('cs_ai', ['lead.tulis', 'stok.baca'])).toBe(true);
    expect(scopeValidUntukSistem('cs_ai', ['stok.tulis'])).toBe(false);
    expect(scopeValidUntukSistem('ethix', ['order.tulis'])).toBe(false);
  });
});

describe('nomor WA', () => {
  it.each([
    ['081234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['81234567890', '6281234567890'],
  ])('%s → %s', (masuk, keluar) => {
    expect(normalisasiNoWa(masuk)).toBe(keluar);
  });

  it.each(['0211234567', 'abc', '0812', '+1 555 1234567'])('menolak %s', (masuk) => {
    expect(normalisasiNoWa(masuk)).toBeNull();
  });

  it('menyamarkan nomor dan alamat, kota tetap terlihat', () => {
    expect(samarkanNoWa('6281234567890')).toBe('62812****7890');
    const hasil = samarkanPii({
      noWa: '6281234567890',
      alamat: 'Jl. Mawar 1',
      kelurahan: 'Menteng',
      kecamatan: 'Menteng',
      kota: 'Jakarta Pusat',
      provinsi: 'DKI Jakarta',
      kodePos: '10310',
    });
    expect(hasil.alamat).toBe('[disamarkan]');
    expect(hasil.kodePos).toBe('[disamarkan]');
    expect(hasil.kota).toBe('Jakarta Pusat');
  });
});

describe('uang & waktu', () => {
  it('menolak nilai bukan integer', () => {
    expect(() => pastikanRupiah(1000.5)).toThrow(RangeError);
    expect(pastikanRupiah(95000)).toBe(95000);
  });

  it('format rupiah', () => {
    expect(tampilkanRupiah(95000)).toBe('Rp 95.000');
  });

  it('menampilkan waktu UTC dalam WIB', () => {
    // 07:05 UTC = 14:05 WIB
    expect(tampilkanWaktu(new Date('2026-10-28T07:05:00Z'))).toContain('14.05');
  });
});
