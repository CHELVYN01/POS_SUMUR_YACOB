import { getDb } from './index';
import type { Barang } from '$lib/types';

type BarangRow = {
	id: number;
	nama: string;
	harga: number;
	qty: number | null;
	barcode: string | null;
};

function toBarang(row: BarangRow): Barang {
	return row;
}

export async function listBarang(): Promise<Barang[]> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>('SELECT id, nama, harga, qty, barcode FROM barang ORDER BY nama');
	return rows.map(toBarang);
}

/**
 * Pola pencarian untuk LIKE. Karakter %, _ dan \ yang diketik user harus di-escape,
 * kalau tidak "50%" jadi wildcard dan mencocokkan apa saja.
 */
function polaLike(kata: string): string {
	return '%' + kata.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

const SELECT_BARANG = 'SELECT id, nama, harga, qty, barcode FROM barang';
const FILTER_CARI = "(nama LIKE $1 ESCAPE '\\' OR barcode LIKE $1 ESCAPE '\\')";

/** Jumlah produk yang cocok — dipakai untuk menghitung banyaknya halaman. */
export async function hitungBarang(cari = ''): Promise<number> {
	const db = await getDb();
	const kata = cari.trim();
	const rows = kata
		? await db.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM barang WHERE ${FILTER_CARI}`, [
				polaLike(kata)
			])
		: await db.select<{ n: number }[]>('SELECT COUNT(*) AS n FROM barang');
	return rows[0]?.n ?? 0;
}

/**
 * Satu halaman Daftar Produk. Pencarian dan potongan halamannya dikerjakan di SQL,
 * bukan menarik seluruh produk lalu di-slice di JS — itu yang bikin berat begitu
 * produknya banyak.
 */
export async function listBarangHalaman(
	cari = '',
	limit = 100,
	offset = 0
): Promise<Barang[]> {
	const db = await getDb();
	const kata = cari.trim();
	const rows = kata
		? await db.select<BarangRow[]>(
				`${SELECT_BARANG} WHERE ${FILTER_CARI} ORDER BY nama LIMIT $2 OFFSET $3`,
				[polaLike(kata), limit, offset]
			)
		: await db.select<BarangRow[]>(`${SELECT_BARANG} ORDER BY nama LIMIT $1 OFFSET $2`, [
				limit,
				offset
			]);
	return rows.map(toBarang);
}

/**
 * Produk terlaris untuk daftar pintasan di Kasir — kasir tidak butuh melihat
 * seluruh katalog, yang sering dipakai saja; sisanya lewat pencarian.
 *
 * LEFT JOIN, bukan JOIN: produk yang belum pernah terjual tetap ikut (terjual 0)
 * supaya daftarnya tidak kosong di database baru.
 */
export async function listBarangTerlaris(limit = 30): Promise<Barang[]> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>(
		`SELECT b.id, b.nama, b.harga, b.qty, b.barcode
		 FROM barang b
		 LEFT JOIN item_penjualan ip ON ip.barang_id = b.id
		 GROUP BY b.id
		 ORDER BY COALESCE(SUM(ip.jumlah), 0) DESC, b.nama
		 LIMIT $1`,
		[limit]
	);
	return rows.map(toBarang);
}

/** Pencarian produk di Kasir — menjangkau seluruh katalog, lewat nama maupun barcode. */
export async function cariBarang(cari: string, limit = 50): Promise<Barang[]> {
	const db = await getDb();
	const kata = cari.trim();
	if (!kata) return [];
	const rows = await db.select<BarangRow[]>(
		`${SELECT_BARANG} WHERE ${FILTER_CARI} ORDER BY nama LIMIT $2`,
		[polaLike(kata), limit]
	);
	return rows.map(toBarang);
}

/**
 * Id produk di keranjang yang stoknya sudah habis. Ditanya ke DB saat mau bayar,
 * bukan dibaca dari daftar produk yang tampil — daftar itu sekarang cuma 30 terlaris,
 * jadi tidak bisa lagi dipakai sebagai sumber stok seluruh keranjang.
 *
 * qty NULL berarti stok memang tidak dilacak, itu bukan stok habis.
 */
export async function cariStokHabis(ids: number[]): Promise<number[]> {
	if (ids.length === 0) return [];
	const db = await getDb();
	const params = ids.map((_, i) => `$${i + 1}`).join(', ');
	const rows = await db.select<{ id: number }[]>(
		`SELECT id FROM barang WHERE qty = 0 AND id IN (${params})`,
		ids
	);
	return rows.map((r) => r.id);
}

export async function cariBarangByBarcode(barcode: string): Promise<Barang | null> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>(
		'SELECT id, nama, harga, qty, barcode FROM barang WHERE barcode = $1',
		[barcode]
	);
	return rows[0] ? toBarang(rows[0]) : null;
}

export async function tambahBarang(input: {
	nama: string;
	harga: number;
	qty: number | null;
	barcode: string | null;
}): Promise<number> {
	const db = await getDb();
	const result = await db.execute(
		'INSERT INTO barang (nama, harga, qty, barcode) VALUES ($1, $2, $3, $4)',
		[input.nama, input.harga, input.qty, input.barcode]
	);
	return result.lastInsertId as number;
}

export async function updateBarang(
	id: number,
	input: { nama: string; harga: number; qty: number | null; barcode: string | null }
): Promise<void> {
	const db = await getDb();
	await db.execute('UPDATE barang SET nama = $1, harga = $2, qty = $3, barcode = $4 WHERE id = $5', [
		input.nama,
		input.harga,
		input.qty,
		input.barcode,
		id
	]);
}

export async function hapusBarang(id: number): Promise<void> {
	const db = await getDb();
	await db.execute('DELETE FROM barang WHERE id = $1', [id]);
}

export async function kurangiStokBarang(items: { barangId: number; jumlah: number }[]): Promise<void> {
	const db = await getDb();
	for (const item of items) {
		await db.execute(
			'UPDATE barang SET qty = MAX(qty - $1, 0) WHERE id = $2 AND qty IS NOT NULL',
			[item.jumlah, item.barangId]
		);
	}
}
