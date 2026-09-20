import { getDb } from './index';

/**
 * Pengaturan aplikasi bentuk kunci-nilai (tabel `pengaturan`, migration 0006).
 *
 * Beda dengan nama & alamat toko yang tinggal di localStorage: yang di sini adalah
 * aturan yang menentukan boleh-tidaknya transaksi terjadi, jadi harus ikut terbawa
 * Backup/Restore dan sama untuk semua kasir di satu database.
 */

export async function bacaPengaturan(kunci: string): Promise<string | null> {
	const db = await getDb();
	const rows = await db.select<{ nilai: string }[]>(
		'SELECT nilai FROM pengaturan WHERE kunci = $1',
		[kunci]
	);
	return rows[0]?.nilai ?? null;
}

export async function simpanPengaturan(kunci: string, nilai: string): Promise<void> {
	const db = await getDb();
	await db.execute(
		`INSERT INTO pengaturan (kunci, nilai, updated_at) VALUES ($1, $2, datetime('now'))
		 ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai, updated_at = excluded.updated_at`,
		[kunci, nilai]
	);
}

export const KUNCI_STOK_LONGGAR = 'stok_longgar';

/**
 * true = stok longgar (stok 0 tetap boleh dijual, stok opsional saat input).
 * Nilai yang belum pernah tersimpan dianggap longgar — sama dengan perilaku
 * aplikasi sebelum pengaturan ini ada, jadi upgrade tidak mengubah apa pun sendiri.
 */
export async function bacaStokLonggar(): Promise<boolean> {
	return (await bacaPengaturan(KUNCI_STOK_LONGGAR)) !== '0';
}

export async function simpanStokLonggar(longgar: boolean): Promise<void> {
	await simpanPengaturan(KUNCI_STOK_LONGGAR, longgar ? '1' : '0');
}

export const KUNCI_LAPORAN_KASIR_HARI_INI = 'laporan_kasir_hari_ini';

/**
 * true = user non-admin hanya boleh melihat laporan hari ini.
 *
 * Kebalikan dari stok: nilai yang belum pernah tersimpan dianggap TIDAK dibatasi,
 * supaya upgrade aplikasi tidak menutup sendiri halaman yang kemarin masih terbuka.
 */
export async function bacaLaporanKasirHariIni(): Promise<boolean> {
	return (await bacaPengaturan(KUNCI_LAPORAN_KASIR_HARI_INI)) === '1';
}

export async function simpanLaporanKasirHariIni(batasi: boolean): Promise<void> {
	await simpanPengaturan(KUNCI_LAPORAN_KASIR_HARI_INI, batasi ? '1' : '0');
}
