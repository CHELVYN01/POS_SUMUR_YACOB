import { getDb } from './index';
import type { BarangTerjual, Ringkasan, TitikGrafik } from '$lib/types';
import type { Periode } from '$lib/utils/periode';

/**
 * Query agregat untuk halaman Laporan.
 *
 * Semua penyaringan tanggal memakai date(tanggal, 'localtime'): kolom tanggal
 * disimpan UTC (DEFAULT datetime('now')), sedangkan batas hari yang dimaksud
 * kasir adalah hari menurut jam mesin toko. Tanpa 'localtime', ±7 jam pertama
 * tiap hari di WIB akan terhitung ke tanggal sebelumnya.
 *
 * Agregasi sengaja dikerjakan di SQL, bukan dengan memuat seluruh riwayat lalu
 * di-reduce di JS — jumlah baris yang kembali tetap kecil berapa pun data tumbuh.
 */

const FILTER = "date(tanggal, 'localtime') BETWEEN $1 AND $2";

type SumRow = { total: number | null; jumlah: number | null };

async function skalar(sql: string, p: Periode): Promise<SumRow> {
	const db = await getDb();
	const rows = await db.select<SumRow[]>(sql, [p.dari, p.sampai]);
	return rows[0] ?? { total: 0, jumlah: 0 };
}

export async function ringkasanPeriode(p: Periode): Promise<Ringkasan> {
	const [jual, bon, bayar] = await Promise.all([
		skalar(
			`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS jumlah
			 FROM penjualan WHERE ${FILTER}`,
			p
		),
		skalar(
			`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS jumlah
			 FROM kasbon WHERE ${FILTER}`,
			p
		),
		skalar(
			`SELECT COALESCE(SUM(jumlah), 0) AS total, COUNT(*) AS jumlah
			 FROM pembayaran_kasbon WHERE ${FILTER}`,
			p
		)
	]);

	const totalPenjualan = jual.total ?? 0;
	const jumlahTransaksi = jual.jumlah ?? 0;

	return {
		totalPenjualan,
		jumlahTransaksi,
		rataRata: jumlahTransaksi > 0 ? Math.round(totalPenjualan / jumlahTransaksi) : 0,
		bonBaru: bon.total ?? 0,
		jumlahBon: bon.jumlah ?? 0,
		bonDibayar: bayar.total ?? 0
	};
}

type HarianRow = { tanggal: string; total: number; jumlah: number };

/**
 * Deret penjualan per hari, sudah dipadatkan sehingga hari tanpa transaksi tetap
 * muncul bernilai 0 — kalau tidak, jarak antar batang di grafik jadi menipu.
 */
export async function penjualanPerHari(p: Periode): Promise<TitikGrafik[]> {
	const db = await getDb();
	const rows = await db.select<HarianRow[]>(
		`SELECT date(tanggal, 'localtime') AS tanggal,
		        COALESCE(SUM(total), 0) AS total,
		        COUNT(*) AS jumlah
		 FROM penjualan
		 WHERE ${FILTER}
		 GROUP BY 1
		 ORDER BY 1`,
		[p.dari, p.sampai]
	);

	const byTanggal = new Map(rows.map((r) => [r.tanggal, r]));
	return deretTanggal(p).map((kunci) => {
		const r = byTanggal.get(kunci);
		return {
			kunci,
			label: labelHari(kunci),
			nilai: r?.total ?? 0,
			jumlah: r?.jumlah ?? 0
		};
	});
}

