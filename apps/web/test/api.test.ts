import { describe, expect, it } from 'vitest';
import { bacaGalat } from '../lib/api';

describe('bacaGalat', () => {
  it('memakai pesan dari body galat API', () => {
    const g = bacaGalat(401, {
      error: { kode: 'tidak_terautentikasi', pesan: 'Email atau password salah' },
    });
    expect(g.status).toBe(401);
    expect(g.kode).toBe('tidak_terautentikasi');
    expect(g.message).toBe('Email atau password salah');
  });

  it('pesan cadangan bila body bukan format galat', () => {
    expect(bacaGalat(502, '<html>').message).toBe('Server sedang bermasalah. Coba lagi.');
    expect(bacaGalat(404, null).message).toBe('Permintaan gagal (404)');
  });
});
