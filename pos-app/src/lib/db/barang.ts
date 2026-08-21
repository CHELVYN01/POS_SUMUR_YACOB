import { getDb } from './index';
import type { Barang } from '$lib/types';
import type { BarisProduk, ErrorBaris } from '$lib/export/produk';
import { formatRupiah } from '$lib/utils/format';

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

// --- Import produk dari Excel -------------------------------------------------

export type PerubahanBarang = {
	baris: BarisProduk;
	sebelum: Barang;
	/** ringkasan "harga: Rp1.000 → Rp1.200" untuk ditampilkan di pratinjau */
	perubahan: string[];
};

export type RencanaImport = {
	baru: BarisProduk[];
	ubah: PerubahanBarang[];
	/** baris yang isinya persis sama dengan yang di database — tidak perlu ditulis ulang */
	sama: number;
	error: ErrorBaris[];
};

function bedaProduk(sebelum: Barang, baris: BarisProduk): string[] {
	const perubahan: string[] = [];
	if (sebelum.nama !== baris.nama) perubahan.push(`nama: "${sebelum.nama}" → "${baris.nama}"`);
	if (sebelum.harga !== baris.harga) {
		perubahan.push(`harga: ${formatRupiah(sebelum.harga)} → ${formatRupiah(baris.harga)}`);
	}
	if (sebelum.qty !== baris.qty) {
		perubahan.push(`stok: ${sebelum.qty ?? '-'} → ${baris.qty ?? '-'}`);
	}
	if ((sebelum.barcode ?? '') !== baris.barcode) {
		perubahan.push(`barcode: ${sebelum.barcode ?? '-'} → ${baris.barcode}`);
	}
	return perubahan;
}

/**
 * Mencocokkan baris Excel dengan produk yang ada, tanpa menulis apa pun — hasilnya
 * dipakai untuk pratinjau supaya user melihat dulu apa yang akan berubah.
 *
 * Pencocokan pakai ID lebih dulu, lalu barcode. ID yang tidak ketemu TIDAK dianggap
 * error melainkan jatuh ke pencocokan barcode: file backup dari mesin lain punya
 * urutan ID yang berbeda, dan menolak semua barisnya akan bikin fitur ini tak berguna
 * justru di kasus yang paling membutuhkannya.
 *
 * Produk yang barisnya tidak ada di file dibiarkan apa adanya — import hanya
 * menambah dan mengubah, tidak pernah menghapus.
 */
export async function siapkanImportBarang(
	baris: BarisProduk[],
	errorParse: ErrorBaris[] = []
): Promise<RencanaImport> {
	const semua = await listBarang();
	const byId = new Map(semua.map((b) => [b.id, b]));
	const byBarcode = new Map(semua.filter((b) => b.barcode).map((b) => [b.barcode as string, b]));

	const rencana: RencanaImport = { baru: [], ubah: [], sama: 0, error: [...errorParse] };

	for (const b of baris) {
		const target = (b.id !== null ? byId.get(b.id) : undefined) ?? byBarcode.get(b.barcode);

		if (!target) {
			rencana.baru.push(b);
			continue;
		}

		// barcode UNIQUE di database: kalau baris ini mau memakai barcode milik produk
		// lain, INSERT/UPDATE-nya pasti gagal — lebih baik ditolak di sini dengan pesan
		// yang menyebut produknya daripada muncul sebagai error SQLite mentah
		const pemilik = byBarcode.get(b.barcode);
		if (pemilik && pemilik.id !== target.id) {
			rencana.error.push({
				baris: b.baris,
				pesan: `barcode ${b.barcode} sudah dipakai produk "${pemilik.nama}"`
			});
			continue;
		}

		const perubahan = bedaProduk(target, b);
		if (perubahan.length === 0) rencana.sama += 1;
		else rencana.ubah.push({ baris: b, sebelum: target, perubahan });
	}

	return rencana;
}

export type HasilImport = { baru: number; ubah: number; gagal: ErrorBaris[] };

/**
 * Menjalankan rencana. Update dulu baru insert: kalau ada barcode yang berpindah
 * antar produk, pelepasannya harus terjadi sebelum ada yang memakainya.
 *
 * Kegagalan per baris dikumpulkan, bukan menghentikan sisanya — pada file berisi
 * ratusan baris, satu baris bermasalah tidak boleh membatalkan yang lain
 * (tidak ada transaksi tunggal di sini karena tauri-plugin-sql memakai pool koneksi,
 * BEGIN/COMMIT tidak dijamin mendarat di koneksi yang sama).
 */
export async function terapkanImportBarang(rencana: RencanaImport): Promise<HasilImport> {
	const hasil: HasilImport = { baru: 0, ubah: 0, gagal: [] };

	for (const u of rencana.ubah) {
		try {
			await updateBarang(u.sebelum.id, {
				nama: u.baris.nama,
				harga: u.baris.harga,
				qty: u.baris.qty,
				barcode: u.baris.barcode
			});
			hasil.ubah += 1;
		} catch (e) {
			console.error('Gagal mengubah produk saat import:', e);
			hasil.gagal.push({ baris: u.baris.baris, pesan: `gagal mengubah "${u.baris.nama}"` });
		}
	}

	for (const b of rencana.baru) {
		try {
			await tambahBarang({ nama: b.nama, harga: b.harga, qty: b.qty, barcode: b.barcode });
			hasil.baru += 1;
		} catch (e) {
			console.error('Gagal menambah produk saat import:', e);
			const pesan = String(e).includes('UNIQUE')
				? `barcode ${b.barcode} sudah dipakai produk lain`
				: `gagal menambah "${b.nama}"`;
			hasil.gagal.push({ baris: b.baris, pesan });
		}
	}

	return hasil;
}
