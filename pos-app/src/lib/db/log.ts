import { getDb } from './index';

/**
 * Log aktivitas Penjualan & Produk.
 *
 * Sebelumnya log cuma $state di masing-masing halaman, jadi hilang begitu kasir
 * pindah menu — padahal gunanya justru menelusuri kesalahan input yang baru
 * disadari belakangan. Sekarang disimpan di SQLite dengan retensi 24 jam.
 *
 * Log digabung untuk semua kasir (tiap baris menyimpan nama pelakunya), supaya
 * admin bisa menelusuri kesalahan siapa pun dari layar yang sama.
 */

export type HalamanLog = 'kasir' | 'produk';

export type LogAktivitas = {
	id: number;
	halaman: HalamanLog;
	pesan: string;
	userNama: string | null;
	waktu: string;
};

type LogRow = {
	id: number;
	halaman: HalamanLog;
	pesan: string;
	user_nama: string | null;
	waktu: string;
};

const BATAS_TAMPIL = 50;

/**
 * Log tidak boleh menggagalkan aksi utamanya. Kalau penulisan log error
 * (mis. DB terkunci), transaksi/penyimpanan produk tetap dianggap berhasil —
 * yang hilang hanya catatannya.
 */
export async function catatLog(
	halaman: HalamanLog,
	pesan: string,
	user: { id: number; nama: string } | null
): Promise<void> {
	try {
		const db = await getDb();
		await db.execute('INSERT INTO log_aktivitas (halaman, pesan, user_id, user_nama) VALUES ($1, $2, $3, $4)', [
			halaman,
			pesan,
			user?.id ?? null,
			user?.nama ?? null
		]);
	} catch (e) {
		console.error('Gagal menulis log aktivitas:', e);
	}
}

export async function listLog(halaman: HalamanLog, limit = BATAS_TAMPIL): Promise<LogAktivitas[]> {
	const db = await getDb();
	const rows = await db.select<LogRow[]>(
		`SELECT id, halaman, pesan, user_nama, waktu
		 FROM log_aktivitas
		 WHERE halaman = $1
		 ORDER BY waktu DESC, id DESC
		 LIMIT $2`,
		[halaman, limit]
	);
	return rows.map((r) => ({
		id: r.id,
		halaman: r.halaman,
		pesan: r.pesan,
		userNama: r.user_nama,
		waktu: r.waktu
	}));
}

/**
 * Retensi 24 jam. Dijalankan sekali tiap app dibuka (di (app)/+layout), bukan
 * lewat timer — konsisten dengan alur auto-backup yang sudah ada di sana.
 *
 * Perbandingannya UTC lawan UTC: kolom waktu diisi datetime('now') yang UTC,
 * jadi jangan pakai 'localtime' di sini.
 */
export async function hapusLogKedaluwarsa(): Promise<void> {
	const db = await getDb();
	await db.execute("DELETE FROM log_aktivitas WHERE waktu < datetime('now', '-24 hours')");
}
