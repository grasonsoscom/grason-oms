import type { Izin, Role } from '@grason/shared';

export interface UserSaya {
  id: string;
  email: string;
  nama: string;
  role: Role;
  roleLabel: string;
  izin: Izin[];
}

export class GalatApi extends Error {
  constructor(
    readonly status: number,
    readonly kode: string,
    pesan: string,
  ) {
    super(pesan);
  }
}

/** Ambil pesan dari body galat API ({ error: { kode, pesan } }), dengan cadangan per status. */
export function bacaGalat(status: number, body: unknown): GalatApi {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const e = (body as { error: { kode?: unknown; pesan?: unknown } }).error;
    if (typeof e.kode === 'string' && typeof e.pesan === 'string') {
      return new GalatApi(status, e.kode, e.pesan);
    }
  }
  if (status >= 500)
    return new GalatApi(status, 'kesalahan_server', 'Server sedang bermasalah. Coba lagi.');
  return new GalatApi(status, 'galat', `Permintaan gagal (${status})`);
}

/** Panggil API OMS lewat rewrite /api/v1 (satu origin, cookie sesi ikut). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new GalatApi(0, 'jaringan', 'Tidak dapat terhubung ke server OMS');
  }
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw bacaGalat(res.status, body);
  return body as T;
}
