const JENDELA_MS = 60_000;

/**
 * Rate limit per API key dengan jendela geser 60 detik, di memori proses API.
 * Cukup untuk satu instance (Fase 1–3); bila API dijalankan lebih dari satu instance,
 * pindahkan hitungannya ke Redis.
 */
export class PembatasLaju {
  private readonly catatan = new Map<string, number[]>();

  constructor(private readonly batasPerMenit: number) {}

  /** Catat satu permintaan. Kembalikan null bila boleh, atau detik tunggu bila melewati batas. */
  ambil(kunci: string, sekarang = Date.now()): number | null {
    if (this.batasPerMenit <= 0) return null;
    const batasLama = sekarang - JENDELA_MS;
    const waktu = (this.catatan.get(kunci) ?? []).filter((t) => t > batasLama);
    if (waktu.length >= this.batasPerMenit) {
      this.catatan.set(kunci, waktu);
      return Math.max(1, Math.ceil((waktu[0]! + JENDELA_MS - sekarang) / 1000));
    }
    waktu.push(sekarang);
    this.catatan.set(kunci, waktu);
    return null;
  }
}
