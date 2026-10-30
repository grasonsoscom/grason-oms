// Klien HTTP simulator. CS AI dan Ethix palsu memakai API key dan endpoint kontrak;
// CS manusia palsu login seperti user web dan memakai API dashboard yang sama dengan web.

export class GalatHttp extends Error {
  constructor(
    readonly status: number,
    readonly kode: string,
    pesan: string,
    readonly body: unknown,
  ) {
    super(pesan);
  }
}

export interface OpsiPanggil {
  /** Waktu simulasi; dikirim sebagai X-Sim-Waktu (hanya berlaku di DEMO_MODE). */
  waktu?: Date;
}

type Metode = 'GET' | 'POST' | 'PATCH';

abstract class KlienDasar {
  /** Jumlah permintaan, untuk laporan akhir. */
  jumlah = 0;
  /** false = abaikan opsi waktu (mode langsung memakai jam nyata). */
  kirimWaktu = true;
  /** Versi API (/api/v1, /api/v2). CS AI palsu memakai cs-ai.v2. */
  versi: 1 | 2 = 1;

  constructor(readonly baseUrl: string) {}

  protected abstract kepala(): Record<string, string>;

  async panggil<T>(
    metode: Metode,
    path: string,
    body?: unknown,
    opsi: OpsiPanggil = {},
  ): Promise<T> {
    this.jumlah += 1;
    const res = await fetch(`${this.baseUrl}/api/v${this.versi}${path}`, {
      method: metode,
      headers: {
        'content-type': 'application/json',
        ...this.kepala(),
        ...(opsi.waktu && this.kirimWaktu ? { 'x-sim-waktu': opsi.waktu.toISOString() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const isi: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (isi as { error?: { kode?: string; pesan?: string } } | null)?.error;
      throw new GalatHttp(
        res.status,
        e?.kode ?? 'galat',
        e?.pesan ?? `HTTP ${res.status} ${path}`,
        isi,
      );
    }
    return isi as T;
  }
}

/** Sistem luar dengan API key (CS AI, Ethix). */
export class KlienSistem extends KlienDasar {
  constructor(
    baseUrl: string,
    private readonly kunci: string,
    versi: 1 | 2 = 1,
  ) {
    super(baseUrl);
    this.versi = versi;
  }

  protected kepala() {
    return { 'x-api-key': this.kunci };
  }
}

/** User web (CS manusia, CS Leader) dengan cookie sesi. */
export class KlienUser extends KlienDasar {
  private cookie = '';

  constructor(
    baseUrl: string,
    readonly email: string,
    private readonly password: string,
  ) {
    super(baseUrl);
  }

  async login(): Promise<{ id: string; nama: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) throw new GalatHttp(res.status, 'login_gagal', `Login ${this.email} gagal`, null);
    const sesi = res.headers.getSetCookie().find((c) => c.startsWith('oms_sesi='));
    if (!sesi) throw new GalatHttp(500, 'login_gagal', 'Cookie sesi tidak ada', null);
    this.cookie = sesi.split(';')[0]!;
    return ((await res.json()) as { user: { id: string; nama: string } }).user;
  }

  protected kepala() {
    return { cookie: this.cookie };
  }

  override async panggil<T>(
    metode: Metode,
    path: string,
    body?: unknown,
    opsi?: OpsiPanggil,
  ): Promise<T> {
    try {
      return await super.panggil<T>(metode, path, body, opsi);
    } catch (e) {
      // Sesi kedaluwarsa di mode langsung: login ulang sekali.
      if (e instanceof GalatHttp && e.status === 401) {
        await this.login();
        return super.panggil<T>(metode, path, body, opsi);
      }
      throw e;
    }
  }
}
