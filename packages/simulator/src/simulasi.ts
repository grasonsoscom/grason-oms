import { Acak } from './acak';
import {
  ALASAN_GAGAL_ANTAR,
  ALASAN_HANDOVER,
  ALASAN_RTS,
  KURIR,
  alamatAcak,
  buatIklan,
  namaAcak,
  noWaAcak,
  type Iklan,
} from './data';
import { GalatHttp, KlienSistem, KlienUser } from './klien';
import type { components as CsAi } from './kontrak/cs-ai.v1';
import type { components as Ethix } from './kontrak/ethix.v1';

type Lead = CsAi['schemas']['Lead'];
type Checkout = CsAi['schemas']['Checkout'];
type OrderBaru = CsAi['schemas']['OrderBaru'];
type Harga = CsAi['schemas']['Harga'];
type OrderEthix = Ethix['schemas']['OrderEthix'];
type EventPengiriman = Ethix['schemas']['EventPengiriman'];
type HasilBatch = Ethix['schemas']['HasilBatch'];

const MENIT = 60_000;
/** API sedang restart (mis. pnpm dev mode watch). */
const apiMati = (e: unknown) => e instanceof TypeError && e.message === 'fetch failed';
const JAM = 60 * MENIT;
const HARI = 24 * JAM;

export interface Peluang {
  /** Lead CS AI yang closing langsung. */
  closing: number;
  gagal: number;
  /** Lead CS AI yang dioper ke CS manusia. */
  handover: number;
  /** Order COD (sisanya transfer). */
  cod: number;
  /** Checkout campur SSR + FHI. */
  campur: number;
  /** Paket yang dikirim berakhir RTS. */
  rts: number;
  /** Lead yang diinput CS manusia (bukan dari CS AI). */
  manual: number;
  /** Pelanggan lama yang kembali. */
  repeat: number;
}

export const PELUANG_DEFAULT: Peluang = {
  closing: 0.45,
  gagal: 0.2,
  handover: 0.12,
  cod: 0.85,
  campur: 0.12,
  rts: 0.12,
  manual: 0.1,
  repeat: 0.08,
};

export interface AkunDemo {
  password: string;
  csLeader: string;
  salesOps?: string;
  cs: string[];
}

export interface OpsiSimulasi {
  baseUrl: string;
  kunci: { csAi: string; ethix: string };
  /** Tanpa akun, bagian CS manusia (handover, lead manual) dilewati. */
  akun?: AkunDemo | null;
  lead: number;
  hari: number;
  seed: number;
  peluang?: Partial<Peluang>;
  /** Stok awal per SKU komponen di gudang Ethix palsu. */
  stokAwal: number;
  sekarang?: Date;
  log?: (pesan: string) => void;
  /** Mode langsung: lanjutkan gudang dari run sebelumnya, bukan stok awal baru. */
  gudang?: KeadaanGudang | null;
  /** Dipanggil di akhir run dan berkala di mode langsung. */
  simpanGudang?: (k: KeadaanGudang) => void;
}

export interface Laporan {
  permintaan: number;
  lead: number;
  leadManual: number;
  handover: number;
  checkout: number;
  order: number;
  terverifikasi: number;
  menungguVerifikasiManusia: number;
  ditolakStok: number;
  batal: number;
  dikirim: number;
  terkirim: number;
  rts: number;
  galat: number;
  masihBerjalan: number;
}

/** Satu langkah gudang Ethix palsu. Berupa data supaya bisa disimpan dan dilanjutkan. */
export interface LangkahEthix {
  waktu: number;
  event: Omit<EventPengiriman, 'event_id' | 'terjadi_at'>;
  /** Stok gudang keluar saat dikirim, masuk saat barang kembali layak jual. */
  stok?: { arah: 'keluar' | 'masuk'; items: { sku: string; qty: number }[] };
}

/**
 * Keadaan gudang Ethix palsu. Ethix sungguhan menyimpan datanya sendiri; simulator
 * menyimpannya di .demo/ supaya mode langsung bisa melanjutkan order dari pengisian mundur.
 */
export interface KeadaanGudang {
  versi: 1;
  stok: Record<string, number>;
  snapshotTerakhir: number;
  resi: number;
  /** Nomor order yang sudah ditarik Ethix. */
  dilihat: string[];
  /** Langkah pengiriman yang sudah dijadwalkan tetapi belum terjadi. */
  tertunda: LangkahEthix[];
}

interface Pelanggan {
  noWa: string;
  nama: string;
  alamat: ReturnType<typeof alamatAcak>;
}

interface Peristiwa {
  waktu: number;
  urut: number;
  jalan: (t: Date) => Promise<void>;
}

