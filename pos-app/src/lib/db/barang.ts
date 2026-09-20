import { getDb } from './index';
import { listKategori, pastikanKategori } from './kategori';
import type { Barang } from '$lib/types';
import type { BarisProduk, ErrorBaris } from '$lib/export/produk';
import { formatRupiah } from '$lib/utils/format';

type BarangRow = {
	id: number;
	nama: string;
	harga: number;
	harga_beli: number | null;
	qty: number | null;
	barcode: string | null;
	kategori_id: number | null;
	kategori_nama: string | null;
};

function toBarang(row: BarangRow): Barang {
	return {
		id: row.id,
		nama: row.nama,
		harga: row.harga,
		hargaBeli: row.harga_beli,
		qty: row.qty,
		barcode: row.barcode,
		kategoriId: row.kategori_id,
		kategoriNama: row.kategori_nama
	};
}

/**
 * Kolom produk + nama kategorinya. LEFT JOIN, bukan JOIN: produk tanpa kategori
 * (yaitu semua produk lama sesaat setelah upgrade) harus tetap ikut terbaca.
 *
 * Alias `b` dipakai di semua pemanggil supaya klausa WHERE-nya tidak ambigu
 * begitu tabel kedua ikut masuk.
 */
const KOLOM_BARANG = `b.id, b.nama, b.harga, b.harga_beli, b.qty, b.barcode,
	 b.kategori_id, k.nama AS kategori_nama`;
const DARI_BARANG = 'FROM barang b LEFT JOIN kategori k ON k.id = b.kategori_id';

export async function listBarang(): Promise<Barang[]> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>(
		`SELECT ${KOLOM_BARANG} ${DARI_BARANG} ORDER BY b.nama`
	);
	return rows.map(toBarang);
}

/**
 * Pola pencarian untuk LIKE. Karakter %, _ dan \ yang diketik user harus di-escape,
 * kalau tidak "50%" jadi wildcard dan mencocokkan apa saja.
 */