/** Bon baru (nilai) dan bon dibayar (nilai2) per hari, dalam satu deret. */
export async function bonPerHari(p: Periode): Promise<TitikGrafik[]> {
	const db = await getDb();
	const [bon, bayar] = await Promise.all([
		db.select<HarianRow[]>(
			`SELECT date(tanggal, 'localtime') AS tanggal,
			        COALESCE(SUM(total), 0) AS total,
			        COUNT(*) AS jumlah
			 FROM kasbon WHERE ${FILTER} GROUP BY 1`,
			[p.dari, p.sampai]
		),
		db.select<HarianRow[]>(
			`SELECT date(tanggal, 'localtime') AS tanggal,
			        COALESCE(SUM(jumlah), 0) AS total,
			        COUNT(*) AS jumlah
			 FROM pembayaran_kasbon WHERE ${FILTER} GROUP BY 1`,
			[p.dari, p.sampai]
		)
	]);

	const bonMap = new Map(bon.map((r) => [r.tanggal, r.total]));
	const bayarMap = new Map(bayar.map((r) => [r.tanggal, r.total]));

	return deretTanggal(p).map((kunci) => ({
		kunci,
		label: labelHari(kunci),
		nilai: bonMap.get(kunci) ?? 0,
		nilai2: bayarMap.get(kunci) ?? 0
	}));
}

type JamRow = { jam: string; total: number; jumlah: number };

/** 24 titik penuh (00–23) supaya bentuk grafik jam konsisten sepanjang hari. */
export async function penjualanPerJam(p: Periode): Promise<TitikGrafik[]> {
	const db = await getDb();
	const rows = await db.select<JamRow[]>(
		`SELECT strftime('%H', tanggal, 'localtime') AS jam,
		        COALESCE(SUM(total), 0) AS total,
		        COUNT(*) AS jumlah
		 FROM penjualan
		 WHERE ${FILTER}
		 GROUP BY 1
		 ORDER BY 1`,
		[p.dari, p.sampai]
	);

	const byJam = new Map(rows.map((r) => [r.jam, r]));
	return Array.from({ length: 24 }, (_, i) => {
		const kunci = String(i).padStart(2, '0');
		const r = byJam.get(kunci);
		return {
			kunci,
			label: kunci,
			nilai: r?.total ?? 0,
			jumlah: r?.jumlah ?? 0
		};
	});
}

type BarangRow = { nama: string; total_qty: number; total_nilai: number };

/**
 * Dikelompokkan per `nama`, bukan `barang_id`: barang_id bisa NULL setelah produk
 * dihapus (ON DELETE SET NULL dari migration 0003), sedangkan nama sudah disalin
 * ke baris item saat transaksi dibuat sehingga riwayat tetap terbaca.
 */
export async function barangTerlaris(p: Periode, limit = 10): Promise<BarangTerjual[]> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>(
		`SELECT i.nama AS nama,
		        SUM(i.jumlah) AS total_qty,
		        SUM(i.harga * i.jumlah) AS total_nilai
		 FROM item_penjualan i
		 JOIN penjualan p ON p.id = i.penjualan_id
		 WHERE date(p.tanggal, 'localtime') BETWEEN $1 AND $2
		 GROUP BY i.nama
		 ORDER BY total_qty DESC
		 LIMIT ${Math.max(1, Math.trunc(limit))}`,
		[p.dari, p.sampai]
	);

	return rows.map((r) => ({
		nama: r.nama,
		totalQty: r.total_qty,
		totalNilai: r.total_nilai
	}));
}

/** Semua tanggal dalam periode, inklusif. Dibatasi supaya grafik tidak meledak. */
function deretTanggal(p: Periode, maks = 366): string[] {
	const [y1, m1, d1] = p.dari.split('-').map(Number);
	const [y2, m2, d2] = p.sampai.split('-').map(Number);
	const mulai = new Date(y1, m1 - 1, d1);
	const akhir = new Date(y2, m2 - 1, d2);

	const hasil: string[] = [];
	const cur = new Date(mulai);
	while (cur <= akhir && hasil.length < maks) {
		hasil.push(
			`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
		);
		cur.setDate(cur.getDate() + 1);
	}
	return hasil;
}

function labelHari(kunci: string) {
	const [y, m, d] = kunci.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