/**
 * Simulasi CS AI, Ethix, dan CS manusia palsu. Semua lewat API OMS:
 * CS AI dan Ethix memakai API key + endpoint kontrak, CS manusia login seperti user web.
 *
 * Mode mundur (jalankan): mengisi `hari` hari ke belakang dengan header X-Sim-Waktu
 * (butuh DEMO_MODE=true di API). Peristiwa yang jatuh setelah sekarang tidak dijalankan,
 * jadi sebagian order masih di tengah jalan seperti data sungguhan.
 */
export class Simulasi {
  private readonly a: Acak;
  private readonly p: Peluang;
  private readonly csAi: KlienSistem;
  private readonly ethix: KlienSistem;
  private readonly antrean: Peristiwa[] = [];
  private urut = 0;
  private sekarang: number;
  private katalog: Harga[] = [];
  private iklan: Iklan[] = [];
  private pelanggan: Pelanggan[] = [];
  private stok = new Map<string, number>();
  private snapshotTerakhir = 0;
  private dilihatEthix = new Set<string>();
  private resi = 0;
  private tertunda = new Map<number, LangkahEthix>();
  private idLangkah = 0;
  private leader: KlienUser | null = null;
  private salesOps: KlienUser | null = null;
  private cs: { klien: KlienUser; id: string }[] = [];
  private waktuDicek = false;
  /** Mode langsung: jam nyata, durasi dipercepat, tanpa X-Sim-Waktu. */
  private langsung: { percepat: number } | null = null;
  /** Waktu peristiwa yang sedang dijalankan. */
  private kini = 0;
  readonly laporan: Laporan = {
    permintaan: 0,
    lead: 0,
    leadManual: 0,
    handover: 0,
    checkout: 0,
    order: 0,
    terverifikasi: 0,
    menungguVerifikasiManusia: 0,
    ditolakStok: 0,
    batal: 0,
    dikirim: 0,
    terkirim: 0,
    rts: 0,
    galat: 0,
    masihBerjalan: 0,
  };

  constructor(private readonly o: OpsiSimulasi) {
    this.a = new Acak(o.seed);
    this.p = { ...PELUANG_DEFAULT, ...o.peluang };
    this.csAi = new KlienSistem(o.baseUrl, o.kunci.csAi);
    this.ethix = new KlienSistem(o.baseUrl, o.kunci.ethix);
    this.sekarang = (o.sekarang ?? new Date()).getTime();
  }

  private log(pesan: string): void {
    this.o.log?.(pesan);
  }

  async jalankan(): Promise<Laporan> {
    await this.siapkan();
    const mulai = this.sekarang - this.o.hari * HARI;

    // Gudang Ethix palsu mengirim stok awal sebelum lead pertama.
    this.isiStokAwal();
    this.jadwalkan(mulai - MENIT, (t) => this.kirimStok(t));
    for (let t = mulai; t <= this.sekarang; t += 30 * MENIT)
      this.jadwalkan(t, (w) => this.pollEthix(w));
    for (let t = mulai + 3 * JAM; t <= this.sekarang; t += 3 * JAM)
      this.jadwalkan(t, (w) => this.kirimStok(w));

    for (let i = 0; i < this.o.lead; i += 1) {
      const t = this.waktuLeadAcak(mulai);
      if (this.akunAda() && this.a.peluang(this.p.manual)) {
        this.jadwalkan(t, (w) => this.leadManual(w, i));
      } else {
        this.jadwalkan(t, (w) => this.leadCsAi(w, i));
      }
    }

    await this.prosesSampai(this.sekarang);
    this.o.simpanGudang?.(this.keadaanGudang());
    return this.ringkas();
  }