function polaLike(kata: string): string {
	return '%' + kata.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

const SELECT_BARANG = `SELECT ${KOLOM_BARANG} ${DARI_BARANG}`;
const FILTER_CARI = "(b.nama LIKE $1 ESCAPE '\\' OR b.barcode LIKE $1 ESCAPE '\\')";

/** Jumlah produk yang cocok — dipakai untuk menghitung banyaknya halaman. */
export async function hitungBarang(cari = ''): Promise<number> {
	const db = await getDb();
	const kata = cari.trim();
	const rows = kata
		? await db.select<{ n: number }[]>(
				`SELECT COUNT(*) AS n FROM barang b WHERE ${FILTER_CARI}`,
				[polaLike(kata)]
			)
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
				`${SELECT_BARANG} WHERE ${FILTER_CARI} ORDER BY b.nama LIMIT $2 OFFSET $3`,
				[polaLike(kata), limit, offset]
			)
		: await db.select<BarangRow[]>(`${SELECT_BARANG} ORDER BY b.nama LIMIT $1 OFFSET $2`, [
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
		`SELECT ${KOLOM_BARANG}
		 ${DARI_BARANG}
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
		`${SELECT_BARANG} WHERE ${FILTER_CARI} ORDER BY b.nama LIMIT $2`,
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

/**
 * Stok terkini beberapa produk sekaligus, dibaca dari database bukan dari daftar
 * yang tampil di layar — daftar di Kasir cuma 30 terlaris dan stoknya bisa sudah
 * berubah lewat keranjang lain atau halaman Produk.
 *
 * `null` berarti stok memang tidak dilacak, bukan nol.
 */
export async function stokBarang(ids: number[]): Promise<Map<number, number | null>> {
	if (ids.length === 0) return new Map();
	const db = await getDb();
	const params = ids.map((_, i) => `$${i + 1}`).join(', ');
	const rows = await db.select<{ id: number; qty: number | null }[]>(
		`SELECT id, qty FROM barang WHERE id IN (${params})`,
		ids
	);
	return new Map(rows.map((r) => [r.id, r.qty]));
}

/** Produk yang stoknya belum dilacak — tetap boleh dijual walau mode stok ketat. */
export async function hitungBarangTanpaStok(): Promise<number> {
	const db = await getDb();
	const rows = await db.select<{ n: number }[]>(
		'SELECT COUNT(*) AS n FROM barang WHERE qty IS NULL'
	);
	return rows[0]?.n ?? 0;
}

export async function cariBarangByBarcode(barcode: string): Promise<Barang | null> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>(
		`${SELECT_BARANG} WHERE b.barcode = $1`,
		[barcode]
	);
	return rows[0] ? toBarang(rows[0]) : null;
}

export type InputBarang = {
	nama: string;
	harga: number;
	hargaBeli: number | null;
	qty: number | null;
	barcode: string | null;
	/** `null` = tanpa kategori. Bukan kesalahan — produk boleh belum dikelompokkan. */
	kategoriId: number | null;
};

export async function tambahBarang(input: InputBarang): Promise<number> {
	const db = await getDb();
	const result = await db.execute(
		`INSERT INTO barang (nama, harga, harga_beli, qty, barcode, kategori_id)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		[input.nama, input.harga, input.hargaBeli, input.qty, input.barcode, input.kategoriId]
	);
	return result.lastInsertId as number;
}

export async function updateBarang(id: number, input: InputBarang): Promise<void> {
	const db = await getDb();
	await db.execute(
		`UPDATE barang SET nama = $1, harga = $2, harga_beli = $3, qty = $4, barcode = $5,
		        kategori_id = $6
		 WHERE id = $7`,
		[input.nama, input.harga, input.hargaBeli, input.qty, input.barcode, input.kategoriId, id]
	);
}

/** Produk yang harga belinya belum diisi — labanya tidak bisa dihitung. */
export async function hitungBarangTanpaHargaBeli(): Promise<number> {
	const db = await getDb();
	const rows = await db.select<{ n: number }[]>(
		'SELECT COUNT(*) AS n FROM barang WHERE harga_beli IS NULL'
	);
	return rows[0]?.n ?? 0;
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
	/** false = file tanpa kolom Harga Beli; harga beli yang sudah ada tidak disentuh */
	adaKolomHargaBeli: boolean;
	/** false = file tanpa kolom Kategori; kategori yang sudah ada tidak disentuh */
	adaKolomKategori: boolean;
	/** Nama kategori di file yang belum terdaftar — akan dibuat saat import dijalankan. */
	kategoriBaru: string[];
};

function bedaProduk(
	sebelum: Barang,
	baris: BarisProduk,
	adaKolomHargaBeli: boolean,
	adaKolomKategori: boolean
): string[] {
	const perubahan: string[] = [];
	if (sebelum.nama !== baris.nama) perubahan.push(`nama: "${sebelum.nama}" → "${baris.nama}"`);
	if (sebelum.harga !== baris.harga) {
		perubahan.push(`harga jual: ${formatRupiah(sebelum.harga)} → ${formatRupiah(baris.harga)}`);
	}
	// Kolomnya tidak ada di file = tidak ada yang diminta berubah, bukan "dikosongkan".
	if (adaKolomHargaBeli && sebelum.hargaBeli !== baris.hargaBeli) {
		const dari = sebelum.hargaBeli === null ? '-' : formatRupiah(sebelum.hargaBeli);
		const ke = baris.hargaBeli === null ? '-' : formatRupiah(baris.hargaBeli);
		perubahan.push(`harga beli: ${dari} → ${ke}`);
	}
	if (sebelum.qty !== baris.qty) {
		perubahan.push(`stok: ${sebelum.qty ?? '-'} → ${baris.qty ?? '-'}`);
	}
	if ((sebelum.barcode ?? '') !== baris.barcode) {
		perubahan.push(`barcode: ${sebelum.barcode ?? '-'} → ${baris.barcode}`);
	}
	// Sama seperti Harga Beli: kolom yang tidak ada di file berarti tidak ada yang
	// diminta berubah, bukan "kategorinya dikosongkan".
	if (adaKolomKategori && (sebelum.kategoriNama ?? '') !== (baris.kategori ?? '')) {
		perubahan.push(`kategori: ${sebelum.kategoriNama ?? '-'} → ${baris.kategori ?? '-'}`);
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
	errorParse: ErrorBaris[] = [],
	adaKolomHargaBeli = true,
	adaKolomKategori = true
): Promise<RencanaImport> {
	const semua = await listBarang();
	const byId = new Map(semua.map((b) => [b.id, b]));
	const byBarcode = new Map(semua.filter((b) => b.barcode).map((b) => [b.barcode as string, b]));

	// Kategori yang diketik di file tapi belum terdaftar disebut di pratinjau, supaya
	// user melihat dulu daftar kategori yang akan lahir — salah ketik satu huruf
	// bikin kategori kembar yang memecah angka laporannya.
	const kategoriAda = new Set((await listKategori()).map((k) => k.nama.toLowerCase()));
	const kategoriBaru = new Set<string>();
	if (adaKolomKategori) {
		for (const b of baris) {
			const nama = b.kategori?.trim();
			if (nama && !kategoriAda.has(nama.toLowerCase())) kategoriBaru.add(nama);
		}
	}

	const rencana: RencanaImport = {
		baru: [],
		ubah: [],
		sama: 0,
		error: [...errorParse],
		adaKolomHargaBeli,
		adaKolomKategori,
		kategoriBaru: [...kategoriBaru].sort()
	};

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

		const perubahan = bedaProduk(target, b, adaKolomHargaBeli, adaKolomKategori);
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

	// Kategori dibuat sekali di depan lalu dipetakan, bukan dicari ulang tiap baris:
	// file berisi ratusan baris hanya punya segelintir kategori, dan `pastikanKategori`
	// per baris berarti ratusan query yang sama berulang-ulang.
	const idKategori = new Map<string, number | null>();
	if (rencana.adaKolomKategori) {
		const namaDipakai = new Set<string>();
		for (const b of [...rencana.baru, ...rencana.ubah.map((u) => u.baris)]) {
			const nama = b.kategori?.trim();
			if (nama) namaDipakai.add(nama);
		}
		for (const nama of namaDipakai) {
			try {
				idKategori.set(nama.toLowerCase(), await pastikanKategori(nama));
			} catch (e) {
				console.error('Gagal menyiapkan kategori saat import:', e);
				idKategori.set(nama.toLowerCase(), null);
			}
		}
	}

	/**
	 * Kategori untuk satu baris. File tanpa kolom Kategori tidak boleh menghapus
	 * pengelompokan yang sudah dirapikan lewat aplikasi, jadi nilai lama dipakai.
	 */
	function kategoriUntuk(baris: BarisProduk, lama: number | null): number | null {
		if (!rencana.adaKolomKategori) return lama;
		const nama = baris.kategori?.trim();
		if (!nama) return null;
		return idKategori.get(nama.toLowerCase()) ?? lama;
	}

	for (const u of rencana.ubah) {
		try {
			await updateBarang(u.sebelum.id, {
				nama: u.baris.nama,
				harga: u.baris.harga,
				// File tanpa kolom Harga Beli tidak boleh menghapus yang sudah tersimpan.
				hargaBeli: rencana.adaKolomHargaBeli ? u.baris.hargaBeli : u.sebelum.hargaBeli,
				qty: u.baris.qty,
				barcode: u.baris.barcode,
				kategoriId: kategoriUntuk(u.baris, u.sebelum.kategoriId)
			});
			hasil.ubah += 1;
		} catch (e) {
			console.error('Gagal mengubah produk saat import:', e);
			hasil.gagal.push({ baris: u.baris.baris, pesan: `gagal mengubah "${u.baris.nama}"` });
		}
	}

	for (const b of rencana.baru) {
		try {
			await tambahBarang({
				nama: b.nama,
				harga: b.harga,
				hargaBeli: b.hargaBeli,
				qty: b.qty,
				barcode: b.barcode,
				kategoriId: kategoriUntuk(b, null)
			});
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
