import { describe, expect, it } from 'vitest';
import { perbandingan, queryString, umur } from '../lib/format';

describe('perbandingan', () => {
  it('naik, turun, sama, dan tanpa pembanding', () => {
    expect(perbandingan(125, 100)).toEqual({ arah: 'naik', teks: '▲ 25%' });
    expect(perbandingan(50, 200)).toEqual({ arah: 'turun', teks: '▼ 75%' });
    expect(perbandingan(7, 7)).toEqual({ arah: 'sama', teks: '= 0%' });
    expect(perbandingan(3, 0)).toEqual({ arah: 'baru', teks: 'baru' });
    expect(perbandingan(0, 0)).toEqual({ arah: 'kosong', teks: '–' });
  });
});

describe('umur', () => {
  it('menit, jam, dan hari', () => {
    expect(umur(45)).toBe('45 mnt');
    expect(umur(120)).toBe('2 jam');
    expect(umur(200)).toBe('3 jam 20 mnt');
    expect(umur(3000)).toBe('2 hari 2 jam');
  });
});

describe('queryString', () => {
  it('membuang nilai kosong', () => {
    expect(queryString({ status: 'baru', produk: '', halaman: undefined })).toBe('?status=baru');
    expect(queryString({})).toBe('');
  });
});
