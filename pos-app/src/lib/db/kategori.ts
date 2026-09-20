import { getDb } from './index';
import type { Kategori } from '$lib/types';

/**
 * Kategori produk (migration 0008).
 *
 * Tabelnya sengaja tabel tersendiri, bukan kolom teks bebas di `barang`: dengan
 * teks bebas, "Rokok", "rokok" dan "Rokok " jadi tiga kelompok berbeda di laporan
 * dan pemisahan uang yang jadi alasan fitur ini justru gagal.
 */

type KategoriRow = { id: number; nama: string; jumlah_produk: number };

export async function listKategori(): Promise<Kategori[]> {
	const db = await getDb();
	const rows = await db.select<KategoriRow[]>(
		`SELECT k.id, k.nama, COUNT(b.id) AS jumlah_produk
		 FROM kategori k
		 LEFT JOIN barang b ON b.kategori_id = k.id
		 GROUP BY k.id
		 ORDER BY k.nama`
	);
	return rows.map((r) => ({ id: r.id, nama: r.nama, jumlahProduk: r.jumlah_produk }));
}

export async function tambahKategori(nama: string): Promise<number> {
	const db = await getDb();
	const result = await db.execute('INSERT INTO kategori (nama) VALUES ($1)', [nama.trim()]);
	return result.lastInsertId as number;
}

export async function ubahKategori(id: number, nama: string): Promise<void> {
	const db = await getDb();
	await db.execute('UPDATE kategori SET nama = $1 WHERE id = $2', [nama.trim(), id]);
}

/**
 * Menghapus kategori TIDAK menghapus produknya — kolom `barang.kategori_id` punya
 * ON DELETE SET NULL, jadi produknya cuma kembali tak berkategori. Riwayat
 * penjualan juga tidak tersentuh: kategorinya sudah disalin ke baris transaksi.
 */
export async function hapusKategori(id: number): Promise<void> {
	const db = await getDb();
	await db.execute('DELETE FROM kategori WHERE id = $1', [id]);
}

/** Nama yang sudah dipakai kategori lain — dicegat sebelum SQLite menolaknya mentah. */
export async function cariKategoriByNama(nama: string): Promise<Kategori | null> {
	const db = await getDb();
	const rows = await db.select<{ id: number; nama: string }[]>(
		'SELECT id, nama FROM kategori WHERE nama = $1 COLLATE NOCASE',
		[nama.trim()]
	);
	return rows[0] ? { id: rows[0].id, nama: rows[0].nama, jumlahProduk: 0 } : null;
}

/** Produk yang belum punya kategori — dipakai Pengaturan untuk mengingatkan. */
export async function hitungBarangTanpaKategori(): Promise<number> {
	const db = await getDb();
	const rows = await db.select<{ n: number }[]>(
		'SELECT COUNT(*) AS n FROM barang WHERE kategori_id IS NULL'
	);
	return rows[0]?.n ?? 0;
}

/**
 * Mencari kategori berdasarkan nama, membuatnya kalau belum ada. Dipakai import
 * Excel: pemilik toko mengetik nama kategori langsung di file, dan menolak baris
 * hanya karena kategorinya belum terdaftar cuma memindahkan pekerjaan.
 *
 * Pencocokannya NOCASE supaya "rokok" tidak melahirkan kategori kedua di samping
 * "Rokok" yang sudah ada.
 */
export async function pastikanKategori(nama: string): Promise<number | null> {
	const bersih = nama.trim();
	if (!bersih) return null;
	const ada = await cariKategoriByNama(bersih);
	if (ada) return ada.id;
	return await tambahKategori(bersih);
}
