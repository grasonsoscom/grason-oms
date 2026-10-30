/** PRNG deterministik (mulberry32): seed sama = data sama. */
export class Acak {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** 0 ≤ x < 1 */
  angka(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer min..maks (inklusif). */
  antara(min: number, maks: number): number {
    return min + Math.floor(this.angka() * (maks - min + 1));
  }

  peluang(p: number): boolean {
    return this.angka() < p;
  }

  pilih<T>(daftar: readonly T[]): T {
    return daftar[Math.floor(this.angka() * daftar.length)]!;
  }

  /** Pilih menurut bobot. */
  pilihBobot<T>(daftar: readonly (readonly [T, number])[]): T {
    const total = daftar.reduce((a, [, b]) => a + b, 0);
    let r = this.angka() * total;
    for (const [nilai, bobot] of daftar) {
      r -= bobot;
      if (r < 0) return nilai;
    }
    return daftar.at(-1)![0];
  }

  /** Durasi acak dalam menit → milidetik. */
  menit(min: number, maks: number): number {
    return this.antara(min * 60, maks * 60) * 1000;
  }

  digit(n: number): string {
    let s = '';
    for (let i = 0; i < n; i += 1) s += String(this.antara(0, 9));
    return s;
  }
}
