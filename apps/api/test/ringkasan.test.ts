import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buatAppUji,
  isiStok,
  kunciSistem,
  loginSebagai,
  resetData,
  type KonteksUji,
} from './bantuan';

let ctx: KonteksUji;
let csAi: string;
let ethix: string;
let urut = 0;

const JAM = 3_600_000;
const HARI = 24 * JAM;

beforeAll(async () => {
  ctx = await buatAppUji();
});

afterAll(async () => {
  await ctx.app.close();
});

beforeEach(async () => {
  await resetData(ctx.prisma);
  csAi = await kunciSistem(ctx, 'cs_ai');
  ethix = await kunciSistem(ctx, 'ethix');
  await isiStok(ctx, ethix, { 'VVG-01': 50, 'BSR-01': 50, 'KKT-01': 50, 'WUP-01': 50 });
});

/** Lead + order CS AI; kembalikan id order pertama dan id lead. */
async function order(sku: string, opsi: { verifikasi?: boolean } = {}) {
  urut += 1;
  const lead = await ctx
    .http()
    .post('/api/v1/leads')
    .set('X-Api-Key', csAi)
    .send({
      external_id: `r-${urut}`,
      no_wa: `0812555${String(urut).padStart(5, '0')}`,
      sku_ditanya: sku,
      masuk_at: new Date().toISOString(),
    })
    .expect(201);
  const c = await ctx
    .http()
    .post('/api/v1/orders')
    .set('X-Api-Key', csAi)
    .send({
      external_id: `rc-${urut}`,
      lead_id: lead.body.id,
      metode_bayar: 'cod',
      penerima: { nama: 'Uji', no_wa: '081255500000' },
      alamat: { alamat: 'Jl. Uji', kota: 'Bandung', provinsi: 'Jawa Barat' },
      items: [{ sku, qty: 1 }],
    })
    .expect(201);
  const o = c.body.orders[0] as { id: string; nilai_cod: number };
  if (opsi.verifikasi) {
    await ctx
      .http()
      .post(`/api/v1/orders/${o.id}/verifikasi`)
      .set('X-Api-Key', csAi)
      .send({ dikonfirmasi_at: new Date().toISOString(), nilai_cod_dikonfirmasi: o.nilai_cod })
      .expect(200);
  }
  return { id: o.id, leadId: lead.body.id as string };
}

const geser = (ms: number) => new Date(Date.now() - ms);

async function ringkasan(cookie: string, query = '') {
  const res = await ctx
    .http()
    .get(`/api/v1/app/ringkasan${query}`)
    .set('Cookie', cookie)
    .expect(200);
  return res.body;
}