  /**
   * Mode langsung untuk percobaan berhari-hari: lead baru terus masuk dengan jam nyata.
   * Durasi antarlangkah dibagi `percepat` (60 = satu jam simulasi per menit).
   * Berhenti saat `berhenti` bernilai true (mis. Ctrl+C).
   */
  async jalankanLangsung(opsi: {
    leadPerJam: number;
    percepat: number;
    berhenti: () => boolean;
  }): Promise<Laporan> {
    this.langsung = { percepat: opsi.percepat };
    for (const k of [this.csAi, this.ethix]) k.kirimWaktu = false;
    await this.siapkan();
    for (const k of [this.leader, this.salesOps, ...this.cs.map((c) => c.klien)]) {
      if (k) k.kirimWaktu = false;
    }
    const mulai = Date.now();
    this.kini = mulai;
    if (this.o.gudang) this.pulihkanGudang(this.o.gudang);
    else this.isiStokAwal();
    await this.kirimStok(new Date(mulai));

    const ulang = (setiap: number, jalan: (t: Date) => Promise<void>) => {
      const tik = async (t: Date) => {
        await jalan(t);
        this.jadwalkan(t.getTime() + setiap, tik);
      };
      this.jadwalkan(mulai, tik);
    };
    ulang(30 * MENIT, (t) => this.pollEthix(t));
    ulang(3 * JAM, (t) => this.kirimStok(t));
    let i = 0;
    const leadBerikutnya = async (t: Date) => {
      i += 1;
      await (this.akunAda() && this.a.peluang(this.p.manual)
        ? this.leadManual(t, i)
        : this.leadCsAi(t, i));
      // Jeda acak eksponensial dengan rata-rata 1/leadPerJam jam nyata. jadwalkan()
      // mempercepat setiap jeda, jadi jeda lead dikali `percepat` agar lajunya tetap nyata.
      const jeda = (-Math.log(1 - this.a.angka()) * JAM) / opsi.leadPerJam;
      this.jadwalkan(t.getTime() + jeda * opsi.percepat, leadBerikutnya);
    };
    this.jadwalkan(mulai, leadBerikutnya);

    let disimpan = Date.now();
    while (!opsi.berhenti()) {
      this.sekarang = Date.now();
      await this.prosesSampai(this.sekarang);
      // Disimpan di antara peristiwa, saat tidak ada permintaan yang sedang berjalan.
      if (this.o.simpanGudang && Date.now() - disimpan > 10_000) {
        this.o.simpanGudang(this.keadaanGudang());
        disimpan = Date.now();
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    this.o.simpanGudang?.(this.keadaanGudang());
    return this.ringkas();
  }

  private async prosesSampai(batas: number): Promise<void> {
    while (this.antrean.length > 0 && this.antrean[0]!.waktu <= batas) {
      const ev = this.antrean.shift()!;
      this.kini = ev.waktu;
      try {
        await ev.jalan(new Date(ev.waktu));
      } catch (e) {
        if (this.langsung && apiMati(e)) {
          // API sedang restart: ulangi peristiwa sebentar lagi.
          // Aman diulang karena external_id dan event_id peristiwa yang sama tidak berubah.
          this.log('API tidak bisa dihubungi, dicoba lagi dalam 5 detik');
          this.antrean.unshift({ ...ev, waktu: Date.now() + 5000 });
          this.antrean.sort((x, y) => x.waktu - y.waktu || x.urut - y.urut);
          return;
        }
        if (!(e instanceof GalatHttp)) throw e;
        this.laporan.galat += 1;
        const detail = (e.body as { error?: { detail?: unknown } } | null)?.error?.detail;
        this.log(
          `galat ${e.status} ${e.kode}: ${e.message}${detail ? ` ${JSON.stringify(detail)}` : ''}`,
        );
      }
    }
  }

  private ringkas(): Laporan {
    this.laporan.masihBerjalan = this.antrean.length;
    this.laporan.permintaan =
      this.csAi.jumlah +
      this.ethix.jumlah +
      [this.leader, this.salesOps, ...this.cs.map((c) => c.klien)].reduce(
        (a, k) => a + (k?.jumlah ?? 0),
        0,
      );
    return { ...this.laporan };
  }

  // ─────────────────────────── persiapan ───────────────────────────

  private async siapkan(): Promise<void> {
    const harga = await this.csAi.panggil<{ data: Harga[] }>('GET', '/prices');
    this.katalog = harga.data;
    this.iklan = buatIklan(
      this.a,
      this.katalog.filter((h) => h.tipe === 'satuan').map((h) => h.sku),
    );
    const akun = this.o.akun;
    if (akun) {
      this.leader = new KlienUser(this.o.baseUrl, akun.csLeader, akun.password);
      await this.leader.login();
      if (akun.salesOps) {
        this.salesOps = new KlienUser(this.o.baseUrl, akun.salesOps, akun.password);
        await this.salesOps.login();
      }
      for (const email of akun.cs) {
        const klien = new KlienUser(this.o.baseUrl, email, akun.password);
        const user = await klien.login();
        this.cs.push({ klien, id: user.id });
      }
    }
  }

  /**
   * Stok awal berbeda per SKU (100%, 50%, 25%, 12% dari stokAwal) supaya halaman stok
   * menampilkan status aman, waspada, dan kritis.
   */
  private isiStokAwal(): void {
    const faktor = [1, 0.5, 0.25, 0.12];
    this.komponen().forEach((k, i) =>
      this.stok.set(k.sku, Math.max(1, Math.round(this.o.stokAwal * faktor[i % faktor.length]!))),
    );
  }

  private akunAda(): boolean {
    return this.leader !== null && this.cs.length > 0;
  }

  private komponen(): Harga[] {
    return this.katalog.filter((h) => h.tipe === 'satuan');
  }

  private jadwalkan(waktuSimulasi: number, jalan: Peristiwa['jalan']): void {
    // Mode langsung: jarak dari peristiwa pemicu dipercepat.
    const waktu = this.langsung
      ? this.kini + Math.max(0, waktuSimulasi - this.kini) / this.langsung.percepat
      : waktuSimulasi;
    const ev = { waktu, urut: (this.urut += 1), jalan };
    // Sisip terurut (waktu, lalu urutan dijadwalkan).
    let lo = 0;
    let hi = this.antrean.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = this.antrean[mid]!;
      if (m.waktu < waktu || (m.waktu === waktu && m.urut < ev.urut)) lo = mid + 1;
      else hi = mid;
    }
    this.antrean.splice(lo, 0, ev);
  }

  /** Lead lebih banyak di jam 08–22 WIB. */
  private waktuLeadAcak(mulai: number): number {
    const bobotJam = Array.from(
      { length: 24 },
      (_, j) => [j, j >= 8 && j <= 22 ? (j >= 19 ? 5 : 3) : 0.4] as const,
    );
    // Awal hari WIB pertama: mulai dibulatkan ke 00.00 WIB.
    const awalWib = Math.floor((mulai + 7 * JAM) / HARI) * HARI - 7 * JAM;
    const batas = this.sekarang - MENIT;
    // Jam yang jatuh setelah sekarang (sisa hari ini) diundi ulang, bukan dipaksa ke
    // "sekarang", supaya lead tidak menumpuk di menit terakhir.
    for (let coba = 0; coba < 50; coba += 1) {
      const hari = this.a.antara(0, this.o.hari - 1);
      const jamWib = this.a.pilihBobot<number>(bobotJam);
      const t = awalWib + (hari + 1) * HARI + jamWib * JAM + this.a.antara(0, 59) * MENIT;
      if (t >= mulai && t <= batas) return t;
    }
    return mulai + Math.floor(this.a.angka() * (batas - mulai));
  }

  // ─────────────────────────── CS AI palsu ───────────────────────────

  private pelangganAcak(): Pelanggan {
    if (this.pelanggan.length > 5 && this.a.peluang(this.p.repeat))
      return this.a.pilih(this.pelanggan);
    const baru = { noWa: noWaAcak(this.a), nama: namaAcak(this.a), alamat: alamatAcak(this.a) };
    this.pelanggan.push(baru);
    return baru;
  }

  private async leadCsAi(t: Date, i: number): Promise<void> {
    const c = this.pelangganAcak();
    const kanal = this.a.pilihBobot<'click_to_whatsapp' | 'landing_page' | 'organik'>([
      ['click_to_whatsapp', 7],
      ['landing_page', 2],
      ['organik', 1],
    ]);
    const iklan = kanal === 'organik' ? null : this.a.pilih(this.iklan);
    const sku = iklan?.sku ?? this.a.pilih(this.komponen()).sku;
    const lead = await this.csAi.panggil<Lead>(
      'POST',
      '/leads',
      {
        external_id: `sim-${this.o.seed}-lead-${i}`,
        no_wa: c.noWa,
        nama: c.nama,
        kanal,
        campaign_id: iklan?.campaignId ?? null,
        adset_id: iklan?.adsetId ?? null,
        ad_id: iklan?.adId ?? null,
        sku_ditanya: sku,
        masuk_at: t.toISOString(),
      },
      { waktu: t },
    );
    this.laporan.lead += 1;
    const t0 = t.getTime();

    this.jadwalkan(t0 + this.a.menit(1, 8), (w) =>
      this.csAi.panggil(
        'PATCH',
        `/leads/${lead.id}`,
        { respon_pertama_at: w.toISOString() },
        { waktu: w },
      ),
    );

    const nasib = this.a.pilihBobot<'closing' | 'gagal' | 'handover' | 'follow_up'>([
      ['closing', this.p.closing],
      ['gagal', this.p.gagal],
      ['handover', this.akunAda() ? this.p.handover : 0],
      ['follow_up', Math.max(0, 1 - this.p.closing - this.p.gagal - this.p.handover)],
    ]);
    const ubah = (status: string) => (w: Date) =>
      this.csAi
        .panggil('PATCH', `/leads/${lead.id}`, { status }, { waktu: w })
        .then(() => undefined);

    if (nasib === 'closing') {
      this.jadwalkan(t0 + this.a.menit(10, 180), (w) => this.checkoutCsAi(w, lead.id, c, sku, i));
    } else if (nasib === 'gagal') {
      const fu = t0 + this.a.menit(30, 240);
      this.jadwalkan(fu, ubah('follow_up'));
      this.jadwalkan(fu + this.a.menit(18 * 60, 48 * 60), ubah('gagal'));
    } else if (nasib === 'follow_up') {
      this.jadwalkan(t0 + this.a.menit(30, 240), ubah('follow_up'));
    } else {
      this.jadwalkan(t0 + this.a.menit(5, 40), async (w) => {
        await this.csAi.panggil(
          'PATCH',
          `/leads/${lead.id}`,
          { handover: { alasan: this.a.pilih(ALASAN_HANDOVER), terjadi_at: w.toISOString() } },
          { waktu: w },
        );
        this.laporan.handover += 1;
        // CS Leader membagi; sebagian lead terbaru dibiarkan di antrian untuk demo.
        this.jadwalkan(w.getTime() + this.a.menit(15, 180), (w2) =>
          this.tanganiHandover(w2, lead.id, c, sku),
        );
      });
    }
  }

  private itemAcak(skuUtama: string): { sku: string; qty: number }[] {
    const varian = this.a.pilihBobot<string>([
      [skuUtama, 5],
      [skuUtama.replace(/-01$/, '-P2'), 3.5],
      [skuUtama.replace(/-01$/, '-P3'), 1.5],
    ]);
    const items = [{ sku: varian, qty: this.a.peluang(0.1) ? 2 : 1 }];
    if (this.a.peluang(this.p.campur)) {
      const entitas = this.katalog.find((h) => h.sku === skuUtama)?.entitas;
      const lain = this.komponen().filter((h) => h.entitas !== entitas);
      if (lain.length > 0) items.push({ sku: this.a.pilih(lain).sku, qty: 1 });
    }
    return items.filter((x) => this.katalog.some((h) => h.sku === x.sku));
  }

  private nilaiCheckout(items: { sku: string; qty: number }[]) {
    const subtotal = items.reduce(
      (a, x) => a + (this.katalog.find((h) => h.sku === x.sku)?.harga_jual ?? 0) * x.qty,
      0,
    );
    const ongkir = this.a.antara(9, 25) * 1000;
    const diskon = this.a.peluang(0.2) ? Math.min(subtotal, this.a.pilih([5000, 10000, 15000])) : 0;
    return {
      ongkir,
      diskon,
      metode: this.a.peluang(this.p.cod) ? ('cod' as const) : ('transfer' as const),
    };
  }

  private async checkoutCsAi(
    t: Date,
    leadId: string,
    c: Pelanggan,
    sku: string,
    i: number,
  ): Promise<void> {
    const items = this.itemAcak(sku);
    const n = this.nilaiCheckout(items);
    const body: OrderBaru = {
      external_id: `sim-${this.o.seed}-checkout-${i}`,
      lead_id: leadId,
      metode_bayar: n.metode,
      penerima: { nama: c.nama, no_wa: c.noWa },
      alamat: c.alamat,
      items,
      ongkir: n.ongkir,
      diskon: n.diskon,
    };
    let checkout: Checkout;
    try {
      checkout = await this.csAi.panggil<Checkout>('POST', '/orders', body, { waktu: t });
    } catch (e) {
      if (e instanceof GalatHttp && e.kode === 'stok_tidak_cukup') {
        this.laporan.ditolakStok += 1;
        await this.csAi.panggil('PATCH', `/leads/${leadId}`, { status: 'gagal' }, { waktu: t });
        return;
      }
      throw e;
    }
    this.cekWaktu(checkout.orders[0]!.dibuat_at, t);
    this.laporan.checkout += 1;
    this.laporan.order += checkout.orders.length;

    for (const o of checkout.orders) {
      // Sebagian kecil dibatalkan Sales & Ops atau tertahan tanpa verifikasi (untuk demo).
      if (this.salesOps && this.a.peluang(0.03)) {
        this.jadwalkan(t.getTime() + this.a.menit(20, 240), (w) => this.batal(w, o.id));
        continue;
      }
      if (this.a.peluang(0.04)) continue;
      this.jadwalkan(t.getTime() + this.a.menit(5, 90), async (w) => {
        try {
          await this.csAi.panggil(
            'POST',
            `/orders/${o.id}/verifikasi`,
            { dikonfirmasi_at: w.toISOString(), nilai_cod_dikonfirmasi: o.nilai_cod },
            { waktu: w },
          );
          this.laporan.terverifikasi += 1;
        } catch (e) {
          if (!(e instanceof GalatHttp) || e.kode !== 'perlu_verifikasi_manusia') throw e;
          // Pelanggan riwayat RTS: CS Leader membagi ke CS manusia untuk diverifikasi.
          this.laporan.menungguVerifikasiManusia += 1;
          if (this.akunAda() && this.a.peluang(0.6)) {
            this.jadwalkan(w.getTime() + this.a.menit(30, 240), async (w2) => {
              const cs = this.a.pilih(this.cs);
              await this.leader!.panggil(
                'POST',
                `/app/leads/${leadId}/bagi`,
                { csUserId: cs.id },
                { waktu: w2 },
              );
              this.jadwalkan(w2.getTime() + this.a.menit(10, 120), (w3) =>
                this.verifikasiManusia(w3, cs.klien, o.id, o.nilai_cod),
              );
            });
          }
        }
      });
    }
  }

  /** Waktu order harus mengikuti X-Sim-Waktu; bila tidak, API tidak dalam DEMO_MODE. */
  private cekWaktu(dibuatAt: string, t: Date): void {
    if (this.waktuDicek || this.langsung) return;
    this.waktuDicek = true;
    if (Math.abs(new Date(dibuatAt).getTime() - t.getTime()) > MENIT) {
      throw new Error(
        'API mengabaikan X-Sim-Waktu: set DEMO_MODE=true di .env lalu jalankan ulang API. ' +
          'Tanpa itu semua data tercatat di waktu sekarang.',
      );
    }
  }

  private async batal(t: Date, orderId: string): Promise<void> {
    await this.salesOps!.panggil(
      'POST',
      `/app/orders/${orderId}/batal`,
      {
        alasan: this.a.pilih([
          'Pembeli membatalkan',
          'Order ganda',
          'Pembeli tidak bisa dihubungi',
        ]),
      },
      { waktu: t },
    );
    this.laporan.batal += 1;
  }

  // ─────────────────────────── CS manusia palsu ───────────────────────────

  private async verifikasiManusia(
    t: Date,
    klien: KlienUser,
    orderId: string,
    nilaiCod: number,
  ): Promise<void> {
    await klien.panggil(
      'POST',
      `/app/orders/${orderId}/verifikasi`,
      { nilaiCodDikonfirmasi: nilaiCod },
      { waktu: t },
    );
    this.laporan.terverifikasi += 1;
    this.laporan.menungguVerifikasiManusia -= 1;
  }

  private async tanganiHandover(t: Date, leadId: string, c: Pelanggan, sku: string): Promise<void> {
    // Handover 12 jam terakhir dibiarkan di antrian supaya CS Leader demo punya pekerjaan.
    if (this.sekarang - t.getTime() < 12 * JAM && this.a.peluang(0.7)) return;
    const cs = this.a.pilih(this.cs);
    await this.leader!.panggil(
      'POST',
      `/app/leads/${leadId}/bagi`,
      { csUserId: cs.id },
      { waktu: t },
    );
    this.jadwalkan(t.getTime() + this.a.menit(10, 120), (w) =>
      this.a.peluang(0.65)
        ? this.orderManusia(w, cs.klien, leadId, c, sku)
        : cs.klien
            .panggil('PATCH', `/app/leads/${leadId}`, { status: 'gagal' }, { waktu: w })
            .then(() => undefined),
    );
  }

  private async leadManual(t: Date, i: number): Promise<void> {
    const cs = this.a.pilih(this.cs);
    const c = this.pelangganAcak();
    const sku = this.a.pilih(this.komponen()).sku;
    const lead = await cs.klien.panggil<{ id: string }>(
      'POST',
      '/app/leads',
      {
        noWa: c.noWa,
        nama: c.nama,
        skuDitanya: sku,
        kanal: this.a.pilih(['organik', 'lainnya']),
        catatan: `Lead manual #${i}`,
      },
      { waktu: t },
    );
    this.laporan.lead += 1;
    this.laporan.leadManual += 1;
    const t1 = t.getTime() + this.a.menit(5, 120);
    if (this.a.peluang(0.5)) {
      this.jadwalkan(t1, (w) => this.orderManusia(w, cs.klien, lead.id, c, sku));
    } else {
      this.jadwalkan(t1, (w) =>
        cs.klien
          .panggil(
            'PATCH',
            `/app/leads/${lead.id}`,
            { status: this.a.peluang(0.5) ? 'follow_up' : 'gagal' },
            { waktu: w },
          )
          .then(() => undefined),
      );
    }
  }

  private async orderManusia(
    t: Date,
    klien: KlienUser,
    leadId: string,
    c: Pelanggan,
    sku: string,
  ): Promise<void> {
    const items = this.itemAcak(sku);
    const n = this.nilaiCheckout(items);
    let hasil: { orders: { id: string; total: number }[] };
    try {
      hasil = await klien.panggil(
        'POST',
        '/app/orders',
        {
          leadId,
          metodeBayar: n.metode,
          penerima: { nama: c.nama, noWa: c.noWa },
          alamat: {
            alamat: c.alamat.alamat,
            kecamatan: c.alamat.kecamatan,
            kota: c.alamat.kota,
            provinsi: c.alamat.provinsi,
            kodePos: c.alamat.kode_pos,
          },
          items,
          ongkir: n.ongkir,
          diskon: n.diskon,
        },
        { waktu: t },
      );
    } catch (e) {
      if (e instanceof GalatHttp && e.kode === 'stok_tidak_cukup') {
        this.laporan.ditolakStok += 1;
        return;
      }
      throw e;
    }
    this.laporan.checkout += 1;
    this.laporan.order += hasil.orders.length;
    for (const o of hasil.orders) {
      this.jadwalkan(t.getTime() + this.a.menit(5, 60), async (w) => {
        await klien.panggil(
          'POST',
          `/app/orders/${o.id}/verifikasi`,
          { nilaiCodDikonfirmasi: n.metode === 'cod' ? o.total : 0 },
          { waktu: w },
        );
        this.laporan.terverifikasi += 1;
      });
    }
  }

  // ─────────────────────────── Ethix palsu ───────────────────────────

  /** Tarik order siap kirim (polling, kontrak ethix.v1 GET /ethix/orders). */
  private async pollEthix(t: Date): Promise<void> {
    let kursor: string | null | undefined;
    do {
      const q = `?status=siap_kirim&batas=200${kursor ? `&kursor=${kursor}` : ''}`;
      const res = await this.ethix.panggil<{
        data: OrderEthix[];
        kursor_berikutnya?: string | null;
      }>('GET', `/ethix/orders${q}`, undefined, { waktu: t });
      for (const o of res.data) {
        if (this.dilihatEthix.has(o.order_nomor)) continue;
        this.dilihatEthix.add(o.order_nomor);
        this.jadwalkanPengiriman(t.getTime(), o);
      }
      kursor = res.kursor_berikutnya;
    } while (kursor);
  }

  private jadwalkanPengiriman(t: number, o: OrderEthix): void {
    const nomor = o.order_nomor;
    const ref = `ETX-${nomor.slice(4)}`;
    const items = o.items.map((x) => ({ sku: x.sku, qty: x.qty }));
    const gudang = t + this.a.menit(20, 180);
    const kemas = gudang + this.a.menit(30, 240);
    // Sebagian kecil terlambat terbit resi supaya penanda SLA terlihat.
    const kirim =
      kemas + (this.a.peluang(0.08) ? this.a.menit(20 * 60, 30 * 60) : this.a.menit(30, 600));
    const kurir = this.a.pilih(KURIR);
    this.resi += 1;
    const resi = `${kurir
      .replace(/[^A-Z]/gi, '')
      .slice(0, 3)
      .toUpperCase()}${String(this.resi).padStart(6, '0')}${this.a.digit(4)}`;
    const langkah = (
      waktu: number,
      event: LangkahEthix['event'],
      stok?: LangkahEthix['stok'],
    ): void => this.jadwalkanLangkah(stok ? { waktu, event, stok } : { waktu, event });

    langkah(gudang, { order_nomor: nomor, ethix_ref: ref, jenis: 'diterima_gudang' });
    langkah(kemas, { order_nomor: nomor, ethix_ref: ref, jenis: 'dikemas' });
    langkah(
      kirim,
      {
        order_nomor: nomor,
        ethix_ref: ref,
        jenis: 'dikirim',
        kurir,
        resi,
        status_kurir: 'PICKED_UP',
      },
      { arah: 'keluar', items },
    );

    if (this.a.peluang(this.p.rts)) {
      let t2 = kirim + this.a.menit(24 * 60, 72 * 60);
      const ulang = this.a.peluang(0.5) ? 2 : 1;
      for (let n = 1; n <= ulang; n += 1) {
        langkah(t2, {
          order_nomor: nomor,
          jenis: 'gagal_antar',
          alasan: this.a.pilih(ALASAN_GAGAL_ANTAR),
          percobaan_antar: n,
          status_kurir: 'FAILED_DELIVERY',
        });
        t2 += this.a.menit(20 * 60, 30 * 60);
      }
      langkah(t2, {
        order_nomor: nomor,
        jenis: 'rts',
        alasan:
          o.metode_bayar === 'cod' && this.a.peluang(0.5)
            ? 'COD ditolak penerima'
            : this.a.pilih(ALASAN_RTS),
        ongkir_balik: this.a.antara(8, 15) * 1000,
        status_kurir: 'RETURN_TO_SENDER',
      });
      const kondisi = this.a.pilihBobot<'layak_jual' | 'rusak' | 'tidak_lengkap'>([
        ['layak_jual', 85],
        ['rusak', 10],
        ['tidak_lengkap', 5],
      ]);
      langkah(
        t2 + this.a.menit(48 * 60, 120 * 60),
        { order_nomor: nomor, jenis: 'diterima_kembali', kondisi_barang: kondisi },
        kondisi === 'layak_jual' ? { arah: 'masuk', items } : undefined,
      );
    } else {
      let t2 = kirim + this.a.menit(24 * 60, 96 * 60);
      if (this.a.peluang(0.2)) {
        langkah(t2, {
          order_nomor: nomor,
          jenis: 'gagal_antar',
          alasan: this.a.pilih(ALASAN_GAGAL_ANTAR),
          percobaan_antar: 1,
          status_kurir: 'FAILED_DELIVERY',
        });
        t2 += this.a.menit(20 * 60, 30 * 60);
      }
      langkah(t2, { order_nomor: nomor, jenis: 'terkirim', status_kurir: 'DELIVERED' });
    }
  }

  private jadwalkanLangkah(l: LangkahEthix): void {
    const id = (this.idLangkah += 1);
    this.tertunda.set(id, l);
    this.jadwalkan(l.waktu, async (w) => {
      try {
        await this.jalankanLangkah(w, l);
        this.tertunda.delete(id);
      } catch (e) {
        // API mati: peristiwa diulang, jadi langkahnya tetap tertunda.
        if (!apiMati(e)) this.tertunda.delete(id);
        throw e;
      }
    });
  }

  private async jalankanLangkah(w: Date, l: LangkahEthix): Promise<void> {
    await this.event(w, l.event);
    const jenis = l.event.jenis;
    if (jenis === 'dikirim') this.laporan.dikirim += 1;
    else if (jenis === 'terkirim') this.laporan.terkirim += 1;
    else if (jenis === 'rts') this.laporan.rts += 1;
    if (l.stok) {
      const tanda = l.stok.arah === 'keluar' ? -1 : 1;
      for (const item of l.stok.items)
        this.stok.set(item.sku, (this.stok.get(item.sku) ?? 0) + tanda * item.qty);
      await this.kirimStok(w);
    }
  }

  /** Keadaan gudang untuk disimpan; langkah tertunda urut waktu. */
  keadaanGudang(): KeadaanGudang {
    return {
      versi: 1,
      stok: Object.fromEntries(this.stok),
      snapshotTerakhir: this.snapshotTerakhir,
      resi: this.resi,
      dilihat: [...this.dilihatEthix],
      tertunda: [...this.tertunda.values()].sort((x, y) => x.waktu - y.waktu),
    };
  }

  /**
   * Lanjutkan gudang dari run sebelumnya. Langkah yang waktunya sudah lewat langsung
   * dijalankan berurutan; sisanya dipercepat dari sekarang seperti langkah lain.
   */
  private pulihkanGudang(g: KeadaanGudang): void {
    this.stok = new Map(Object.entries(g.stok));
    for (const k of this.komponen()) {
      if (!this.stok.has(k.sku)) this.stok.set(k.sku, this.o.stokAwal);
    }
    this.snapshotTerakhir = g.snapshotTerakhir;
    this.resi = g.resi;
    this.dilihatEthix = new Set(g.dilihat);
    for (const l of [...g.tertunda].sort((x, y) => x.waktu - y.waktu)) this.jadwalkanLangkah(l);
    this.log(
      `gudang Ethix dilanjutkan: ${g.dilihat.length} order, ${g.tertunda.length} langkah tertunda`,
    );
  }

  private async event(
    t: Date,
    ev: Omit<EventPengiriman, 'event_id' | 'terjadi_at'>,
  ): Promise<void> {
    const body: { events: EventPengiriman[] } = {
      events: [
        {
          event_id: `sim-${this.o.seed}-${ev.order_nomor}-${ev.jenis}-${t.getTime()}`,
          terjadi_at: t.toISOString(),
          ...ev,
        },
      ],
    };
    const hasil = await this.ethix.panggil<HasilBatch>('POST', '/ethix/shipment-events', body, {
      waktu: t,
    });
    for (const g of hasil.gagal) {
      // Order dibatalkan setelah Ethix menariknya: wajar, bukan galat simulasi.
      if (g.error.kode === 'order_batal') continue;
      this.laporan.galat += 1;
      this.log(`event ${ev.jenis} ${ev.order_nomor} ditolak: ${g.error.kode}`);
    }
  }

  /** Snapshot stok gudang palsu. Restock otomatis bila hampir habis. */
  private async kirimStok(t: Date): Promise<void> {
    for (const [sku, qty] of this.stok) {
      if (qty < 5) {
        this.stok.set(sku, qty + this.o.stokAwal);
        this.log(`restock ${sku} +${this.o.stokAwal}`);
      }
    }
    // snapshot_at harus selalu lebih baru dari snapshot sebelumnya.
    const pada = Math.max(t.getTime(), this.snapshotTerakhir + 1);
    this.snapshotTerakhir = pada;
    await this.ethix.panggil<HasilBatch>(
      'POST',
      '/ethix/stock',
      {
        snapshot_at: new Date(pada).toISOString(),
        items: [...this.stok].map(([sku, qty]) => ({ sku, stok_layak_jual: Math.max(0, qty) })),
      },
      { waktu: t },
    );
  }
}