describe('ringkasan', () => {
  it('angka periode dibandingkan dengan periode sebelumnya', async () => {
    const hariIni = await order('BSR-01');
    const kemarin = await order('BSR-01');
    const lama = await order('VVG-01');
    // Pindahkan order dan lead "kemarin" ke kemarin di jam yang sama, "lama" ke 10 hari lalu.
    await ctx.prisma.order.update({ where: { id: kemarin.id }, data: { createdAt: geser(HARI) } });
    await ctx.prisma.lead.update({ where: { id: kemarin.leadId }, data: { masukAt: geser(HARI) } });
    await ctx.prisma.order.update({
      where: { id: lama.id },
      data: { createdAt: geser(10 * HARI) },
    });
    await ctx.prisma.lead.update({
      where: { id: lama.leadId },
      data: { masukAt: geser(10 * HARI) },
    });
    await ctx.prisma.order.update({
      where: { id: hariIni.id },
      data: { status: 'terkirim', terkirimAt: new Date(), total: 100_000 },
    });

    const ops = await loginSebagai(ctx, 'orkestrator');
    const r = await ringkasan(ops);
    expect(r.periode).toMatchObject({
      kode: 'hari_ini',
      label: 'Hari ini',
      leadMasuk: { nilai: 1, sebelumnya: 1 },
      orderDibuat: { nilai: 1, sebelumnya: 1 },
      orderTerkirim: { nilai: 1, sebelumnya: 0 },
      gmvTerkirim: { nilai: 100_000, sebelumnya: 0 },
    });
    const minggu = await ringkasan(ops, '?periode=7_hari');
    expect(minggu.periode.orderDibuat).toEqual({ nilai: 2, sebelumnya: 1 });
    await ctx.http().get('/api/v1/app/ringkasan?periode=tahun').set('Cookie', ops).expect(400);
  });

  it('posisi order aktif tidak melihat tanggal dibuat', async () => {
    const a = await order('BSR-01');
    await order('BSR-01', { verifikasi: true });
    const c = await order('WUP-01', { verifikasi: true });
    await ctx.prisma.order.update({ where: { id: a.id }, data: { createdAt: geser(30 * HARI) } });
    await ctx.prisma.order.update({ where: { id: c.id }, data: { status: 'dikirim' } });

    const r = await ringkasan(await loginSebagai(ctx, 'sales_ops'));
    expect(r.posisi).toEqual({ baru: 1, terverifikasi: 1, di_gudang: 0, dikirim: 1 });
  });

  it('SLA resi dipecah kuning (18–24 jam) dan merah (> 24 jam), sama dengan filter daftar', async () => {
    const kuning = await order('BSR-01', { verifikasi: true });
    const merah = await order('BSR-01', { verifikasi: true });
    await order('BSR-01', { verifikasi: true }); // masih aman
    await ctx.prisma.order.update({
      where: { id: kuning.id },
      data: { terverifikasiAt: geser(20 * JAM) },
    });
    await ctx.prisma.order.update({
      where: { id: merah.id },
      data: { terverifikasiAt: geser(30 * JAM) },
    });

    const ops = await loginSebagai(ctx, 'sales_ops');
    const r = await ringkasan(ops);
    expect(r.tindakan).toMatchObject({ resiKuning: 1, resiMerah: 1, menungguVerifikasi: 0 });
    const daftar = async (sla: string) =>
      (await ctx.http().get(`/api/v1/app/orders?sla=${sla}`).set('Cookie', ops)).body.data.map(
        (o: { id: string }) => o.id,
      );
    expect(await daftar('kuning')).toEqual([kuning.id]);
    expect(await daftar('merah')).toEqual([merah.id]);
    expect((await daftar('terlambat')).sort()).toEqual([kuning.id, merah.id].sort());
  });

  it('lead belum direspon menampilkan umur terlama', async () => {
    const a = await order('BSR-01');
    await order('BSR-01');
    await ctx.prisma.lead.updateMany({ data: { status: 'baru' } });
    await ctx.prisma.lead.update({ where: { id: a.leadId }, data: { masukAt: geser(3 * JAM) } });
    const r = await ringkasan(await loginSebagai(ctx, 'cs_leader'));
    expect(r.tindakan.leadBelumDirespon.jumlah).toBe(2);
    expect(r.tindakan.leadBelumDirespon.umurTerlamaMenit).toBeGreaterThanOrEqual(180);
    expect(r.tindakan.leadBelumDirespon.umurTerlamaMenit).toBeLessThan(182);
  });

  it('filter produk berlaku untuk lead, order, posisi, dan stok', async () => {
    await order('BSR-01');
    await order('VVG-P2');
    const vvg = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'VVG-01' } });
    await isiStok(ctx, ethix, { 'VVG-01': 2 }); // dipesan 2 → habis

    const ops = await loginSebagai(ctx, 'orkestrator');
    const r = await ringkasan(ops, `?produk=${vvg.id}`);
    expect(r.periode.orderDibuat.nilai).toBe(1); // paket VVG-P2 berisi VVG-01
    expect(r.periode.leadMasuk.nilai).toBe(0); // lead menanyakan VVG-P2, bukan VVG-01
    expect(r.posisi.baru).toBe(1);
    expect(r.stok.map((s: { sku: string }) => s.sku)).toEqual(['VVG-01']);

    const leads = await ctx.http().get(`/api/v1/app/leads?produk=${vvg.id}`).set('Cookie', ops);
    expect(leads.body.total).toBe(0);
  });

  it('isi menyesuaikan izin: Finance tanpa lead dan stok, CS hanya datanya sendiri', async () => {
    await order('BSR-01');
    const fin = await ringkasan(await loginSebagai(ctx, 'finance'));
    expect(fin.periode.leadMasuk).toBeNull();
    expect(fin.tindakan.leadBelumDirespon).toBeNull();
    expect(fin.stok).toBeNull();
    expect(fin.periode.orderDibuat.nilai).toBe(1);

    const cs = await ringkasan(await loginSebagai(ctx, 'cs'));
    expect(cs.periode.orderDibuat.nilai).toBe(0);
    expect(cs.tindakan.antrianHandover).toBeNull();
  });
});
